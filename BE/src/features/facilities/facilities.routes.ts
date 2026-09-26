import { Router } from 'express';
import { z } from 'zod';
import { enumValues, FacilityStatus, RentalPeriod, UnitStatus } from '@ssm/shared';
import { FacilityModel, StorageUnitModel, UnitTypeModel } from '../../shared/db/models';
import { authenticate } from '../../shared/http/authenticate';
import { authorize } from '../../shared/http/authorize';
import { scopeFilter, scopeQueryFacility, assertFacility } from '../../shared/http/scope';
import { idParams, validate, zId } from '../../shared/http/validate';
import { addUnit, facilityDetailPublic, floorPlan, listFacilitiesPublic, saveFacility, setUnitTypeRates, setUnitStatus } from './inventory.service';

const e = <T extends string>(o: Record<string, T>) => z.enum(enumValues(o) as [T, ...T[]]);

export const facilitiesRouter = Router();

// ---- public catalogue (no auth) — khách chọn CHU KỲ (ngày/tuần/tháng) lúc xem giá, không cố định theo loại kho.
facilitiesRouter.get('/public', async (_req, res) => {
  res.json(await listFacilitiesPublic());
});
facilitiesRouter.get('/public/:id', validate({ params: idParams, query: z.object({ period: e(RentalPeriod).default('MONTH'), periods: z.coerce.number().int().min(1).max(365).default(1) }) }), async (req, res) => {
  res.json(await facilityDetailPublic(req.valid.params.id, req.valid.query.period, req.valid.query.periods));
});
/** Sơ đồ 2D cơ bản để khách bấm chọn ô còn trống — công khai, không cần đăng nhập. */
facilitiesRouter.get('/public/:id/unit-types/:typeId/floor-plan', validate({ params: idParams.extend({ typeId: zId }) }), async (req, res) => {
  res.json(await floorPlan(req.valid.params.id, req.valid.params.typeId));
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
  res.json({ items: await UnitTypeModel.find({ facilityId: req.valid.params.id }).sort({ 'rates.MONTH': 1 }) });
});
facilitiesRouter.patch('/unit-types/:id/price', authorize('OPS_MANAGER'), validate({ params: idParams, body: z.object({
  rates: z.object({ DAY: z.number().int().min(1_000).optional(), WEEK: z.number().int().min(1_000).optional(), MONTH: z.number().int().min(1_000).optional() }),
}) }), async (req, res) => {
  res.json(await setUnitTypeRates(req.valid.params.id, req.valid.body.rates));
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
  unitTypeId: zId, unitNumber: z.string().min(1).max(20), floor: z.number().int().min(-5).max(100), zone: z.string().optional(),
}) }), async (req, res) => {
  res.status(201).json(await addUnit(req.auth!.user, req.valid.body));
});

unitsRouter.patch('/:id/status', authorize('STAFF', 'FACILITY_MANAGER'), validate({ params: idParams, body: z.object({ to: z.enum(['AVAILABLE', 'MAINTENANCE']), reason: z.string().max(500).optional() }) }), async (req, res) => {
  res.json(await setUnitStatus(req.auth!.user, req.valid.params.id, req.valid.body.to, req.valid.body.reason));
});
