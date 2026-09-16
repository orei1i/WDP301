import type { FacilityStatus, PriceTier, UnitStatus } from '@ssm/shared';
import { FacilityModel, StorageUnitModel, UnitTypeModel, type UserHydrated } from '../db/models';
import { Conflict, NotFound, Unprocessable } from '../core/errors';
import { assertFacility } from '../middlewares/scope';
import { availability } from '../domain/availability';
import { effectivePolicy, quote, unitRate } from '../domain/pricing';
import { todayUTC, toDateOnly } from '../domain/dates';
import { audit } from './audit.service';

// ---------------------------------------------------------------- public catalogue
export async function listFacilitiesPublic() {
  const facilities = await FacilityModel.find({ status: { $in: ['ACTIVE', 'UNDER_CONSTRUCTION'] } }).sort({ name: 1 }).lean();
  const types = await UnitTypeModel.find({ isActive: true }).lean();
  const items = await Promise.all(facilities.map(async (f) => {
    const ft = types.filter((t) => String(t.facilityId) === String(f._id));
    const avail = f.status === 'ACTIVE'
      ? await Promise.all(ft.map(async (t) => ({ unitTypeId: t._id, name: t.name, category: t.category, ...(await availability(f._id, t._id, todayUTC(), 1)) })))
      : [];
    return { ...f, fromPrice: ft.length ? Math.min(...ft.map((t) => unitRate(t))) : null, availability: avail };
  }));
  return { items, unitTypes: types };
}

export async function facilityDetailPublic(id: string, start?: string, months = 1) {
  const f = await FacilityModel.findById(id).lean();
  if (!f) throw NotFound('chi nhánh');
  const policy = await effectivePolicy(f._id);
  const startDate = start ? toDateOnly(start) : todayUTC();
  const types = await UnitTypeModel.find({ facilityId: f._id, isActive: true }).sort({ 'pricing.baseMonthlyRate': 1 }).lean();
  const unitTypes = await Promise.all(types.map(async (t) => ({
    ...t, quote: quote(t, policy, months), availability: await availability(f._id, t._id, startDate, months),
  })));
  return {
    facility: f, unitTypes,
    policy: { version: policy.version, scope: policy.scope, reservationHoldMinutes: policy.reservationHoldMinutes, cancellation: policy.cancellation, minRentalMonths: policy.minRentalMonths, maxRentalMonths: policy.maxRentalMonths },
  };
}

// ---------------------------------------------------------------- facilities CRUD (OPS, ADMIN)
export async function saveFacility(id: string | null, input: { code?: string; name: string; status: FacilityStatus; line1: string; district: string; city?: string; phone: string; lng?: number; lat?: number }) {
  if (id) {
    const f = await FacilityModel.findById(id);
    if (!f) throw NotFound('chi nhánh');
    f.set({ name: input.name, status: input.status, 'address.line1': input.line1, 'address.district': input.district, 'contact.phone': input.phone });
    if (input.lng !== undefined && input.lat !== undefined) f.set('location.coordinates', [input.lng, input.lat]);
    await f.save();
    await audit({ action: 'facility.update', entityType: 'Facility', entityId: f._id, facilityId: f._id, changes: { after: input } });
    return f;
  }
  if (!input.code) throw Unprocessable('Thiếu mã chi nhánh');
  const f = await FacilityModel.create({
    code: input.code, name: input.name, status: input.status,
    address: { line1: input.line1, district: input.district, city: input.city ?? 'TP. Hồ Chí Minh', country: 'VN' },
    location: { type: 'Point', coordinates: [input.lng ?? 106.7, input.lat ?? 10.78] }, contact: { phone: input.phone },
  });
  await audit({ action: 'facility.create', entityType: 'Facility', entityId: f._id, facilityId: f._id });
  return f;
}

// ---------------------------------------------------------------- pricing (OPS)
export async function setBasePrice(unitTypeId: string, rate: number) {
  const ut = await UnitTypeModel.findById(unitTypeId);
  if (!ut) throw NotFound('loại kho');
  const before = ut.pricing.baseMonthlyRate;
  ut.set('pricing.baseMonthlyRate', rate);
  await ut.save();
  await audit({ action: 'pricing.update', entityType: 'UnitType', entityId: ut._id, facilityId: ut.facilityId, changes: { before: { rate: before }, after: { rate } } });
  return ut;
}

// ---------------------------------------------------------------- units (STAFF, FM)
export async function addUnit(user: UserHydrated, input: { unitTypeId: string; unitNumber: string; floor: number; priceTier: PriceTier; zone?: string }) {
  const ut = await UnitTypeModel.findById(input.unitTypeId);
  if (!ut) throw NotFound('loại kho');
  await assertFacility(user, ut.facilityId, 'unit.create');
  const u = await StorageUnitModel.create({
    facilityId: ut.facilityId, unitTypeId: ut._id, unitNumber: input.unitNumber, location: { building: 'A', floor: input.floor, zone: input.zone }, priceTier: input.priceTier,
  });
  await audit({ action: 'unit.create', entityType: 'StorageUnit', entityId: u._id, facilityId: ut.facilityId });
  return u;
}

/**
 * Đổi trạng thái thủ công. Đích luôn là AVAILABLE hoặc MAINTENANCE; mọi thứ còn lại đi qua quy trình
 * đặt chỗ / nhận kho / trả kho.
 *
 * Nguồn được phép có thêm PENDING_INSPECTION khi ô KHÔNG còn gắn hợp đồng — đó chính là ô vừa nhả ra
 * do đổi ô kho (contract.service → swapUnit). Ô đang chờ tất toán trả kho vẫn còn currentContractId
 * nên vẫn buộc phải đi qua biên bản kiểm tra, không lách được đường này.
 */
export async function setUnitStatus(user: UserHydrated, id: string, to: UnitStatus, reason?: string) {
  const u = await StorageUnitModel.findById(id);
  if (!u) throw NotFound('kho');
  await assertFacility(user, u.facilityId, 'unit.status');
  const canLeave = ['AVAILABLE', 'MAINTENANCE'].includes(u.status)
    || (u.status === 'PENDING_INSPECTION' && !u.currentContractId);
  if (!canLeave || !['AVAILABLE', 'MAINTENANCE'].includes(to))
    throw Conflict('Trạng thái này chỉ đổi qua quy trình phân kho / nhận kho / trả kho', 'FLOW_ONLY');
  const from = u.status;
  u.transitionTo(to, { actor: user.role, by: user._id, reason });
  await u.save();
  await audit({ action: 'unit.status', entityType: 'StorageUnit', entityId: u._id, facilityId: u.facilityId, reason, changes: { before: { status: from }, after: { status: to } } });
  return u;
}
