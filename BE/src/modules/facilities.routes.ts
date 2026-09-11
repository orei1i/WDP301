import { Router } from 'express';
import { z } from 'zod';
import { enumValues, FacilityStatus, PriceTier, UnitStatus } from '@ssm/shared';
import { FacilityModel, StorageUnitModel, UnitTypeModel } from '../db/models';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { scopeFilter, scopeQueryFacility, assertFacility } from '../middlewares/scope';
import { idParams, validate, zDate, zId } from '../middlewares/validate';
import { addUnit, facilityDetailPublic, listFacilitiesPublic, saveFacility, setBasePrice, setUnitStatus } from '../services/inventory.service';

export const facilitiesRouter = Router();

// ---- public catalogue (no auth)
facilitiesRouter.get('/public', async (_req, res) => {
  res.json(await listFacilitiesPublic());
});
facilitiesRouter.get('/public/:id', validate({ params: idParams, query: z.object({ start: zDate.optional(), months: z.coerce.number().int().min(1).max(60).default(1) }) }), async (req, res) => {
  res.json(await facilityDetailPublic(req.valid.params.id, req.valid.query.start, req.valid.query.months));
});

// ---- back office
facilitiesRouter.use(authenticate);

facilitiesRouter.get('/', authorize('STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER', 'ADMIN'), async (req, res) => {
  const u = req.auth!.user;
  const filter = u.role === 'STAFF' || u.role === 'FACILITY_MANAGER' ? { _id: { $in: u.facilityIds } } : {};
  res.json({ items: await FacilityModel.find(filter).sort({ name: 1 }) });
});

const facilityBody = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{3,20}$/).optional(), name: z.string().min(3).max(150), status: z.enum(enumValues(FacilityStatus) as [FacilityStatus, ...FacilityStatus[]]),
  line1: z.string().min(3), district: z.string().min(2), city: z.string().optional(), phone: z.string().min(6), lng: z.number().optional(), lat: z.number().optional(),
});
facilitiesRouter.post('/', authorize('OPS_MANAGER', 'ADMIN'), validate({ body: facilityBody.required({ code: true }) }), async (req, res) => {
  res.status(201).json(await saveFacility(null, req.valid.body));
});
facilitiesRouter.patch('/:id', authorize('OPS_MANAGER', 'ADMIN'), validate({ params: idParams, body: facilityBody.omit({ code: true }) }), async (req, res) => {
  res.json(await saveFacility(req.valid.params.id, req.valid.body));
});

// ---- unit types & pricing
facilitiesRouter.get('/:id/unit-types', validate({ params: idParams }), async (req, res) => {
  await assertFacility(req.auth!.user, req.valid.params.id);
  res.json({ items: await UnitTypeModel.find({ facilityId: req.valid.params.id }).sort({ 'pricing.baseMonthlyRate': 1 }) });
});
facilitiesRouter.patch('/unit-types/:id/price', authorize('OPS_MANAGER'), validate({ params: idParams, body: z.object({ rate: z.number().int().min(50_000) }) }), async (req, res) => {
  res.json(await setBasePrice(req.valid.params.id, req.valid.body.rate));
});

// ---- physical units
export const unitsRouter = Router();
unitsRouter.use(authenticate, authorize('STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER'));

unitsRouter.get('/', validate({ query: z.object({ facilityId: zId, status: z.enum(enumValues(UnitStatus) as [UnitStatus, ...UnitStatus[]]).optional(), unitTypeId: zId.optional() }) }), scopeQueryFacility, async (req, res) => {
  const { facilityId, status, unitTypeId } = req.valid.query;
  const items = await StorageUnitModel.find({ ...scopeFilter(req.auth!.user), facilityId, ...(status && { status }), ...(unitTypeId && { unitTypeId }) })
    .sort({ 'location.floor': 1, unitNumber: 1 });
  res.json({ items });
});

unitsRouter.post('/', authorize('FACILITY_MANAGER'), validate({ body: z.object({
  unitTypeId: zId, unitNumber: z.string().min(1).max(20), floor: z.number().int().min(-5).max(100), priceTier: z.enum(enumValues(PriceTier) as [PriceTier, ...PriceTier[]]).default('STANDARD'), zone: z.string().optional(),
}) }), async (req, res) => {
  res.status(201).json(await addUnit(req.auth!.user, req.valid.body));
});

unitsRouter.patch('/:id/status', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ to: z.enum(['AVAILABLE', 'MAINTENANCE']), reason: z.string().max(500).optional() }) }), async (req, res) => {
  res.json(await setUnitStatus(req.auth!.user, req.valid.params.id, req.valid.body.to, req.valid.body.reason));
});
