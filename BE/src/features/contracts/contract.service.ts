import { Types, type ClientSession } from 'mongoose';
import { PERIOD_UNIT, type InspectionLog, type PaymentMethod, type UnitStatus } from '@ssm/shared';
import { InspectionModel, PaymentModel, RentalContractModel, ReservationModel, StorageUnitModel, UnitTypeModel, type UserHydrated } from '../../shared/db/models';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess, assertFacility } from '../../shared/http/scope';
import { effectivePolicy } from '../policies/pricing';
import { addDays, addPeriodsUTC, daysBetween, todayUTC, toDateOnly } from '../../shared/utils/dates';
import { audit } from '../audit/audit.service';
import { withTxn } from '../../shared/db/txn';
import { createPayment } from '../payments/payment.service';

const loadContract = async (id: string, session?: ClientSession) => {
  const c = await RentalContractModel.findById(id).session(session ?? null);
  if (!c) throw NotFound('hợp đồng');
  return c;
};

// ---------------------------------------------------------------- extend (CUSTOMER owner)
export async function extendContract(user: UserHydrated, id: string, periods: number, method: PaymentMethod) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertCanAccess(user, c, 'contract.extend');
    if (c.status !== 'ACTIVE') throw Unprocessable('Chỉ gia hạn được hợp đồng đang hiệu lực, không có công nợ');
    const policy = await effectivePolicy(c.facilityId, session);
    const period = c.billing.rentalPeriod;
    // Tổng số chu kỳ đã thuê + gia hạn thêm, tính thô từ số ngày để chặn vượt trần chính sách.
    const perDays = period === 'MONTH' ? 30 : period === 'WEEK' ? 7 : 1;
    const totalPeriods = daysBetween(c.startDate, addPeriodsUTC(c.endDate, period, periods)) / perDays;
    if (totalPeriods > policy.maxPeriods + 1) throw Unprocessable(`Tổng thời hạn vượt tối đa ${policy.maxPeriods} ${PERIOD_UNIT[period]}`);

    const newEnd = addPeriodsUTC(c.endDate, period, periods);
    const pay = await createPayment({
      facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'RENEWAL',
      amount: c.billing.rate * periods, status: 'SUCCEEDED', method, period: { start: c.endDate, end: newEnd },
    }, session);
    c.renewals.push({ previousEndDate: c.endDate, newEndDate: newEnd, periods, paymentId: pay._id, at: new Date() });
    c.endDate = newEnd;
    await c.save({ session });
    await audit({ action: 'contract.extend', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, changes: { after: { periods, amount: pay.amount, endDate: newEnd } } }, session);
    return { contract: c, amount: pay.amount };
  });
}

// ---------------------------------------------------------------- pay outstanding (CUSTOMER online, STAFF/FM at desk)
export async function payBalance(user: UserHydrated, id: string, method: PaymentMethod) {
  if (user.role === 'CUSTOMER' && method === 'CASH') throw Unprocessable('Thanh toán tiền mặt chỉ thực hiện tại quầy');
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertCanAccess(user, c, 'contract.pay_balance');
    if (c.balance.outstanding <= 0) throw Unprocessable('Hợp đồng không có công nợ');
    const amount = c.balance.outstanding;
    const now = new Date();

    const open = await PaymentModel.find({ contractId: c._id, direction: 'CHARGE', status: { $in: ['PENDING', 'FAILED'] } }).session(session);
    for (const p of open) {
      if (p.status === 'PENDING') {
        p.method = method;
        p.recordedBy = method === 'CASH' ? user._id : null;
        p.transitionTo('SUCCEEDED', { actor: 'SYSTEM', by: user._id });
        await p.save({ session });
      } else {
        // FAILED is terminal: settle it with a new charge for the same item
        await createPayment({
          facilityId: p.facilityId, customerId: p.customerId, contractId: c._id, type: p.type, amount: p.amount, status: 'SUCCEEDED', method,
          period: p.period ?? null, recordedBy: method === 'CASH' ? user._id : null, idempotencyKey: `retry-${p._id}`,
        }, session);
      }
    }

    c.balance = { outstanding: 0, lastPaymentAt: now };
    c.delinquency = null;
    c.billing.paidThrough = addDays(c.billing.nextBillingDate, -1);
    c.access.suspendedAt = null;
    if (c.status === 'DELINQUENT' || c.status === 'LOCKED_OUT') c.transitionTo('ACTIVE', { actor: 'SYSTEM', by: user._id, reason: 'Đã thanh toán đủ công nợ' });
    await c.save({ session });
    await StorageUnitModel.updateOne({ _id: c.unitId }, { $set: { overlockActive: false } }, { session });
    await audit({ action: 'payment.balance', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, changes: { after: { amount, method } } }, session);
    return { contract: c, amount };
  });
}

