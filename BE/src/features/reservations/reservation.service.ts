import { Types, type ClientSession } from 'mongoose';
import type { AccessMethod, CancellationReason, PaymentMethod, Reservation } from '@ssm/shared';
import {
  FacilityModel, PaymentModel, RentalContractModel, ReservationModel, StorageUnitModel, UnitTypeModel, UserModel,
  type ReservationHydrated, type UserHydrated,
} from '../../shared/db/models';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess, assertFacility } from '../../shared/http/scope';
import { availability } from '../facilities/availability';
import { cancellationRefund, effectivePolicy, quote } from '../policies/pricing';
import { addDays, addMonthsUTC, todayUTC, toDateOnly } from '../../shared/utils/dates';
import { audit } from '../audit/audit.service';
import { withTxn } from '../../shared/db/txn';
import { createPayment, randomToken, sha256, sixDigitPin } from '../payments/payment.service';

const loadReservation = async (id: string, session?: ClientSession) => {
  const r = await ReservationModel.findById(id).session(session ?? null);
  if (!r) throw NotFound('đặt chỗ');
  return r;
};

// ---------------------------------------------------------------- create (CUSTOMER)
export async function createReservation(user: UserHydrated, input: { unitTypeId: string; startDate: string; months: number; source: Reservation['source']; idempotencyKey?: string }) {
  if (user.status !== 'ACTIVE') throw Forbidden('Tài khoản chưa được kích hoạt', 'ACCOUNT_INACTIVE');

  // Retry-safe: same customer + same key returns the original booking instead of a duplicate.
  if (input.idempotencyKey) {
    const existing = await ReservationModel.findOne({ customerId: user._id, idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
  }
  const start = toDateOnly(input.startDate);
  if (start < todayUTC()) throw Unprocessable('Ngày bắt đầu không được ở quá khứ');
  if (start > addDays(todayUTC(), 90)) throw Unprocessable('Chỉ nhận đặt trước tối đa 90 ngày');

  return withTxn(async (session) => {
    const ut = await UnitTypeModel.findOne({ _id: input.unitTypeId, isActive: true }).session(session);
    if (!ut) throw NotFound('loại kho');
    const facility = await FacilityModel.findById(ut.facilityId).session(session);
    if (!facility || facility.status !== 'ACTIVE') throw Unprocessable('Chi nhánh chưa nhận đặt chỗ');
    const policy = await effectivePolicy(facility._id, session);
    const minM = Math.max(policy.minRentalMonths, ut.minRentalMonths);
    if (input.months < minM || input.months > policy.maxRentalMonths) throw Unprocessable(`Thời hạn thuê phải từ ${minM} đến ${policy.maxRentalMonths} tháng`);

    // Serialization point: every booking/allocation of this type writes this doc, so two concurrent
    // transactions conflict (WriteConflict → driver retries the loser, which then re-counts).
    await UnitTypeModel.updateOne({ _id: ut._id }, { $inc: { inventoryVersion: 1 } }, { session });

    const avail = await availability(facility._id, ut._id, start, input.months, session);
    if (avail.available <= 0) throw Conflict('Loại kho này đã hết chỗ trong khoảng thời gian bạn chọn', 'SOLD_OUT');

    const q = quote(ut, policy, input.months);
    const id = new Types.ObjectId();
    const deposit = await createPayment({ facilityId: facility._id, customerId: user._id, reservationId: id, type: 'DEPOSIT', amount: q.depositAmount, status: 'PENDING', method: 'VNPAY' }, session);
    const [r] = await ReservationModel.create([{
      _id: id, facilityId: facility._id, customerId: user._id, unitTypeId: ut._id, status: 'PENDING',
      startDate: start, durationMonths: input.months, endDate: addMonthsUTC(start, input.months), quote: q,
      holdExpiresAt: new Date(Date.now() + policy.reservationHoldMinutes * 60_000),
      depositPaymentId: deposit._id, source: input.source, idempotencyKey: input.idempotencyKey ?? null,
    }], { session });
    await audit({ action: 'reservation.create', entityType: 'Reservation', entityId: id, facilityId: facility._id, changes: { after: { code: r.code, unitType: ut.code, months: input.months } } }, session);
    return r;
  });
}

// ---------------------------------------------------------------- deposit (mock gateway success)
export async function payDeposit(user: UserHydrated, id: string, method: PaymentMethod) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    await assertCanAccess(user, r, 'reservation.pay_deposit');
    if (r.holdExpiresAt && r.holdExpiresAt < new Date()) throw Conflict('Đã hết thời gian giữ chỗ, vui lòng đặt lại', 'HOLD_EXPIRED');
    const pay = await PaymentModel.findById(r.depositPaymentId).session(session);
    if (!pay) throw NotFound('khoản cọc');
    pay.method = method;
    pay.provider = { name: method, txnRef: `${method}-${randomToken(9)}`, rawStatus: 'MOCK_SUCCESS' };
    pay.transitionTo('SUCCEEDED', { actor: 'SYSTEM', reason: 'Gateway callback (mock)' });
    await pay.save({ session });

    const qrToken = randomToken(12);
    r.transitionTo('CONFIRMED', { actor: 'SYSTEM', reason: `Đặt cọc qua ${method}` });
    r.checkIn = { qrTokenHash: sha256(qrToken), qrExpiresAt: addDays(r.startDate, 2), checkedInAt: null, checkedInBy: null };
    await r.save({ session });
    await audit({ action: 'payment.deposit', entityType: 'Reservation', entityId: r._id, facilityId: r.facilityId, changes: { after: { amount: pay.amount, method } } }, session);
    // QR payload shown to the customer; only its hash is stored.
    return { reservation: r, qrPayload: `SSM:${r.code}:${qrToken}` };
  });
}

