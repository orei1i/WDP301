import { Types, type ClientSession } from 'mongoose';
import { PERIOD_UNIT, type CancellationReason, type CheckInShift, type PaymentMethod, type RentalPeriod, type Reservation } from '@ssm/shared';
import {
  FacilityModel, PaymentModel, RentalContractModel, ReservationModel, StorageUnitModel, UnitTypeModel, UserModel,
  type ReservationHydrated, type UserHydrated,
} from '../../shared/db/models';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess, assertFacility } from '../../shared/http/scope';
import { cancellationRefund, effectivePolicy, quote } from '../policies/pricing';
import { addDays, addPeriodsUTC, todayUTC, toDateOnly } from '../../shared/utils/dates';
import { audit } from '../audit/audit.service';
import { withTxn } from '../../shared/db/txn';
import { createPayment, randomToken, sha256, sixDigitPin } from '../payments/payment.service';

const loadReservation = async (id: string, session?: ClientSession) => {
  const r = await ReservationModel.findById(id).session(session ?? null);
  if (!r) throw NotFound('đặt chỗ');
  return r;
};

export interface BookingItem {
  unitTypeId: string; unitId: string; startDate: string; rentalPeriod: RentalPeriod; periods: number;
  source: Reservation['source']; idempotencyKey?: string;
  /** Ca giờ khách dự kiến đến nhận kho, chọn ngay lúc đặt — UNKNOWN ("Chưa rõ giờ") là lựa chọn hợp lệ. */
  preferredCheckInShift: CheckInShift;
  /** Bằng chứng đã đồng ý Điều khoản + Chính sách bảo mật — bắt buộc, đóng dấu ip/userAgent ở route. */
  consent: { termsVersion: string; privacyVersion: string; acceptedAt?: string; ip: string | null; userAgent: string | null };
}

/**
 * Đặt MỘT ô kho cụ thể — khách bắt buộc chọn ô trên sơ đồ trước (không đặt theo "loại kho" trừu
 * tượng rồi chờ phân sau). Ô chuyển sang RESERVED ngay trong transaction này bằng compare-and-swap
 * trên `status: 'AVAILABLE'`, nên hai khách cùng bấm một ô thì chỉ một người khớp filter, người kia
 * nhận 409 — không cần đếm số lượng như thiết kế cũ.
 *
 * Dùng chung cho đặt lẻ (createReservation) và đặt nhiều kho một lần (createReservationsBatch).
 */
