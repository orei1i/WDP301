import { Router } from 'express';
import { z } from 'zod';
import { enumValues, Role, UserStatus } from '@ssm/shared';
import { AuditLogModel, FacilityModel, PolicyModel, UserModel } from '../db/models';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { assertFacility, isScoped } from '../middlewares/scope';
import { idParams, paging, validate, zId } from '../middlewares/validate';
import { effectivePolicy } from '../domain/pricing';
import { publishPolicy } from '../services/policy.service';
import { createStaffUser, updateUser } from '../services/user.service';
import { occupancy, receivables, revenueByMonth } from '../services/report.service';
import { Unprocessable } from '../core/errors';

const e = <T extends string>(o: Record<string, T>) => z.enum(enumValues(o) as [T, ...T[]]);

// ---------------------------------------------------------------- policies (OPS_MANAGER)
export const policiesRouter = Router();
policiesRouter.use(authenticate);

policiesRouter.get('/effective/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await effectivePolicy(req.valid.params.id));
});
policiesRouter.get('/', authorize('OPS_MANAGER', 'ADMIN', 'FACILITY_MANAGER'), validate({ query: z.object({ facilityId: zId.optional() }) }), async (req, res) => {
  const fid = req.valid.query.facilityId;
  if (fid) await assertFacility(req.auth!.user, fid);
  res.json({ items: await PolicyModel.find(fid ? { scope: 'FACILITY', facilityId: fid } : { scope: 'GLOBAL' }).sort({ version: -1 }) });
});

const tier = z.object({ minHoursBeforeStart: z.number().min(0), depositRefundPct: z.number().min(0).max(100) });
policiesRouter.post('/', authorize('OPS_MANAGER'), validate({ body: z.object({
  facilityId: zId.nullable().default(null),
  patch: z.object({
    gracePeriodDays: z.number().int().min(0).max(60), lockoutAfterDays: z.number().int().min(1).max(180),
    reservationHoldMinutes: z.number().int().min(5).max(1440), allocationLeadDays: z.number().int().min(0).max(60), noShowAfterHours: z.number().int().min(1).max(168),
    minRentalMonths: z.number().int().min(1), maxRentalMonths: z.number().int().max(120),
    deposit: z.object({ mode: z.enum(['MONTHS_OF_RENT', 'FIXED']), value: z.number().min(0) }),
    lateFees: z.array(z.object({ afterDays: z.number().min(0), kind: z.enum(['FIXED', 'PERCENT_OF_RENT']), value: z.number().min(0), recurringEveryDays: z.number().int().min(1).nullable().default(null) })).max(10),
    cancellation: z.array(tier).max(10),
    discounts: z.array(z.object({ code: z.string(), kind: z.enum(['FIXED', 'PERCENT']), value: z.number().min(0), minMonths: z.number().int().min(1), validFrom: z.coerce.date().nullable().default(null), validTo: z.coerce.date().nullable().default(null), requiresApprovalRole: e(Role).nullable().default(null) })).max(20),
  }).partial().strict(),
}) }), async (req, res) => {
  res.status(201).json(await publishPolicy(req.valid.body.facilityId, req.valid.body.patch));
});

// ---------------------------------------------------------------- users & RBAC (ADMIN)
export const usersRouter = Router();
usersRouter.use(authenticate, authorize('ADMIN'));

usersRouter.get('/', validate({ query: paging.extend({ role: e(Role).optional(), q: z.string().max(100).optional() }) }), async (req, res) => {
  const { page, limit, role, q } = req.valid.query;
  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  if (q) filter.$or = [{ fullName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const [items, total] = await Promise.all([UserModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), UserModel.countDocuments(filter)]);
  res.json({ items, total, page, limit });
});

const scopedRoles = (r: string) => r === 'STAFF' || r === 'FACILITY_MANAGER';
usersRouter.post('/', validate({ body: z.object({
  fullName: z.string().min(2).max(120), email: z.string().email(), role: e(Role), facilityIds: z.array(zId).default([]), status: e(UserStatus).default('ACTIVE'),
}) }), async (req, res) => {
  const b = req.valid.body;
  if (scopedRoles(b.role) && b.facilityIds.length === 0) throw Unprocessable('Vai trò này phải được gán ít nhất 1 chi nhánh');
  if (b.facilityIds.length && (await FacilityModel.countDocuments({ _id: { $in: b.facilityIds } })) !== b.facilityIds.length) throw Unprocessable('Chi nhánh không tồn tại');
  res.status(201).json(await createStaffUser({ ...b, facilityIds: scopedRoles(b.role) ? b.facilityIds : [] }));
});

usersRouter.patch('/:id', validate({ params: idParams, body: z.object({
  fullName: z.string().min(2).max(120).optional(), role: e(Role).optional(), facilityIds: z.array(zId).optional(), status: e(UserStatus).optional(),
}) }), async (req, res) => {
  res.json(await updateUser(req.auth!.user, req.valid.params.id, req.valid.body));
});

// ---------------------------------------------------------------- audit log (ADMIN)
export const auditRouter = Router();
auditRouter.use(authenticate, authorize('ADMIN'));
auditRouter.get('/', validate({ query: paging.extend({ result: z.enum(['SUCCESS', 'DENIED', 'FAILED']).optional(), action: z.string().max(60).optional(), facilityId: zId.optional() }) }), async (req, res) => {
  const { page, limit, result, action, facilityId } = req.valid.query;
  const filter: Record<string, unknown> = {};
  if (result) filter.result = result;
  if (action) filter.action = { $regex: `^${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
  if (facilityId) filter.facilityId = facilityId;
  const items = await AuditLogModel.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).populate('actorId', 'fullName email role');
  res.json({ items, page, limit });
});

// ---------------------------------------------------------------- reports (FM scoped, OPS chain-wide)
export const reportsRouter = Router();
reportsRouter.use(authenticate, authorize('FACILITY_MANAGER', 'OPS_MANAGER', 'ADMIN'));
reportsRouter.get('/summary', validate({ query: z.object({ facilityId: zId.optional(), months: z.coerce.number().int().min(1).max(24).default(6) }) }), async (req, res) => {
  const u = req.auth!.user;
  let ids: string[];
  if (req.valid.query.facilityId) { await assertFacility(u, req.valid.query.facilityId); ids = [req.valid.query.facilityId]; }
  else ids = isScoped(u) ? u.facilityIds.map(String) : (await FacilityModel.find({ status: 'ACTIVE' }, { _id: 1 }).lean()).map((f) => String(f._id));
  const [occ, revenue, ar] = await Promise.all([occupancy(ids), revenueByMonth(ids, req.valid.query.months), receivables(ids)]);
  res.json({ facilityIds: ids, occupancy: occ, revenue, receivables: ar });
});