// ---------------------------------------------------------------- cấp lại mã QR nhận kho (CUSTOMER chủ đặt chỗ)
/**
 * payDeposit trả `qrPayload` đúng MỘT lần rồi server chỉ giữ lại sha256 — đóng trang là mất.
 * App mobile phải hiện được mã bất cứ lúc nào (cài lại app, đổi máy, hoặc đã trả cọc bên web),
 * nên cần đường cấp lại.
 *
 * Mỗi lần gọi sinh token MỚI và ghi đè hash cũ, nên ảnh chụp màn hình mã cũ lập tức vô hiệu.
 * Đó cũng là lý do cấp mới chứ không lưu token bản rõ ở đâu để "đọc lại".
 */
export async function reissueCheckInQr(user: UserHydrated, id: string) {
  const r = await loadReservation(id);
  await assertCanAccess(user, r, 'reservation.qr_reissue');
  if (r.status !== 'CONFIRMED' && r.status !== 'ALLOCATED') {
    throw Unprocessable('Chỉ cấp mã cho đặt chỗ đã xác nhận và chưa nhận kho');
  }
  const token = randomToken(12);
  const qrExpiresAt = addDays(r.startDate, 2);
  r.checkIn = {
    qrTokenHash: sha256(token),
    qrExpiresAt,
    checkedInAt: r.checkIn?.checkedInAt ?? null,
    checkedInBy: r.checkIn?.checkedInBy ?? null,
  };
  await r.save();
  await audit({ action: 'reservation.qr_reissue', entityType: 'Reservation', entityId: r._id, facilityId: r.facilityId });
  // Payload chỉ tồn tại trong response này; server không giữ bản rõ.
  return { qrPayload: `SSM:${r.code}:${token}`, code: r.code, expiresAt: qrExpiresAt };
}

// ---------------------------------------------------------------- cancel
export async function cancelReservation(actorUser: UserHydrated | null, id: string, reason: CancellationReason, note?: string) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    if (actorUser) await assertCanAccess(actorUser, r, 'reservation.cancel');
    const actor = actorUser ? actorUser.role : 'SYSTEM';
    const wasPending = r.status === 'PENDING';
    const refund = reason === 'CUSTOMER_REQUEST' ? await cancellationRefund(r, session)
      : reason === 'HOLD_EXPIRED' || reason === 'NO_SHOW' || wasPending ? { pct: 0, amount: 0 }
      : { pct: 100, amount: r.depositPaymentId ? r.quote.depositAmount : 0 }; // facility-side cancellation: full refund

    const unitId = r.unitId;
    r.transitionTo('CANCELLED', { actor, by: actorUser?._id ?? null, reason: note ?? reason });
    r.cancellation = { reason, note, cancelledAt: new Date(), cancelledBy: actorUser?._id ?? null, refundAmount: refund.amount };
    r.unitId = null;
    await r.save({ session });

    if (unitId) {
      const released = await StorageUnitModel.updateOne(
        { _id: unitId, status: 'RESERVED', currentReservationId: r._id },
        { $set: { status: 'AVAILABLE', currentReservationId: null, statusChangedAt: new Date(), statusReason: 'Đặt chỗ đã hủy' } },
        { session },
      );
      if (released.matchedCount !== 1) throw Conflict('Trạng thái kho không khớp đặt chỗ — liên hệ quản lý');
    }

    const deposit = r.depositPaymentId ? await PaymentModel.findById(r.depositPaymentId).session(session) : null;
    if (deposit && deposit.status === 'PENDING') { deposit.transitionTo('CANCELLED', { actor: 'SYSTEM' }); await deposit.save({ session }); }
    if (deposit && refund.amount > 0) {
      await createPayment({ facilityId: r.facilityId, customerId: r.customerId, reservationId: r._id, type: 'REFUND', amount: refund.amount, status: 'SUCCEEDED', method: 'BANK_TRANSFER', refundOf: deposit._id }, session);
      deposit.refundedAmount = refund.amount;
      deposit.transitionTo(refund.amount >= deposit.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED', { actor: 'SYSTEM' });
      await deposit.save({ session });
    }
    await audit({ action: 'reservation.cancel', entityType: 'Reservation', entityId: r._id, facilityId: r.facilityId, reason, changes: { after: { refund: refund.amount } } }, session);
    return { reservation: r, refund };
  });
}