// ---------------------------------------------------------------- lockout (FACILITY_MANAGER)
export async function lockout(user: UserHydrated, id: string) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertFacility(user, c.facilityId, 'contract.lockout');
    if ((c.delinquency?.daysOverdue ?? 0) <= c.terms.gracePeriodDays) throw Unprocessable(`Chỉ khóa truy cập khi quá hạn hơn ${c.terms.gracePeriodDays} ngày (thời gian ân hạn)`);
    c.transitionTo('LOCKED_OUT', { actor: user.role, by: user._id, reason: 'Khóa do quá hạn' });
    c.delinquency!.lockedOutAt = new Date();
    c.access.suspendedAt = new Date();
    await c.save({ session });
    await StorageUnitModel.updateOne({ _id: c.unitId, status: 'OCCUPIED' }, { $set: { overlockActive: true } }, { session });
    await audit({ action: 'contract.lockout', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId }, session);
    return c;
  });
}

// ---------------------------------------------------------------- waive late fees (FM / OPS within policy limit)
export async function waiveLateFees(user: UserHydrated, id: string, reason: string) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertFacility(user, c.facilityId, 'payment.waiver');
    const fees = await PaymentModel.find({ contractId: c._id, type: 'LATE_FEE', status: 'PENDING' }).session(session);
    const total = fees.reduce((s, p) => s + p.amount, 0);
    if (!total) throw Unprocessable('Không có phí trễ hạn để miễn');
    const policy = await effectivePolicy(c.facilityId, session);
    const limit = policy.waiverLimits.find((w) => w.role === user.role)?.maxAmount ?? 0;
    if (total > limit) throw Forbidden(`Vượt hạn mức miễn giảm của bạn (${limit.toLocaleString('vi-VN')} ₫)`, 'WAIVER_LIMIT');

    for (const f of fees) { f.transitionTo('CANCELLED', { actor: 'SYSTEM', by: user._id, reason: 'Miễn phí trễ hạn' }); await f.save({ session }); }
    await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'WAIVER', amount: total, status: 'SUCCEEDED', method: 'INTERNAL', waiver: { approvedBy: user._id, reason } }, session);
    c.balance.outstanding = Math.max(0, c.balance.outstanding - total);
    if (c.delinquency) c.delinquency.lateFeesAccrued = 0;
    await c.save({ session });
    await audit({ action: 'payment.waiver', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, reason, changes: { after: { amount: total } } }, session);
    return { contract: c, amount: total };
  });
}

// ---------------------------------------------------------------- swap unit, same type (STAFF, FACILITY_MANAGER)
/**
 * Trần phí đổi ô. Đổi ô CÙNG LOẠI không làm thay đổi giá thuê, nên khoản này chỉ là phí thao tác
 * (di dời, cấp lại chìa/mã) — mặc định 0. Quản lý chi nhánh mới được thu, và mọi lần thu đều vào
 * nhật ký kiểm toán kèm lý do.
 */
export const SWAP_FEE_MAX = 500_000;

