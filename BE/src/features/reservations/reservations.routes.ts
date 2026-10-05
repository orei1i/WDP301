import { Router } from 'express';
import { z } from 'zod';
import { CancellationReason, CheckInShift, enumValues, PaymentMethod, RentalPeriod, ReservationStatus, SignatureMethod } from '@ssm/shared';
import { ReservationModel } from '../../shared/db/models';
import { NotFound } from '../../shared/core/errors';
import { authenticate } from '../../shared/http/authenticate';
import { authorize } from '../../shared/http/authorize';
import { assertCanAccess, scopeFilter, scopeQueryFacility } from '../../shared/http/scope';
import { idParams, paging, validate, zDate, zId } from '../../shared/http/validate';
import { contractPdfFor, resendContractEmail } from './contract-document.service';
import {
  allocate, cancelReservation, checkIn, createReservation, createReservationsBatch, lookupForCheckIn, payDeposit,
  reissueCheckInQr, signContract, unallocate, type BookingItem,
} from './reservation.service';

const e = <T extends string>(o: Record<string, T>) => z.enum(enumValues(o) as [T, ...T[]]);
const onlinePay = z.enum(['VNPAY', 'MOMO', 'CARD', 'BANK_TRANSFER']);

export const reservationsRouter = Router();
reservationsRouter.use(authenticate);

