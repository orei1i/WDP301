import { Types, type ClientSession } from 'mongoose';
import type { SwapMethod } from '@ssm/shared';
import {
  RentalContractModel, ReservationModel, StorageUnitModel, UnitSwapRequestModel, UnitTypeModel, type UserHydrated,
} from '../../shared/db/models';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess, assertFacility } from '../../shared/http/scope';
import { audit } from '../audit/audit.service';
import { withTxn } from '../../shared/db/txn';
import { createPayment } from '../payments/payment.service';
import { addDays } from '../../shared/utils/dates';
import { defaultSwapFee, SWAP_FEE_MAX, SWAP_SELF_MOVE_DAYS } from './swap-rules';

const loadContract = async (id: string, session?: ClientSession) => {
  const c = await RentalContractModel.findById(id).session(session ?? null);
  if (!c) throw NotFound('hợp đồng');
  return c;
};
const load = async (id: string, session?: ClientSession) => {
  const r = await UnitSwapRequestModel.findById(id).session(session ?? null);
  if (!r) throw NotFound('yêu cầu đổi ô');
  return r;
};

// ---------------------------------------------------------------- gửi yêu cầu (CUSTOMER chủ hợp đồng)
/**
 * Ô mới bị giữ (RESERVED) ngay khi gửi yêu cầu — chưa cần FM duyệt — để không ai khác lấy mất ô
 * khách vừa chọn trong lúc chờ xét duyệt. Nếu FM từ chối thì nhả lại; nếu duyệt thì giữ tiếp tới khi
 * hoàn tất hoặc hết hạn 7 ngày (tự chuyển).
 */
export async function createSwapRequest(user: UserHydrated, contractId: string, input: { toUnitId: string; method: SwapMethod; reason: string }) {
  return withTxn(async (session) => {
    const c = await loadContract(contractId, session);
    await assertCanAccess(user, c, 'swap_request.create');
    if (c.status !== 'ACTIVE') throw Unprocessable('Chỉ đổi ô cho hợp đồng đang hiệu lực');
    if (c.balance.outstanding > 0) throw Unprocessable('Hợp đồng còn công nợ — thu xong mới đổi ô');
    if (String(c.unitId) === String(input.toUnitId)) throw Unprocessable('Ô mới trùng với ô đang thuê');

    const existing = await UnitSwapRequestModel.findOne({ contractId: c._id, status: { $in: ['SUBMITTED', 'APPROVED'] } }).session(session);
    if (existing) throw Conflict('Hợp đồng đang có một yêu cầu đổi ô chưa xử lý xong', 'SWAP_ALREADY_OPEN');

    const id = new Types.ObjectId();
    const now = new Date();
    const toUnit = await StorageUnitModel.findOneAndUpdate(
      { _id: input.toUnitId, facilityId: c.facilityId, unitTypeId: c.unitTypeId, status: 'AVAILABLE', isDeleted: false },
      { $set: { status: 'RESERVED', currentSwapRequestId: id, statusChangedAt: now, statusReason: 'Giữ cho yêu cầu đổi ô đang chờ duyệt' } },
      { new: true, session },
    );
    if (!toUnit) throw Conflict('Ô kho đã chọn không còn trống hoặc không cùng loại với ô đang thuê', 'UNIT_NOT_AVAILABLE');
    await UnitTypeModel.updateOne({ _id: c.unitTypeId }, { $inc: { inventoryVersion: 1 } }, { session });

    const [req] = await UnitSwapRequestModel.create([{
      _id: id, facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, unitTypeId: c.unitTypeId,
      fromUnitId: c.unitId, toUnitId: toUnit._id, method: input.method, reason: input.reason, status: 'SUBMITTED',
    }], { session });
    await audit({ action: 'swap_request.create', entityType: 'UnitSwapRequest', entityId: id, facilityId: c.facilityId, changes: { after: { requestNumber: req.requestNumber, toUnit: toUnit.unitNumber, method: input.method } } }, session);
    return req;
  });
}