/**
 * Đổi ô kho cùng loại.
 *
 * Bốn bất biến, sai một cái là hỏng dữ liệu:
 *  1. CÙNG unitTypeId  → giá thuê và tiền cọc đã chốt trong hợp đồng KHÔNG được tính lại.
 *  2. Chiếm ô mới TRƯỚC, nhả ô cũ SAU, trong cùng một transaction. Làm ngược lại thì ô cũ có thể bị
 *     người khác lấy mất trong lúc ô mới chiếm không thành công → khách mất cả hai ô.
 *  3. Lấy ô mới bằng compare-and-swap trên `status: 'AVAILABLE'` → hai người cùng nhắm một ô thì chỉ
 *     một người khớp filter, người kia nhận 409.
 *  4. $inc inventoryVersion để hai giao dịch trên cùng loại kho ghi đè nhau → WriteConflict → driver
 *     retry cả callback (xem services/txn.ts).
 */
export async function swapUnit(user: UserHydrated, id: string, input: { toUnitId: string; reason: string; keyTag?: string; fee?: number }) {
  const fee = Math.max(0, Math.trunc(input.fee ?? 0));
  if (fee > 0 && user.role !== 'FACILITY_MANAGER') throw Forbidden('Chỉ Quản lý chi nhánh được thu phí đổi ô', 'SWAP_FEE');
  if (fee > SWAP_FEE_MAX) throw Unprocessable(`Phí đổi ô tối đa ${SWAP_FEE_MAX.toLocaleString('vi-VN')} ₫`);

  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertFacility(user, c.facilityId, 'contract.swap_unit');
    if (c.status !== 'ACTIVE') throw Unprocessable('Chỉ đổi ô cho hợp đồng đang hiệu lực');
    if (c.balance.outstanding > 0) throw Unprocessable('Hợp đồng còn công nợ — thu xong mới đổi ô');
    if (String(c.unitId) === String(input.toUnitId)) throw Unprocessable('Ô mới trùng với ô đang thuê');

    await UnitTypeModel.updateOne({ _id: c.unitTypeId }, { $inc: { inventoryVersion: 1 } }, { session });

    const now = new Date();
    const fromUnitId = c.unitId;

    // (1) chiếm ô mới — đúng chi nhánh, đúng loại, và phải đang trống
    const toUnit = await StorageUnitModel.findOneAndUpdate(
      { _id: input.toUnitId, facilityId: c.facilityId, unitTypeId: c.unitTypeId, status: 'AVAILABLE', isDeleted: false },
      { $set: { status: 'OCCUPIED', currentContractId: c._id, currentReservationId: null, statusChangedAt: now, statusReason: `Đổi ô cho ${c.contractNumber}` } },
      { new: true, session },
    );
    if (!toUnit) throw Conflict('Ô kho đã chọn không còn trống hoặc không cùng loại với ô đang thuê', 'UNIT_NOT_AVAILABLE');

    // (2) nhả ô cũ về chờ kiểm tra — hỏng ở đây thì cả transaction rollback, ô mới tự nhả
    const fromUnit = await StorageUnitModel.findOneAndUpdate(
      { _id: fromUnitId, status: 'OCCUPIED', currentContractId: c._id },
      { $set: { status: 'PENDING_INSPECTION', currentContractId: null, overlockActive: false, statusChangedAt: now, statusReason: `Khách đã chuyển sang ô ${toUnit.unitNumber}` } },
      { new: true, session },
    );
    if (!fromUnit) throw Conflict('Ô kho đang thuê không ở trạng thái mong đợi — liên hệ quản lý', 'UNIT_STATE_MISMATCH');

    // (3) phí thao tác (nếu có): cộng vào công nợ, KHÔNG đụng vào giá thuê
    const feePayment = fee > 0
      ? await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'PENALTY', amount: fee, status: 'PENDING', method: 'INTERNAL' }, session)
      : null;

    // (4) hợp đồng trỏ sang ô mới; billing.rate và deposit giữ nguyên
    c.unitId = toUnit._id;
    c.unitSwaps = [...(c.unitSwaps ?? []), { fromUnitId, toUnitId: toUnit._id, reason: input.reason, fee, paymentId: feePayment?._id ?? null, at: now, by: user._id }];
    if (input.keyTag !== undefined) {
      c.access.keyTag = input.keyTag || null;
      c.access.issuedAt = now;
      c.access.issuedBy = user._id;
    }
    if (fee > 0) c.balance.outstanding += fee;
    await c.save({ session }); // chỉ mục unique {unitId} trên hợp đồng đang mở là lớp chặn cuối cùng

    // (5) đặt chỗ gốc đi theo hợp đồng để lịch sử của khách không lệch ô
    await ReservationModel.updateOne({ _id: c.reservationId, status: 'CHECKED_IN' }, { $set: { unitId: toUnit._id } }, { session });

    await UnitTypeModel.updateOne({ _id: c.unitTypeId }, { $inc: { inventoryVersion: 1 } }, { session });
    await audit({
      action: 'contract.swap_unit', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, reason: input.reason,
      changes: { before: { unit: fromUnit.unitNumber }, after: { unit: toUnit.unitNumber, fee, rate: c.billing.rate } },
    }, session);
    return { contract: c, fromUnit, toUnit, fee };
  });
}