async function bookOne(user: UserHydrated, input: BookingItem, session: ClientSession) {
  if (input.idempotencyKey) {
    const existing = await ReservationModel.findOne({ customerId: user._id, idempotencyKey: input.idempotencyKey }).session(session);
    if (existing) return existing;
  }
  const start = toDateOnly(input.startDate);
  if (start < todayUTC()) throw Unprocessable('Ngày bắt đầu không được ở quá khứ');
  if (start > addDays(todayUTC(), 90)) throw Unprocessable('Chỉ nhận đặt trước tối đa 90 ngày');

  const ut = await UnitTypeModel.findOne({ _id: input.unitTypeId, isActive: true }).session(session);
  if (!ut) throw NotFound('loại kho');
  const facility = await FacilityModel.findById(ut.facilityId).session(session);
  if (!facility || facility.status !== 'ACTIVE') throw Unprocessable('Chi nhánh chưa nhận đặt chỗ');
  const policy = await effectivePolicy(facility._id, session);
  const minP = Math.max(policy.minPeriods, ut.minPeriods);
  const unitLabel = PERIOD_UNIT[input.rentalPeriod];
  if (input.periods < minP || input.periods > policy.maxPeriods) throw Unprocessable(`Thời hạn thuê phải từ ${minP} đến ${policy.maxPeriods} ${unitLabel}`);

  const id = new Types.ObjectId();
  const now = new Date();
  const unit = await StorageUnitModel.findOneAndUpdate(
    { _id: input.unitId, facilityId: ut.facilityId, unitTypeId: ut._id, status: 'AVAILABLE', isDeleted: false },
    { $set: { status: 'RESERVED', currentReservationId: id, statusChangedAt: now, statusReason: 'Giữ chỗ — đặt kho' } },
    { new: true, session },
  );
  if (!unit) throw Conflict('Ô kho đã chọn không còn trống — vui lòng chọn ô khác trên sơ đồ', 'UNIT_NOT_AVAILABLE');
  // Token chống race cho khách khác đang xem cùng loại kho này (đếm chỗ trống trên trang danh mục).
  await UnitTypeModel.updateOne({ _id: ut._id }, { $inc: { inventoryVersion: 1 } }, { session });

  const q = quote(ut, policy, input.rentalPeriod, input.periods);
  const deposit = await createPayment({ facilityId: facility._id, customerId: user._id, reservationId: id, type: 'DEPOSIT', amount: q.depositAmount, status: 'PENDING', method: 'VNPAY' }, session);
  const [r] = await ReservationModel.create([{
    _id: id, facilityId: facility._id, customerId: user._id, unitTypeId: ut._id, unitId: unit._id, status: 'PENDING',
    startDate: start, periods: input.periods, endDate: addPeriodsUTC(start, input.rentalPeriod, input.periods), quote: q,
    preferredCheckInShift: input.preferredCheckInShift,
    holdExpiresAt: new Date(now.getTime() + policy.reservationHoldMinutes * 60_000),
    // Ô đã được chọn đúng lúc đặt — không còn bước "Quản lý chi nhánh phân kho" riêng như thiết kế cũ.
    allocation: { allocatedAt: now, allocatedBy: null },
    depositPaymentId: deposit._id, source: input.source, idempotencyKey: input.idempotencyKey ?? null,
    consent: { ...input.consent, acceptedAt: now },
  }], { session });
  await audit({
    action: 'reservation.create', entityType: 'Reservation', entityId: id, facilityId: facility._id,
    changes: { after: { code: r.code, unitType: ut.code, unit: unit.unitNumber, rentalPeriod: input.rentalPeriod, periods: input.periods } },
  }, session);
  return r;
}

// ---------------------------------------------------------------- create (CUSTOMER)
export async function createReservation(user: UserHydrated, input: BookingItem) {
  if (user.status !== 'ACTIVE') throw Forbidden('Tài khoản chưa được kích hoạt', 'ACCOUNT_INACTIVE');
  return withTxn((session) => bookOne(user, input, session));
}

/**
 * Đặt nhiều kho trong một lần bấm (giỏ hàng) — tất cả cùng một transaction: hoặc cả N ô đều giữ
 * được, hoặc không ô nào bị giữ (ô nào tranh chấp sẽ báo rõ trong lỗi để khách bỏ dòng đó ra).
 */
