import { Router } from 'express';
import { z } from 'zod';
import { enumValues, ContractStatus, ItemCondition, PaymentMethod } from '@ssm/shared';
import { InspectionModel, PaymentModel, RentalContractModel } from '../db/models';
import { NotFound } from '../core/errors';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { assertCanAccess, scopeFilter, scopeQueryFacility } from '../middlewares/scope';
import { idParams, paging, validate, zDate, zId, zMoney } from '../middlewares/validate';
import {
  extendContract, lockout, payBalance, receiveUnit, requestMoveOut, submitMoveOutInspection,
  swapCandidates, swapUnit, SWAP_FEE_MAX, waiveLateFees,
} from '../services/contract.service';

export const contractsRouter = Router();
contractsRouter.use(authenticate);

contractsRouter.get('/', validate({ query: paging.extend({ facilityId: zId.optional(), status: z.string().optional(), overdue: z.enum(['true', 'false']).optional() }) }), scopeQueryFacility, async (req, res) => {
  const { page, limit, facilityId, status, overdue } = req.valid.query;
  const filter: Record<string, unknown> = { ...scopeFilter(req.auth!.user, { customerField: 'customerId' }) };
  if (facilityId) filter.facilityId = facilityId;
  if (status) filter.status = { $in: status.split(',').filter((s: string) => (enumValues(ContractStatus) as string[]).includes(s)) };
  if (overdue === 'true') filter['balance.outstanding'] = { $gt: 0 };
  const [items, total] = await Promise.all([
    RentalContractModel.find(filter).sort({ 'delinquency.daysOverdue': -1, endDate: 1 }).skip((page - 1) * limit).limit(limit)
      .populate('customerId', 'fullName phone').populate('unitId', 'unitNumber location').populate('unitTypeId', 'name'),
    RentalContractModel.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

contractsRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const c = await RentalContractModel.findById(req.valid.params.id).populate('unitId', 'unitNumber location').populate('unitTypeId', 'name');
  if (!c) throw NotFound('hợp đồng');
  await assertCanAccess(req.auth!.user, { facilityId: c.facilityId, customerId: c.customerId }, 'contract.read');
  const payments = await PaymentModel.find({ contractId: c._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ contract: c, payments });
});

const pm = z.enum(enumValues(PaymentMethod) as [string, ...string[]]).refine((m) => m !== 'INTERNAL') as z.ZodType<PaymentMethod>;

contractsRouter.post('/:id/extend', authorize('CUSTOMER'), validate({ params: idParams, body: z.object({ months: z.number().int().min(1).max(24), method: pm }) }), async (req, res) => {
  res.json(await extendContract(req.auth!.user, req.valid.params.id, req.valid.body.months, req.valid.body.method));
});
contractsRouter.post('/:id/pay-balance', authorize('CUSTOMER', 'STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ method: pm }) }), async (req, res) => {
  res.json(await payBalance(req.auth!.user, req.valid.params.id, req.valid.body.method));
});
contractsRouter.post('/:id/lockout', authorize('FACILITY_MANAGER'), validate({ params: idParams }), async (req, res) => {
  res.json(await lockout(req.auth!.user, req.valid.params.id));
});
contractsRouter.post('/:id/waive-late-fees', authorize('FACILITY_MANAGER', 'OPS_MANAGER'), validate({ params: idParams, body: z.object({ reason: z.string().min(5).max(500) }) }), async (req, res) => {
  res.json(await waiveLateFees(req.auth!.user, req.valid.params.id, req.valid.body.reason));
});
// ---- đổi ô kho cùng loại (A1)
contractsRouter.get('/:id/swap-candidates', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams }), async (req, res) => {
  res.json(await swapCandidates(req.auth!.user, req.valid.params.id));
});
contractsRouter.post('/:id/swap-unit', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({
  toUnitId: zId,
  reason: z.string().min(5).max(500).describe('Lý do đổi ô — ghi vào hợp đồng và nhật ký kiểm toán'),
  keyTag: z.string().max(50).optional().describe('Nhãn chìa khóa / thẻ mới, nếu đổi luôn khóa'),
  fee: zMoney.max(SWAP_FEE_MAX).optional().describe('Phí thao tác, chỉ Quản lý chi nhánh được đặt > 0'),
}) }), async (req, res) => {
  res.json(await swapUnit(req.auth!.user, req.valid.params.id, req.valid.body));
});

contractsRouter.post('/:id/move-out', authorize('CUSTOMER', 'STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ date: zDate }) }), async (req, res) => {
  res.json(await requestMoveOut(req.auth!.user, req.valid.params.id, req.valid.body.date));
});
contractsRouter.post('/:id/receive', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams }), async (req, res) => {
  res.json(await receiveUnit(req.auth!.user, req.valid.params.id));
});
contractsRouter.post('/:id/inspection', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({
  checklist: z.array(z.object({ item: z.string().min(1), condition: z.enum(enumValues(ItemCondition) as [string, ...string[]]), note: z.string().optional() })).max(100),
  damages: z.array(z.object({ description: z.string().min(2), severity: z.enum(['MINOR', 'MODERATE', 'SEVERE']), cost: zMoney, photoUrls: z.array(z.string().url()).default([]) })).max(50),
  notes: z.string().max(2000).optional(),
}) }), async (req, res) => {
  res.status(201).json(await submitMoveOutInspection(req.auth!.user, req.valid.params.id, req.valid.body));
});

// ---- inspections history
export const inspectionsRouter = Router();
inspectionsRouter.use(authenticate, authorize('STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER'));
inspectionsRouter.get('/', validate({ query: z.object({ facilityId: zId }) }), scopeQueryFacility, async (req, res) => {
  res.json({ items: await InspectionModel.find({ facilityId: req.valid.query.facilityId }).sort({ performedAt: -1 }).limit(100).populate('unitId', 'unitNumber').populate('inspectorId', 'fullName') });
});