/** Danh sách ô còn trống cùng loại với hợp đồng — dùng cho ô chọn ở màn hình đổi ô. */
/** Danh sách ô trống cùng loại — dùng cho cả nhân viên đổi ngay (swapUnit) lẫn khách gửi yêu cầu đổi ô. */
export async function swapCandidates(user: UserHydrated, id: string) {
  const c = await loadContract(id);
  await assertCanAccess(user, c, 'contract.swap_unit');
  const items = await StorageUnitModel
    .find({ facilityId: c.facilityId, unitTypeId: c.unitTypeId, status: 'AVAILABLE', _id: { $ne: c.unitId } }, { unitNumber: 1, location: 1, status: 1 })
    .sort({ 'location.floor': 1, unitNumber: 1 }).limit(200).lean();
  return { currentUnitId: c.unitId, rate: c.billing.rate, items };
}

// ---------------------------------------------------------------- move-out request (CUSTOMER owner, STAFF/FM)
export async function requestMoveOut(user: UserHydrated, id: string, date: string) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertCanAccess(user, c, 'contract.move_out_request');
    if (user.role === 'CUSTOMER' && c.balance.outstanding > 0) throw Unprocessable('Vui lòng thanh toán công nợ trước khi đăng ký trả kho');
    const scheduledFor = toDateOnly(date);
    if (scheduledFor < todayUTC()) throw Unprocessable('Ngày trả kho không được ở quá khứ');
    c.transitionTo('MOVE_OUT_PENDING', { actor: user.role, by: user._id });
    c.moveOut = { requestedAt: new Date(), scheduledFor, completedAt: null, inspectionId: null };
    await c.save({ session });
    await audit({ action: 'contract.move_out_request', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, changes: { after: { scheduledFor } } }, session);
    return c;
  });
}

// ---------------------------------------------------------------- keys returned (STAFF, FM)
export async function receiveUnit(user: UserHydrated, id: string) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertFacility(user, c.facilityId, 'unit.receive');
    if (c.status !== 'MOVE_OUT_PENDING') throw Unprocessable('Khách chưa đăng ký trả kho');
    const unit = await StorageUnitModel.findOneAndUpdate(
      { _id: c.unitId, status: 'OCCUPIED', currentContractId: c._id },
      { $set: { status: 'PENDING_INSPECTION', overlockActive: false, statusChangedAt: new Date(), statusReason: 'Khách bàn giao chìa khóa' } },
      { new: true, session },
    );
    if (!unit) throw Conflict('Kho không ở trạng thái đang thuê', 'UNIT_STATE_MISMATCH');
    c.access.revokedAt = new Date();
    await c.save({ session });
    await audit({ action: 'unit.receive', entityType: 'StorageUnit', entityId: unit._id, facilityId: c.facilityId }, session);
    return { contract: c, unit };
  });
}

