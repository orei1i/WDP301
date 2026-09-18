import { Router } from 'express';
import { z } from 'zod';
import { PaymentModel } from '../../shared/db/models';
import { authenticate } from '../../shared/http/authenticate';
import { scopeFilter, scopeQueryFacility } from '../../shared/http/scope';
import { paging, validate, zId } from '../../shared/http/validate';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

paymentsRouter.get('/', validate({ query: paging.extend({ facilityId: zId.optional(), contractId: zId.optional(), status: z.string().optional() }) }), scopeQueryFacility, async (req, res) => {
  const { page, limit, facilityId, contractId, status } = req.valid.query;
  const filter: Record<string, unknown> = { ...scopeFilter(req.auth!.user, { customerField: 'customerId' }) };
  if (facilityId) filter.facilityId = facilityId;
  if (contractId) filter.contractId = contractId;
  if (status) filter.status = { $in: status.split(',') };
  const [items, total] = await Promise.all([
    PaymentModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PaymentModel.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});
