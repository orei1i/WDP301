import { Types, type ClientSession } from 'mongoose';
import { accessFeeOf, type AccessMethod, type AccessRequestType, type PaymentMethod } from '@ssm/shared';
import {
  PaymentModel, RentalContractModel, type UserHydrated,
} from '../../shared/db/models';
import { AccessRequestModel, type AccessRequestHydrated } from './access-request.model';
import { Conflict, Forbidden, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess, assertFacility } from '../../shared/http/scope';
import { decryptSecret, encryptSecret } from '../../shared/crypto/secret-box';
import { audit } from '../audit/audit.service';
import { withTxn } from '../../shared/db/txn';
import { createPayment, sha256, sixDigitPin } from '../payments/payment.service';
import { effectivePolicy } from '../policies/pricing';

/** Loại yêu cầu theo hình thức khoá của ô — khách không tự chọn. */
const TYPE_BY_METHOD: Record<AccessMethod, AccessRequestType> = { PIN: 'PIN_RESET', RFID_CARD: 'CARD_REISSUE', PHYSICAL_KEY: 'KEY_REISSUE' };

/** Hợp đồng còn giữ ô và chưa bị khoá truy cập thì mới cấp lại được. */
const REQUESTABLE_CONTRACT_STATUS = ['ACTIVE', 'DELINQUENT', 'MOVE_OUT_PENDING'];

// ---------------------------------------------------------------- khách xem phương tiện vào kho
/**
 * Chỉ CHỦ hợp đồng xem được (nhân viên/quản lý không bao giờ thấy mật khẩu). Mỗi lần xem ghi nhật ký. PIN lưu mã hoá
 * AES-GCM; hợp đồng cũ chỉ có bản băm một chiều → `pin: null` + `reason: 'NOT_STORED'`, khách xin đặt lại để nhận mã mới.
 */
export async function getContractAccess(user: UserHydrated, contractId: string) {
  const c = await RentalContractModel.findById(contractId).select('+access.credentialEnc');
  if (!c) throw NotFound('hợp đồng');
  await assertCanAccess(user, c, 'contract.access_view');
  if (user.role !== 'CUSTOMER') throw Forbidden('Chỉ chủ hợp đồng xem được mã vào kho', 'OWNER_ONLY');

  const method = c.access.method;
  const suspended = !!c.access.suspendedAt || c.status === 'LOCKED_OUT';
  let pin: string | null = null;
  let reason: 'NOT_STORED' | 'SUSPENDED' | 'NOT_PIN' | null = null;
  if (method !== 'PIN') reason = 'NOT_PIN';
  else if (suspended) reason = 'SUSPENDED';
  else {
    pin = decryptSecret(c.access.credentialEnc);
    if (!pin) reason = 'NOT_STORED';
  }
  if (pin) await audit({ action: 'contract.access_view', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId });
  return { method, keyTag: c.access.keyTag ?? null, issuedAt: c.access.issuedAt ?? null, suspended, pin, reason };
}

// ---------------------------------------------------------------- gửi yêu cầu (CUSTOMER chủ hợp đồng)
/** Phí (nếu có) trả ngay khi gửi, như đặt dịch vụ; bị từ chối hoặc huỷ trước khi xong thì hoàn đủ. */
export async function createAccessRequest(user: UserHydrated, input: { contractId: string; reason?: string; method?: PaymentMethod }) {
  return withTxn(async (session) => {
    const c = await RentalContractModel.findById(input.contractId).session(session);
    if (!c) throw NotFound('hợp đồng');
    await assertCanAccess(user, c, 'access.request');
    if (!REQUESTABLE_CONTRACT_STATUS.includes(c.status)) throw Unprocessable('Hợp đồng đang bị khoá truy cập hoặc đã kết thúc — hãy liên hệ chi nhánh');
    if (await AccessRequestModel.exists({ contractId: c._id, status: { $in: ['REQUESTED', 'APPROVED'] } }).session(session)) {
      throw Conflict('Kho này đang có một yêu cầu cấp lại chưa xử lý xong', 'REQUEST_PENDING');
    }

    const type = TYPE_BY_METHOD[c.access.method];
    const policy = await effectivePolicy(c.facilityId, session);
    const fee = accessFeeOf(policy, type);
    let paymentId: Types.ObjectId | null = null;
    if (fee > 0) {
      if (!input.method) throw Unprocessable('Chọn hình thức thanh toán phí cấp lại', 'PAYMENT_METHOD_REQUIRED');
      if (user.role === 'CUSTOMER' && input.method === 'CASH') throw Unprocessable('Thanh toán tiền mặt chỉ thực hiện tại quầy');
      const pay = await createPayment({
        facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'ACCESS_FEE', amount: fee, status: 'SUCCEEDED', method: input.method,
      }, session);
      paymentId = pay._id;
    }

    const id = new Types.ObjectId();
    const [req] = await AccessRequestModel.create([{
      _id: id, facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, unitId: c.unitId,
      type, accessMethod: c.access.method, reason: input.reason?.trim() || undefined, fee, status: 'REQUESTED', paymentId,
    }], { session });
    await audit({ action: 'access.request', entityType: 'AccessRequest', entityId: id, facilityId: c.facilityId, changes: { after: { requestNumber: req.requestNumber, type, fee } } }, session);
    return req;
  });
}

