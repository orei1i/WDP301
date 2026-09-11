import { Router } from 'express';
import { z } from 'zod';
import { AccessMethod, CancellationReason, enumValues, PaymentMethod, ReservationStatus } from '@ssm/shared';
import { ReservationModel } from '../db/models';
import { NotFound } from '../core/errors';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { assertCanAccess, scopeFilter, scopeQueryFacility } from '../middlewares/scope';
import { idParams, paging, validate, zDate, zId } from '../middlewares/validate';
import { allocate, cancelReservation, checkIn, createReservation, lookupForCheckIn, payDeposit, unallocate } from '../services/reservation.service';

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

reservationsRouter.post('/', authorize('CUSTOMER'), validate({ body: z.object({
  unitTypeId: zId, startDate: zDate, months: z.number().int().min(1).max(60), source: z.enum(['WEB', 'MOBILE']).default('WEB'),
  idempotencyKey: z.string().min(8).max(100).optional(),
}) }), async (req, res) => {
  res.status(201).json(await createReservation(req.auth!.user, { ...req.valid.body, idempotencyKey: req.valid.body.idempotencyKey ?? req.header('idempotency-key') }));
});

reservationsRouter.post('/:id/pay-deposit', authorize('CUSTOMER'), validate({ params: idParams, body: z.object({ method: onlinePay }) }), async (req, res) => {
  res.json(await payDeposit(req.auth!.user, req.valid.params.id, req.valid.body.method));
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

reservationsRouter.post('/:id/check-in', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({
  accessMethod: e(AccessMethod), keyTag: z.string().max(40).optional(), payMethod: e(PaymentMethod).refine((m) => m !== 'INTERNAL'), qrToken: z.string().optional(),
}) }), async (req, res) => {
  res.json(await checkIn(req.auth!.user, req.valid.params.id, req.valid.body));
});