// ---------------------------------------------------------------- duyệt / từ chối (FACILITY_MANAGER)
export async function decideSwapRequest(user: UserHydrated, id: string, input: {
  approve: boolean; facilityFault?: boolean; fee?: number; scheduledFor?: string; rejectReason?: string;
}) {
  return withTxn(async (session) => {
    const req = await UnitSwapRequestModel.findById(id).session(session);
    if (!req) throw NotFound('yêu cầu đổi ô');
    await assertFacility(user, req.facilityId, 'swap_request.decide');
    if (req.status !== 'SUBMITTED') throw Unprocessable('Yêu cầu đã được xử lý');

    if (!input.approve) {
      if (!input.rejectReason) throw Unprocessable('Cần ghi lý do từ chối');
      await StorageUnitModel.updateOne(
        { _id: req.toUnitId, status: 'RESERVED', currentSwapRequestId: req._id },
        { $set: { status: 'AVAILABLE', currentSwapRequestId: null, statusChangedAt: new Date(), statusReason: 'Yêu cầu đổi ô bị từ chối' } },
        { session },
      );
      req.rejectReason = input.rejectReason;
      req.transitionTo('REJECTED', { actor: user.role, by: user._id, reason: input.rejectReason });
      await req.save({ session });
      await audit({ action: 'swap_request.reject', entityType: 'UnitSwapRequest', entityId: req._id, facilityId: req.facilityId, reason: input.rejectReason }, session);
      return req;
    }

    if (req.method === 'DELIVERY' && !input.scheduledFor) throw Unprocessable('Thuê người chuyển thì cần hẹn ngày chi nhánh cử người chuyển');

    const priorSwaps = await UnitSwapRequestModel.countDocuments({ contractId: req.contractId, status: 'DONE' }).session(session);
    const facilityFault = input.facilityFault ?? false;
    const defaultFee = defaultSwapFee({ facilityFault, isFirstSwap: priorSwaps === 0, method: req.method });
    const fee = Math.max(0, Math.trunc(input.fee ?? defaultFee));
    if (fee > SWAP_FEE_MAX) throw Unprocessable(`Phí đổi ô tối đa ${SWAP_FEE_MAX.toLocaleString('vi-VN')} ₫`);

    req.facilityFault = facilityFault;
    req.fee = fee;
    req.decidedBy = user._id;
    req.decidedAt = new Date();
    if (req.method === 'SELF') req.moveDeadline = addDays(new Date(), SWAP_SELF_MOVE_DAYS);
    else req.scheduledFor = new Date(input.scheduledFor!);
    req.transitionTo('APPROVED', { actor: user.role, by: user._id, reason: facilityFault ? 'Lỗi từ chi nhánh — miễn phí' : undefined });
    await req.save({ session });
    await audit({
      action: 'swap_request.approve', entityType: 'UnitSwapRequest', entityId: req._id, facilityId: req.facilityId,
      changes: { after: { fee, facilityFault, method: req.method, moveDeadline: req.moveDeadline, scheduledFor: req.scheduledFor } },
    }, session);
    return req;
  });
}

// ---------------------------------------------------------------- hoàn tất (STAFF, FACILITY_MANAGER)
/**
 * Xác nhận khách đã chuyển đồ xong — lúc này mới THẬT SỰ đổi ô: chiếm ô mới (đã giữ từ lúc duyệt),
 * nhả ô cũ về chờ kiểm tra, hợp đồng trỏ sang ô mới, thu phí (nếu có). Cùng bốn bất biến với
 * contract.service.swapUnit (chiếm mới trước, nhả cũ sau, CAS, $inc inventoryVersion).
 */
export async function completeSwapRequest(user: UserHydrated, id: string) {
  return withTxn(async (session) => {
    const req = await UnitSwapRequestModel.findById(id).session(session);
    if (!req) throw NotFound('yêu cầu đổi ô');
    await assertFacility(user, req.facilityId, 'swap_request.complete');
    if (req.status !== 'APPROVED') throw Unprocessable('Chỉ hoàn tất yêu cầu đã được duyệt');

    const c = await RentalContractModel.findById(req.contractId).session(session);
    if (!c) throw NotFound('hợp đồng');
    const now = new Date();

    const toUnit = await StorageUnitModel.findOneAndUpdate(
      { _id: req.toUnitId, status: 'RESERVED', currentSwapRequestId: req._id },
      { $set: { status: 'OCCUPIED', currentSwapRequestId: null, currentContractId: c._id, statusChangedAt: now, statusReason: `Đổi ô cho ${c.contractNumber}` } },
      { new: true, session },
    );
    if (!toUnit) throw Conflict('Ô kho không còn ở trạng thái giữ chỗ mong đợi — liên hệ quản lý', 'UNIT_STATE_MISMATCH');

    const fromUnit = await StorageUnitModel.findOneAndUpdate(
      { _id: req.fromUnitId, status: 'OCCUPIED', currentContractId: c._id },
      { $set: { status: 'PENDING_INSPECTION', currentContractId: null, overlockActive: false, statusChangedAt: now, statusReason: `Khách đã chuyển sang ô ${toUnit.unitNumber}` } },
      { new: true, session },
    );
    if (!fromUnit) throw Conflict('Ô kho đang thuê không ở trạng thái mong đợi — liên hệ quản lý', 'UNIT_STATE_MISMATCH');

    const feePayment = req.fee > 0
      ? await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'PENALTY', amount: req.fee, status: 'PENDING', method: 'INTERNAL' }, session)
      : null;

    c.unitId = toUnit._id;
    c.unitSwaps = [...(c.unitSwaps ?? []), { fromUnitId: fromUnit._id, toUnitId: toUnit._id, reason: req.reason, fee: req.fee, paymentId: feePayment?._id ?? null, at: now, by: user._id }];
    if (req.fee > 0) c.balance.outstanding += req.fee;
    await c.save({ session });

    // Đặt chỗ gốc đi theo hợp đồng để lịch sử của khách không lệch ô (giống contract.service.swapUnit).
    await ReservationModel.updateOne({ _id: c.reservationId, status: 'CHECKED_IN' }, { $set: { unitId: toUnit._id } }, { session });
    await UnitTypeModel.updateOne({ _id: c.unitTypeId }, { $inc: { inventoryVersion: 1 } }, { session });

    req.completedAt = now;
    req.paymentId = feePayment?._id ?? null;
    req.transitionTo('DONE', { actor: user.role, by: user._id });
    await req.save({ session });

    await audit({
      action: 'swap_request.complete', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId,
      changes: { before: { unit: fromUnit.unitNumber }, after: { unit: toUnit.unitNumber, fee: req.fee } },
    }, session);
    return { request: req, contract: c, fromUnit, toUnit };
  });
}