/** Hoàn đủ phí khi từ chối/huỷ. */
async function refundFee(o: AccessRequestHydrated, by: Types.ObjectId, reason: string, session: ClientSession) {
  if (!o.paymentId || o.fee <= 0) return;
  const paid = await PaymentModel.findById(o.paymentId).session(session);
  if (!paid || paid.status !== 'SUCCEEDED') return;
  const refund = await createPayment({
    facilityId: o.facilityId, customerId: o.customerId, contractId: o.contractId, type: 'REFUND', amount: o.fee,
    status: 'SUCCEEDED', method: 'BANK_TRANSFER', refundOf: paid._id,
  }, session);
  paid.refundedAmount = o.fee;
  paid.transitionTo('REFUNDED', { actor: 'SYSTEM', by, reason });
  await paid.save({ session });
  o.refundPaymentId = refund._id;
}

// ---------------------------------------------------------------- duyệt / từ chối (chỉ FACILITY_MANAGER)
export async function decideAccessRequest(user: UserHydrated, id: string, input: { approve: boolean; note?: string }) {
  return withTxn(async (session) => {
    const o = await AccessRequestModel.findById(id).session(session);
    if (!o) throw NotFound('yêu cầu');
    await assertFacility(user, o.facilityId, 'access.decide');
    const now = new Date();

    if (!input.approve) {
      if (!input.note?.trim()) throw Unprocessable('Cần ghi lý do từ chối');
      o.transitionTo('REJECTED', { actor: user.role, by: user._id, reason: input.note });
      o.decisionNote = input.note.trim();
      o.decidedBy = user._id; o.decidedAt = now;
      await refundFee(o, user._id, 'Yêu cầu cấp lại bị từ chối', session);
      await o.save({ session });
      await audit({ action: 'access.reject', entityType: 'AccessRequest', entityId: o._id, facilityId: o.facilityId, reason: o.decisionNote, changes: { after: { refund: o.fee } } }, session);
      return o;
    }

    const c = await RentalContractModel.findById(o.contractId).session(session);
    if (!c || !REQUESTABLE_CONTRACT_STATUS.includes(c.status)) throw Unprocessable('Hợp đồng không còn ở trạng thái cấp lại được');
    o.transitionTo('APPROVED', { actor: user.role, by: user._id });
    o.decidedBy = user._id; o.decidedAt = now;
    if (input.note?.trim()) o.decisionNote = input.note.trim();

    if (o.type === 'PIN_RESET') {
      // Mật khẩu: cấp mã mới ngay khi duyệt; người duyệt KHÔNG thấy mã — chỉ chủ hợp đồng xem được trong app.
      const pin = sixDigitPin();
      c.set('access.credentialHash', sha256(pin));
      c.set('access.credentialEnc', encryptSecret(pin));
      c.set('access.issuedAt', now);
      c.set('access.issuedBy', user._id);
      await c.save({ session });
      o.transitionTo('DONE', { actor: 'SYSTEM', by: user._id, reason: 'Đã cấp mật khẩu mới' });
      o.completedAt = now;
    }
    await o.save({ session });
    await audit({ action: 'access.approve', entityType: 'AccessRequest', entityId: o._id, facilityId: o.facilityId, changes: { after: { type: o.type, status: o.status } } }, session);
    return o;
  });
}

// ---------------------------------------------------------------- bàn giao thẻ / chìa mới (STAFF, FM)
export async function completeAccessRequest(user: UserHydrated, id: string, input: { keyTag: string }) {
  return withTxn(async (session) => {
    const o = await AccessRequestModel.findById(id).session(session);
    if (!o) throw NotFound('yêu cầu');
    await assertFacility(user, o.facilityId, 'access.complete');
    if (o.type === 'PIN_RESET') throw Unprocessable('Mật khẩu được cấp tự động khi duyệt');
    const c = await RentalContractModel.findById(o.contractId).session(session);
    if (!c) throw NotFound('hợp đồng');
    const now = new Date();
    o.transitionTo('DONE', { actor: user.role, by: user._id });
    o.completedAt = now; o.completedBy = user._id; o.newKeyTag = input.keyTag.trim();
    c.set('access.keyTag', o.newKeyTag);
    c.set('access.issuedAt', now);
    c.set('access.issuedBy', user._id);
    await c.save({ session });
    await o.save({ session });
    await audit({ action: 'access.complete', entityType: 'AccessRequest', entityId: o._id, facilityId: o.facilityId, changes: { after: { type: o.type, keyTag: o.newKeyTag } } }, session);
    return o;
  });
}

// ---------------------------------------------------------------- huỷ (CUSTOMER; FM khi đã duyệt mà không làm được) → hoàn phí
export async function cancelAccessRequest(user: UserHydrated, id: string, reason?: string) {
  return withTxn(async (session) => {
    const o = await AccessRequestModel.findById(id).session(session);
    if (!o) throw NotFound('yêu cầu');
    await assertCanAccess(user, o, 'access.cancel');
    o.transitionTo('CANCELLED', { actor: user.role, by: user._id, reason });
    o.cancelReason = reason?.trim() || (user.role === 'CUSTOMER' ? 'Khách huỷ' : 'Chi nhánh huỷ');
    await refundFee(o, user._id, 'Huỷ yêu cầu cấp lại', session);
    await o.save({ session });
    await audit({ action: 'access.cancel', entityType: 'AccessRequest', entityId: o._id, facilityId: o.facilityId, reason: o.cancelReason, changes: { after: { refund: o.fee } } }, session);
    return o;
  });
}