export async function createReservationsBatch(user: UserHydrated, items: BookingItem[]) {
  if (user.status !== 'ACTIVE') throw Forbidden('Tài khoản chưa được kích hoạt', 'ACCOUNT_INACTIVE');
  if (items.length === 0) throw Unprocessable('Giỏ hàng trống');
  if (items.length > 10) throw Unprocessable('Chỉ đặt tối đa 10 kho một lần');
  const unitIds = new Set(items.map((i) => i.unitId));
  if (unitIds.size !== items.length) throw Unprocessable('Không thể đặt cùng một ô kho hai lần trong một lượt');

  return withTxn(async (session) => {
    const results: ReservationHydrated[] = [];
    for (const item of items) results.push(await bookOne(user, item, session));
    return results;
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
    // Ô đã được chọn ngay lúc đặt (bookOne) — không còn bước Quản lý chi nhánh phân kho riêng, nên
    // trả cọc xong là chuyển thẳng sang ALLOCATED để màn "sẵn sàng nhận kho" nhận đúng reservation này.
    if (r.unitId) r.transitionTo('ALLOCATED', { actor: 'SYSTEM', reason: 'Ô đã chọn lúc đặt' });
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
      { new: true, session, sort: { 'location.floor': 1, unitNumber: 1 } },
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
export async function checkIn(user: UserHydrated, id: string, input: { keyTag?: string; payMethod: PaymentMethod; qrToken?: string }) {
  return withTxn(async (session) => {
    const r = await loadReservation(id, session);
    await assertFacility(user, r.facilityId, 'reservation.check_in');
    if (r.startDate > todayUTC()) throw Unprocessable('Chưa đến ngày nhận kho theo lịch đặt');
    if (input.qrToken && r.checkIn?.qrTokenHash !== sha256(input.qrToken)) throw Forbidden('Mã QR không hợp lệ', 'QR_INVALID');
    const customer = await UserModel.findById(r.customerId).session(session);
    if (!customer || customer.status === 'SUSPENDED') throw Unprocessable('Tài khoản khách đang bị tạm khóa');

    // Hình thức khoá đến từ loại kho (không do nhân viên chọn tại quầy); chu kỳ thuê là khách đã
    // chọn lúc đặt, chốt sẵn trong quote — không suy ra từ loại kho nữa.
    const ut = await UnitTypeModel.findById(r.unitTypeId).session(session);
    if (!ut) throw NotFound('loại kho');
    const period = r.quote.rentalPeriod;

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

    const pin = ut.accessMethod === 'PIN' ? sixDigitPin() : undefined;
    const nextBilling = addPeriodsUTC(today, period, 1);
    const periodEnd = addDays(nextBilling, -1);
    const rent = await createPayment({
      facilityId: r.facilityId, customerId: r.customerId, contractId, reservationId: r._id, type: 'RENT',
      amount: r.quote.firstPeriodRent, status: 'SUCCEEDED', method: input.payMethod,
      recordedBy: input.payMethod === 'CASH' ? user._id : null, period: { start: today, end: periodEnd },
    }, session);

    const [contract] = await RentalContractModel.create([{
      _id: contractId, facilityId: r.facilityId, customerId: r.customerId, unitId: unit._id, unitTypeId: r.unitTypeId, reservationId: r._id,
      status: 'ACTIVE', startDate: today, endDate: addPeriodsUTC(today, period, r.periods), autoRenew: period === 'MONTH' && r.periods >= 6,
      billing: { currency: 'VND', rentalPeriod: period, rate: r.quote.firstPeriodRent, nextBillingDate: nextBilling, paidThrough: periodEnd },
      deposit: { amount: r.quote.depositAmount, status: 'HELD', paymentId: r.depositPaymentId ?? null, refundedAmount: 0 },
      balance: { outstanding: 0, lastPaymentAt: now },
      access: { method: ut.accessMethod, keyTag: input.keyTag ?? null, credentialHash: pin ? sha256(pin) : null, issuedAt: now, issuedBy: user._id },
      terms: { policyId: policy._id, policyVersion: policy.version, gracePeriodDays: policy.gracePeriodDays, lockoutAfterDays: policy.lockoutAfterDays, signedAt: now, signatureRef: `esign-${contractId}` },
      statusHistory: [{ from: null, to: 'ACTIVE', at: now, by: user._id }],
    }], { session });

    r.transitionTo('CHECKED_IN', { actor: user.role, by: user._id });
    r.contractId = contractId;
    r.checkIn = { qrTokenHash: r.checkIn?.qrTokenHash ?? null, qrExpiresAt: r.checkIn?.qrExpiresAt ?? null, checkedInAt: now, checkedInBy: user._id };
    await r.save({ session });
    await audit({ action: 'reservation.check_in', entityType: 'RentalContract', entityId: contractId, facilityId: r.facilityId, changes: { after: { unit: unit.unitNumber, access: ut.accessMethod, rent: rent.amount } } }, session);
    return { contract, unit, pin }; // PIN is returned exactly once; only its hash is stored
  });
}

export type { ReservationHydrated };