// ---------------------------------------------------------------- khách tự rút (CUSTOMER, khi còn SUBMITTED)
export async function cancelSwapRequest(user: UserHydrated, id: string) {
  return withTxn(async (session) => {
    const req = await load(id, session);
    await assertCanAccess(user, req, 'swap_request.cancel');
    if (req.status !== 'SUBMITTED') throw Unprocessable('Chỉ rút được yêu cầu đang chờ duyệt');
    await StorageUnitModel.updateOne(
      { _id: req.toUnitId, status: 'RESERVED', currentSwapRequestId: req._id },
      { $set: { status: 'AVAILABLE', currentSwapRequestId: null, statusChangedAt: new Date(), statusReason: 'Khách đã rút yêu cầu đổi ô' } },
      { session },
    );
    req.transitionTo('CANCELLED', { actor: user.role, by: user._id });
    await req.save({ session });
    await audit({ action: 'swap_request.cancel', entityType: 'UnitSwapRequest', entityId: req._id, facilityId: req.facilityId }, session);
    return req;
  });
}

// ---------------------------------------------------------------- job nền: hết hạn 7 ngày tự chuyển
export async function expireSwapRequests() {
  const stale = await UnitSwapRequestModel.find({ status: 'APPROVED', method: 'SELF', moveDeadline: { $lte: new Date() } }, { _id: 1 }).limit(100).lean();
  for (const { _id } of stale) {
    try {
      await withTxn(async (session) => {
        const req = await UnitSwapRequestModel.findById(_id).session(session);
        if (!req || req.status !== 'APPROVED') return;
        await StorageUnitModel.updateOne(
          { _id: req.toUnitId, status: 'RESERVED', currentSwapRequestId: req._id },
          { $set: { status: 'AVAILABLE', currentSwapRequestId: null, statusChangedAt: new Date(), statusReason: 'Quá hạn 7 ngày tự chuyển' } },
          { session },
        );
        req.transitionTo('EXPIRED', { actor: 'SYSTEM' });
        await req.save({ session });
        await audit({ action: 'swap_request.expire', entityType: 'UnitSwapRequest', entityId: req._id, facilityId: req.facilityId }, session);
      });
    } catch (e) { console.error('swap-expiry', _id, e); }
  }
  if (stale.length) console.log(`[job:swap-expiry] hết hạn ${stale.length} yêu cầu`);
}

// ---------------------------------------------------------------- truy vấn
export async function listSwapRequestsForContract(user: UserHydrated, contractId: string) {
  const c = await loadContract(contractId);
  await assertCanAccess(user, c, 'swap_request.read');
  return UnitSwapRequestModel.find({ contractId }).sort({ createdAt: -1 });
}

export async function getSwapRequest(user: UserHydrated, id: string) {
  const req = await load(id);
  await assertFacility(user, req.facilityId, 'swap_request.read');
  return req;
}

export interface SwapQueueFilter { facilityId?: string; status?: string }
export async function listSwapRequestsQueue(user: UserHydrated, filter: SwapQueueFilter, page: number, limit: number) {
  const q: Record<string, unknown> = {};
  if (filter.facilityId) { await assertFacility(user, filter.facilityId, 'swap_request.read'); q.facilityId = filter.facilityId; }
  else if (user.role === 'STAFF' || user.role === 'FACILITY_MANAGER') q.facilityId = { $in: user.facilityIds };
  if (filter.status) q.status = filter.status;
  const [items, total] = await Promise.all([
    UnitSwapRequestModel.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('customerId', 'fullName phone').populate('fromUnitId', 'unitNumber').populate('toUnitId', 'unitNumber'),
    UnitSwapRequestModel.countDocuments(q),
  ]);
  return { items, total, page, limit };
}
