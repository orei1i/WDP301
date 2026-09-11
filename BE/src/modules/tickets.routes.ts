import { Router } from 'express';
import { z } from 'zod';
import { enumValues, TicketCategory, TicketKind, TicketPriority, TicketStatus } from '@ssm/shared';
import { TicketModel } from '../db/models';
import { NotFound } from '../core/errors';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { assertCanAccess, scopeFilter, scopeQueryFacility } from '../middlewares/scope';
import { idParams, paging, validate, zDate, zId } from '../middlewares/validate';
import { addTicketMessage, assignTicket, createTicket, redactForCustomer, setTicketStatus } from '../services/ticket.service';

const e = <T extends string>(o: Record<string, T>) => z.enum(enumValues(o) as [T, ...T[]]);

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

ticketsRouter.get('/', validate({ query: paging.extend({ facilityId: zId.optional(), status: z.string().optional(), mine: z.enum(['true', 'false']).optional() }) }), scopeQueryFacility, async (req, res) => {
  const u = req.auth!.user;
  const { page, limit, facilityId, status, mine } = req.valid.query;
  const filter: Record<string, unknown> = { ...scopeFilter(u, { customerField: 'reporterId' }) };
  if (facilityId) filter.facilityId = facilityId;
  if (status) filter.status = { $in: status.split(',') };
  if (mine === 'true' && u.role !== 'CUSTOMER') filter.assigneeId = u._id;
  const items = await TicketModel.find(filter).sort({ dueAt: 1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  res.json({ items: items.map((t) => redactForCustomer(t, u.role === 'CUSTOMER')), page, limit });
});

ticketsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const t = await TicketModel.findById(req.valid.params.id).lean();
  if (!t) throw NotFound('yêu cầu');
  await assertCanAccess(req.auth!.user, t, 'ticket.read');
  res.json(redactForCustomer(t, req.auth!.user.role === 'CUSTOMER'));
});

ticketsRouter.post('/', validate({ body: z.object({
  facilityId: zId, kind: e(TicketKind).default('CUSTOMER_ISSUE'), category: e(TicketCategory), priority: e(TicketPriority).default('MEDIUM'),
  subject: z.string().min(5).max(200), description: z.string().max(5000).optional(), unitId: zId.nullish(), contractId: zId.nullish(),
  assigneeId: zId.nullish(), dueAt: zDate.nullish(),
}) }), async (req, res) => {
  res.status(201).json(await createTicket(req.auth!.user, req.valid.body));
});

ticketsRouter.post('/:id/assign', authorize('FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ assigneeId: zId }) }), async (req, res) => {
  res.json(await assignTicket(req.auth!.user, req.valid.params.id, req.valid.body.assigneeId));
});
ticketsRouter.post('/:id/status', validate({ params: idParams, body: z.object({ to: e(TicketStatus) }) }), async (req, res) => {
  res.json(await setTicketStatus(req.auth!.user, req.valid.params.id, req.valid.body.to));
});
ticketsRouter.post('/:id/messages', validate({ params: idParams, body: z.object({ body: z.string().min(1).max(5000), internal: z.boolean().default(false) }) }), async (req, res) => {
  const t = await addTicketMessage(req.auth!.user, req.valid.params.id, req.valid.body.body, req.valid.body.internal);
  res.status(201).json(redactForCustomer(t.toObject(), req.auth!.user.role === 'CUSTOMER'));
});