// ---------------------------------------------------------------- allocate / unallocate (FACILITY_MANAGER)
export async function allocate(user: UserHydrated, id: string, unitId?: string) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    await assertFacility(user, r.facilityId, 'reservation.allocate');
    if (r.status !== 'CONFIRMED') r.transitionTo('ALLOCATED', { actor: user.role }); // throws a precise InvalidTransitionError

    // Compare-and-swap: only an AVAILABLE unit of the same facility + type can be taken.
    const filter: Record<string, unknown> = { facilityId: r.facilityId, unitTypeId: r.unitTypeId, status: 'AVAILABLE' };
    if (unitId) filter._id = unitId;
    const unit = await StorageUnitModel.findOneAndUpdate(
      filter,
      { $set: { status: 'RESERVED', currentReservationId: r._id, statusChangedAt: new Date(), statusReason: `Giữ cho ${r.code}` } },
      { new: true, session, sort: { priceTier: -1, 'location.floor': 1, unitNumber: 1 } }, // STANDARD before PREMIUM/ECONOMY
    );
    if (!unit) throw Conflict(unitId ? 'Kho đã chọn không còn trống hoặc không đúng loại' : 'Không còn kho trống cùng loại để phân', 'UNIT_NOT_AVAILABLE');

    r.transitionTo('ALLOCATED', { actor: user.role, by: user._id, reason: `Phân kho ${unit.unitNumber}` });
    r.unitId = unit._id;
    r.allocation = { allocatedAt: new Date(), allocatedBy: user._id };
    await r.save({ session }); // partial unique index {unitId} is the last line of defence
    await UnitTypeModel.updateOne({ _id: r.unitTypeId }, { $inc: { inventoryVersion: 1 } }, { session });
    await audit({ action: 'reservation.allocate', entityType: 'Reservation', entityId: r._id, facilityId: r.facilityId, changes: { before: { status: 'CONFIRMED' }, after: { status: 'ALLOCATED', unit: unit.unitNumber } } }, session);
    return { reservation: r, unit };
  });
}

export async function unallocate(user: UserHydrated, id: string) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    await assertFacility(user, r.facilityId, 'reservation.unallocate');
    const unitId = r.unitId;
    r.transitionTo('CONFIRMED', { actor: user.role, by: user._id, reason: 'Gỡ phân kho' });
    r.unitId = null; r.allocation = null;
    await r.save({ session });
    if (unitId) {
      await StorageUnitModel.updateOne({ _id: unitId, status: 'RESERVED', currentReservationId: r._id },
        { $set: { status: 'AVAILABLE', currentReservationId: null, statusChangedAt: new Date(), statusReason: null } }, { session });
    }
    await audit({ action: 'reservation.unallocate', entityType: 'Reservation', entityId: r._id, facilityId: r.facilityId }, session);
    return r;
  });
}

