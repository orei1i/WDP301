import { Types, type ClientSession } from 'mongoose';
import type { InspectionLog, PaymentMethod, UnitStatus } from '@ssm/shared';
import { InspectionModel, PaymentModel, RentalContractModel, ReservationModel, StorageUnitModel, type UserHydrated } from '../db/models';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../core/errors';
import { assertCanAccess, assertFacility } from '../middlewares/scope';
import { effectivePolicy } from '../domain/pricing';
import { addDays, addMonthsUTC, daysBetween, todayUTC, toDateOnly } from '../domain/dates';
import { audit } from './audit.service';
import { withTxn } from './txn';
import { createPayment } from './payments';

const loadContract = async (id: string, session?: ClientSession) => {
  const c = await RentalContractModel.findById(id).session(session ?? null);
  if (!c) throw NotFound('hợp đồng');
  return c;
};

// ---------------------------------------------------------------- extend (CUSTOMER owner)
export async function extendContract(user: UserHydrated, id: string, months: number, method: PaymentMethod) {
  return withTxn(async (session) => {
    const c = await loadContract(id, session);
    await assertCanAccess(user, c, 'contract.extend');
    if (c.status !== 'ACTIVE') throw Unprocessable('Chỉ gia hạn được hợp đồng đang hiệu lực, không có công nợ');
    const policy = await effectivePolicy(c.facilityId, session);
    const totalMonths = daysBetween(c.startDate, addMonthsUTC(c.endDate, months)) / 30;
    if (totalMonths > policy.maxRentalMonths + 1) throw Unprocessable(`Tổng thời hạn vượt tối đa ${policy.maxRentalMonths} tháng`);

    const newEnd = addMonthsUTC(c.endDate, months);
    const pay = await createPayment({
      facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'RENEWAL',
      amount: c.billing.monthlyRate * months, status: 'SUCCEEDED', method, period: { start: c.endDate, end: newEnd },
    }, session);
    c.renewals.push({ previousEndDate: c.endDate, newEndDate: newEnd, months, paymentId: pay._id, at: new Date() });
    c.endDate = newEnd;
    await c.save({ session });
    await audit({ action: 'contract.extend', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, changes: { after: { months, amount: pay.amount, endDate: newEnd } } }, session);
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