// ---------------------------------------------------------------- move-out inspection + deposit settlement (STAFF, FM)
export async function submitMoveOutInspection(user: UserHydrated, id: string, input: { checklist: InspectionLog['checklist']; damages: InspectionLog['damages']; notes?: string }) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertFacility(user, c.facilityId, 'inspection.move_out');
    const unit = await StorageUnitModel.findById(c.unitId).session(session);
    if (!unit || unit.status !== 'PENDING_INSPECTION') throw Unprocessable('Kho chưa ở trạng thái chờ kiểm tra — hãy xác nhận nhận lại kho trước');

    const damageFee = input.damages.reduce((s, d) => s + d.cost, 0);
    const deductions = Math.min(c.deposit.amount, damageFee + c.balance.outstanding);
    const refundAmount = c.deposit.amount - deductions;
    const outcome: InspectionLog['outcome'] = input.damages.some((d) => d.severity === 'SEVERE') ? 'MAINTENANCE_REQUIRED' : input.damages.length ? 'PASS_WITH_DAMAGE' : 'PASS';
    const now = new Date();

    if (refundAmount > 0 && !c.deposit.paymentId) throw Conflict('Hợp đồng thiếu tham chiếu khoản cọc');
    const damagePay = damageFee > 0
      ? await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'DAMAGE_FEE', amount: damageFee, status: 'SUCCEEDED', method: 'INTERNAL' }, session)
      : null;
    const refundPay = refundAmount > 0
      ? await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'REFUND', amount: refundAmount, status: 'SUCCEEDED', method: 'BANK_TRANSFER', refundOf: c.deposit.paymentId ?? null }, session)
      : null;

    const inspectionId = new Types.ObjectId();
    const [inspection] = await InspectionModel.create([{
      _id: inspectionId, facilityId: c.facilityId, unitId: unit._id, contractId: c._id, type: 'MOVE_OUT', status: 'APPROVED',
      inspectorId: user._id, performedAt: now, checklist: input.checklist, damages: input.damages, outcome, notes: input.notes,
      depositSettlement: { depositHeld: c.deposit.amount, deductions, refundAmount, refundPaymentId: refundPay?._id ?? null, damagePaymentId: damagePay?._id ?? null, approvedBy: user._id, approvedAt: now },
    }], { session });

    // Outstanding charges are settled from the deposit
    await PaymentModel.updateMany({ contractId: c._id, direction: 'CHARGE', status: 'PENDING' }, { $set: { status: 'CANCELLED' }, $push: { statusHistory: { from: 'PENDING', to: 'CANCELLED', at: now, reason: 'Cấn trừ vào tiền cọc' } } }, { session });

    c.transitionTo('CLOSED', { actor: user.role, by: user._id });
    c.closedAt = now;
    c.moveOut = { requestedAt: c.moveOut?.requestedAt ?? now, scheduledFor: c.moveOut?.scheduledFor ?? null, completedAt: now, inspectionId };
    c.deposit.refundedAmount = refundAmount;
    c.deposit.status = refundAmount === c.deposit.amount ? 'REFUNDED' : refundAmount === 0 ? 'FORFEITED' : 'PARTIALLY_REFUNDED';
    c.balance.outstanding = 0;
    c.delinquency = null;
    await c.save({ session });

    const next: UnitStatus = outcome === 'MAINTENANCE_REQUIRED' ? 'MAINTENANCE' : 'AVAILABLE';
    unit.transitionTo(next, { actor: user.role, by: user._id, reason: next === 'MAINTENANCE' ? 'Hư hại sau trả kho' : undefined });
    unit.currentContractId = null;
    unit.overlockActive = false;
    await unit.save({ session });

    const r = await ReservationModel.findById(c.reservationId).session(session);
    if (r && r.status === 'CHECKED_IN') { r.transitionTo('COMPLETED', { actor: 'SYSTEM' }); await r.save({ session }); }

    await audit({ action: 'inspection.move_out', entityType: 'InspectionLog', entityId: inspectionId, facilityId: c.facilityId, changes: { after: { damageFee, refundAmount, outcome } } }, session);
    return { inspection, contract: c };
  });
}