// ---------------------------------------------------------------- lookup by code / QR (STAFF, FM)
export async function lookupForCheckIn(user: UserHydrated, codeOrQr: string) {
  const [code, token] = codeOrQr.startsWith('SSM:') ? codeOrQr.slice(4).split(':') : [codeOrQr, undefined];
  const r = await ReservationModel.findOne({ code: code.trim().toUpperCase() });
  if (!r) throw NotFound('mã đặt chỗ');
  await assertFacility(user, r.facilityId, 'reservation.lookup'); // out-of-scope lookups are audited as DENIED
  const tokenValid = token ? r.checkIn?.qrTokenHash === sha256(token) : null;
  const customer = await UserModel.findById(r.customerId, { fullName: 1, phone: 1, status: 1, 'customerProfile.idNumberLast4': 1 }).lean();
  return { reservation: r, customer, qrValid: tokenValid };
}

// ---------------------------------------------------------------- check-in (STAFF, FM)
export async function checkIn(user: UserHydrated, id: string, input: { accessMethod: AccessMethod; keyTag?: string; payMethod: PaymentMethod; qrToken?: string }) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    await assertFacility(user, r.facilityId, 'reservation.check_in');
    if (r.startDate > todayUTC()) throw Unprocessable('Chưa đến ngày nhận kho theo lịch đặt');
    if (input.qrToken && r.checkIn?.qrTokenHash !== sha256(input.qrToken)) throw Forbidden('Mã QR không hợp lệ', 'QR_INVALID');
    const customer = await UserModel.findById(r.customerId).session(session);
    if (!customer || customer.status === 'SUSPENDED') throw Unprocessable('Tài khoản khách đang bị tạm khóa');

    const policy = await effectivePolicy(r.facilityId, session);
    const now = new Date();
    const today = todayUTC();
    const contractId = new Types.ObjectId();

    const unit = await StorageUnitModel.findOneAndUpdate(
      { _id: r.unitId, status: 'RESERVED', currentReservationId: r._id },
      { $set: { status: 'OCCUPIED', currentReservationId: null, currentContractId: contractId, statusChangedAt: now, statusReason: null } },
      { new: true, session },
    );
    if (!unit) throw Conflict('Kho được phân không còn ở trạng thái giữ chỗ', 'UNIT_STATE_MISMATCH');

    const pin = input.accessMethod === 'PIN' ? sixDigitPin() : undefined;
    const periodEnd = addDays(addMonthsUTC(today, 1), -1);
    const rent = await createPayment({
      facilityId: r.facilityId, customerId: r.customerId, contractId, reservationId: r._id, type: 'RENT',
      amount: r.quote.firstPeriodRent, status: 'SUCCEEDED', method: input.payMethod,
      recordedBy: input.payMethod === 'CASH' ? user._id : null, period: { start: today, end: periodEnd },
    }, session);

    const [contract] = await RentalContractModel.create([{
      _id: contractId, facilityId: r.facilityId, customerId: r.customerId, unitId: unit._id, unitTypeId: r.unitTypeId, reservationId: r._id,
      status: 'ACTIVE', startDate: today, endDate: addMonthsUTC(today, r.durationMonths), autoRenew: r.durationMonths >= 6,
      billing: { currency: 'VND', monthlyRate: r.quote.firstPeriodRent, billingDay: Math.min(28, today.getUTCDate()), nextBillingDate: addMonthsUTC(today, 1), paidThrough: periodEnd },
      deposit: { amount: r.quote.depositAmount, status: 'HELD', paymentId: r.depositPaymentId ?? null, refundedAmount: 0 },
      balance: { outstanding: 0, lastPaymentAt: now },
      access: { method: input.accessMethod, keyTag: input.keyTag ?? null, credentialHash: pin ? sha256(pin) : null, issuedAt: now, issuedBy: user._id },
      terms: { policyId: policy._id, policyVersion: policy.version, gracePeriodDays: policy.gracePeriodDays, lockoutAfterDays: policy.lockoutAfterDays, signedAt: now, signatureRef: `esign-${contractId}` },
      statusHistory: [{ from: null, to: 'ACTIVE', at: now, by: user._id }],
    }], { session });

    r.transitionTo('CHECKED_IN', { actor: user.role, by: user._id });
    r.contractId = contractId;
    r.checkIn = { qrTokenHash: r.checkIn?.qrTokenHash ?? null, qrExpiresAt: r.checkIn?.qrExpiresAt ?? null, checkedInAt: now, checkedInBy: user._id };
    await r.save({ session });
    await audit({ action: 'reservation.check_in', entityType: 'RentalContract', entityId: contractId, facilityId: r.facilityId, changes: { after: { unit: unit.unitNumber, access: input.accessMethod, rent: rent.amount } } }, session);
    return { contract, unit, pin }; // PIN is returned exactly once; only its hash is stored
  });
}

export type { ReservationHydrated };
