import { Router } from 'express';
import { z } from 'zod';
import { enumValues, Role, UserStatus } from '@ssm/shared';
import { FacilityModel, UserModel } from '../../shared/db/models';
import { authenticate } from '../../shared/http/authenticate';
import { authorize } from '../../shared/http/authorize';
import { idParams, paging, validate, zId } from '../../shared/http/validate';
import { Unprocessable } from '../../shared/core/errors';
import { createStaffUser, updateUser } from './user.service';

const e = <T extends string>(o: Record<string, T>) => z.enum(enumValues(o) as [T, ...T[]]);

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
  if (b.role === 'FACILITY_MANAGER' && b.facilityIds.length !== 1) throw Unprocessable('Quản lý chi nhánh chỉ phụ trách đúng 1 chi nhánh');
  if (b.facilityIds.length && (await FacilityModel.countDocuments({ _id: { $in: b.facilityIds } })) !== b.facilityIds.length) throw Unprocessable('Chi nhánh không tồn tại');
  res.status(201).json(await createStaffUser({ ...b, facilityIds: scopedRoles(b.role) ? b.facilityIds : [] }));
});

usersRouter.patch('/:id', validate({ params: idParams, body: z.object({
  fullName: z.string().min(2).max(120).optional(), role: e(Role).optional(), facilityIds: z.array(zId).optional(), status: e(UserStatus).optional(),
}) }), async (req, res) => {
  const b = req.valid.body;
  // Model cũng chặn, nhưng báo ở đây thì thông báo dễ hiểu hơn lỗi validation của Mongoose.
  if (b.role === 'FACILITY_MANAGER' && b.facilityIds && b.facilityIds.length !== 1) throw Unprocessable('Quản lý chi nhánh chỉ phụ trách đúng 1 chi nhánh');
  res.json(await updateUser(req.auth!.user, req.valid.params.id, b));
});