reservationsRouter.get('/', validate({ query: paging.extend({ facilityId: zId.optional(), status: z.string().optional(), from: zDate.optional(), to: zDate.optional() }) }), scopeQueryFacility, async (req, res) => {
  const u = req.auth!.user;
  const { page, limit, facilityId, status, from, to } = req.valid.query;
  const filter: Record<string, unknown> = { ...scopeFilter(u, { customerField: 'customerId' }) };
  if (facilityId) filter.facilityId = facilityId;
  if (status) filter.status = { $in: status.split(',').filter((s: string) => (enumValues(ReservationStatus) as string[]).includes(s)) };
  if (from || to) filter.startDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  const [items, total] = await Promise.all([
    ReservationModel.find(filter).sort({ startDate: 1 }).skip((page - 1) * limit).limit(limit)
      .populate('customerId', 'fullName phone').populate('unitTypeId', 'name code').populate('unitId', 'unitNumber'),
    ReservationModel.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

reservationsRouter.get('/lookup', authorize('STAFF', 'FACILITY_MANAGER'), validate({ query: z.object({ code: z.string().min(6) }) }), async (req, res) => {
  res.json(await lookupForCheckIn(req.auth!.user, req.valid.query.code));
});

reservationsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const r = await ReservationModel.findById(req.valid.params.id).populate('unitTypeId', 'name code dimensions').populate('unitId', 'unitNumber location');
  if (!r) throw NotFound('đặt chỗ');
  await assertCanAccess(req.auth!.user, { facilityId: r.facilityId, customerId: r.customerId }, 'reservation.read');
  res.json(r);
});

// Khách bắt buộc chọn ô cụ thể (unitId) trên sơ đồ và chu kỳ thuê (rentalPeriod) — không đặt theo
// "loại kho" trừu tượng rồi chờ phân sau nữa.
const bookingItemBody = z.object({
  unitTypeId: zId, unitId: zId, startDate: zDate, rentalPeriod: e(RentalPeriod), periods: z.number().int().min(1).max(365),
  preferredCheckInShift: e(CheckInShift).default('UNKNOWN'), useAirConditioning: z.boolean().default(false),
  source: z.enum(['WEB', 'MOBILE']).default('WEB'), idempotencyKey: z.string().min(8).max(100).optional(),
});
// Bắt buộc: không có chấp thuận thì không tạo được đặt chỗ. Client chỉ gửi số phiên bản,
// thời điểm và IP do server tự đóng dấu để khách không tự khai được.
const consentBody = z.object({
  termsVersion: z.string().min(1).max(20), privacyVersion: z.string().min(1).max(20),
  // Khách phải xác nhận đã được báo trước KHOẢN THỨ HAI (tiền thuê kỳ đầu, trả THÊM khi nhận kho) — tránh tranh chấp
  // "không được báo". Chỉ dùng để chặn ở API; thời điểm xác nhận do server đóng dấu (consent.paymentScheduleAckAt).
  paymentScheduleAck: z.literal(true, { errorMap: () => ({ message: 'Cần xác nhận đã đọc lịch thanh toán: tiền cọc hôm nay + tiền thuê kỳ đầu trả thêm khi nhận kho' }) }),
});

reservationsRouter.post('/', authorize('CUSTOMER'), validate({ body: bookingItemBody.extend({ consent: consentBody }) }), async (req, res) => {
  const { consent: { paymentScheduleAck: _ack, ...consent }, ...item } = req.valid.body;
  res.status(201).json(await createReservation(req.auth!.user, {
    ...item,
    idempotencyKey: item.idempotencyKey ?? req.header('idempotency-key'),
    consent: { ...consent, ip: req.ip ?? null, userAgent: req.header('user-agent')?.slice(0, 300) ?? null },
  }));
});

/** Đặt nhiều kho một lần (giỏ hàng) — cùng một lần chấp thuận điều khoản cho toàn giỏ. */
reservationsRouter.post('/batch', authorize('CUSTOMER'), validate({ body: z.object({
  items: z.array(bookingItemBody).min(1).max(10),
  consent: consentBody,
}) }), async (req, res) => {
  const { paymentScheduleAck: _ack, ...accepted } = req.valid.body.consent;
  const consent = { ...accepted, ip: req.ip ?? null, userAgent: req.header('user-agent')?.slice(0, 300) ?? null };
  const items: BookingItem[] = req.valid.body.items.map((item: Omit<BookingItem, 'consent'>) => ({ ...item, consent }));
  res.status(201).json({ items: await createReservationsBatch(req.auth!.user, items) });
});

reservationsRouter.post('/:id/pay-deposit', authorize('CUSTOMER'), validate({ params: idParams, body: z.object({ method: onlinePay }) }), async (req, res) => {
  res.json(await payDeposit(req.auth!.user, req.valid.params.id, req.valid.body.method));
});

/**
 * Ký xác nhận hợp đồng sau khi trả cọc — CHỈ chính khách (chủ đặt chỗ) ký, trên tài khoản của họ. Nhân viên
 * không ký thay: tránh việc nhân viên tự điền tên khách rồi bấm đồng ý. Ảnh chữ ký vẽ tay là PNG data URL
 * nhỏ (≤ ~60KB).
 */
reservationsRouter.post('/:id/sign', authorize('CUSTOMER'), validate({ params: idParams, body: z.object({
  signerName: z.string().min(2).max(100), method: e(SignatureMethod), image: z.string().max(80_000).nullable().optional(),
}) }), async (req, res) => {
  res.json(await signContract(req.auth!.user, req.valid.params.id, req.valid.body));
});

/** PDF hợp đồng đã ký (có chữ ký) — khách chủ đặt chỗ hoặc nhân viên/quản lý đúng chi nhánh. */
reservationsRouter.get('/:id/contract.pdf', authorize('CUSTOMER', 'STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER'), validate({ params: idParams }), async (req, res) => {
  const { pdf, filename } = await contractPdfFor(req.auth!.user, req.valid.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdf);
});

/** Gửi lại PDF hợp đồng đã ký tới email của khách (tối thiểu 60 giây giữa hai lần). */
reservationsRouter.post('/:id/contract/email', authorize('CUSTOMER', 'STAFF', 'FACILITY_MANAGER'), validate({ params: idParams }), async (req, res) => {
  res.json(await resendContractEmail(req.auth!.user, req.valid.params.id));
});

/** Cấp lại mã QR nhận kho cho app mobile. Mỗi lần gọi vô hiệu hoá mã đã cấp trước đó. */
reservationsRouter.post('/:id/qr', authorize('CUSTOMER'), validate({ params: idParams }), async (req, res) => {
  res.json(await reissueCheckInQr(req.auth!.user, req.valid.params.id));
});

reservationsRouter.post('/:id/cancel', validate({ params: idParams, body: z.object({ reason: e(CancellationReason).default('CUSTOMER_REQUEST'), note: z.string().max(500).optional() }) }), async (req, res) => {
  const u = req.auth!.user;
  const reason = u.role === 'CUSTOMER' ? 'CUSTOMER_REQUEST' : req.valid.body.reason; // customers can't pick staff-side reasons
  res.json(await cancelReservation(u, req.valid.params.id, reason, req.valid.body.note));
});

reservationsRouter.post('/:id/allocate', authorize('FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ unitId: zId.optional() }) }), async (req, res) => {
  res.json(await allocate(req.auth!.user, req.valid.params.id, req.valid.body.unitId));
});

reservationsRouter.post('/:id/unallocate', authorize('FACILITY_MANAGER'), validate({ params: idParams }), async (req, res) => {
  res.json(await unallocate(req.auth!.user, req.valid.params.id));
});

// Hình thức khoá do loại kho quyết định (server tự lấy) — nhân viên chỉ nhập mã thẻ/chìa nếu cần.
reservationsRouter.post('/:id/check-in', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({
  keyTag: z.string().max(40).optional(), payMethod: e(PaymentMethod).refine((m) => m !== 'INTERNAL'), qrToken: z.string().optional(),
}) }), async (req, res) => {
  res.json(await checkIn(req.auth!.user, req.valid.params.id, req.valid.body));
});
