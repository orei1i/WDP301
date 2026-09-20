import type { BusinessPolicy, Facility, PriceQuote, Reservation, StorageUnit, UnitType, User } from '@ssm/shared';
import type { DB } from '@/shared/lib/mock-data';
import { addMonths, daysBetween, monthKey, todayISO } from '@/shared/lib/format';

export class DomainError extends Error {
  constructor(message: string, readonly kind: 'RULE' | 'SCOPE' | 'FORBIDDEN' = 'RULE') { super(message); }
}

export const byId = <T extends { _id: string }>(arr: T[], id: string | null | undefined) => (id ? arr.find((x) => x._id === id) : undefined);

export function mustGet<T extends { _id: string }>(arr: T[], id: string | null | undefined, what: string): T {
  const x = byId(arr, id);
  if (!x) throw new DomainError(`Không tìm thấy ${what}`);
  return x;
}

/** STAFF / FACILITY_MANAGER only see their facilities; other roles see everything. */
export function scopeIds(db: DB, user: User | null | undefined): string[] {
  if (!user) return [];
  if (user.role === 'STAFF' || user.role === 'FACILITY_MANAGER') return user.facilityIds;
  return db.facilities.map((f) => f._id);
}
export const inScope = (db: DB, user: User | null | undefined, facilityId: string) => scopeIds(db, user).includes(facilityId);

export function effectivePolicy(db: DB, facilityId: string): BusinessPolicy {
  const f = byId(db.facilities, facilityId);
  const own = f?.policyId ? db.policies.find((p) => p._id === f.policyId && p.isActive) : undefined;
  return own ?? db.policies.find((p) => p.scope === 'GLOBAL' && p.isActive)!;
}

export function unitRate(ut: UnitType, u?: Pick<StorageUnit, 'priceTier' | 'monthlyRateOverride'>) {
  if (u?.monthlyRateOverride) return u.monthlyRateOverride;
  return Math.round((ut.pricing.baseMonthlyRate * ut.pricing.tierMultipliers[u?.priceTier ?? 'STANDARD']) / 1000) * 1000;
}

export function quote(db: DB, ut: UnitType, months: number): PriceQuote & { discountPct: number; months: number } {
  const policy = effectivePolicy(db, ut.facilityId);
  const monthlyRate = unitRate(ut);
  const surcharge = policy.surcharges
    .filter((s) => s.categories.includes(ut.category) && (s.code !== 'CLIMATE' || ut.features.climateControlled))
    .reduce((sum, s) => sum + (s.kind === 'PERCENT' ? Math.round((monthlyRate * s.value) / 100) : s.value), 0);
  const eligible = policy.discounts.filter((d) => months >= d.minMonths).sort((a, b) => b.minMonths - a.minMonths)[0];
  const gross = monthlyRate + surcharge;
  const discountAmount = eligible ? (eligible.kind === 'PERCENT' ? Math.round((gross * eligible.value) / 100) : eligible.value) : 0;
  const depositAmount = ut.depositOverride ?? (policy.deposit.mode === 'FIXED' ? policy.deposit.value : Math.round(gross * policy.deposit.value));
  return {
    currency: 'VND', priceTier: 'STANDARD', monthlyRate, depositAmount, discountAmount, surchargeAmount: surcharge,
    appliedRuleCodes: [...(surcharge ? ['CLIMATE'] : []), ...(eligible ? [eligible.code] : [])],
    firstPeriodRent: gross - discountAmount, totalDueAtBooking: depositAmount,
    policyId: policy._id, policyVersion: policy.version,
    discountPct: eligible?.kind === 'PERCENT' ? eligible.value : 0, months,
  };
}

const overlaps = (r: Reservation, start: string, end: string) => r.startDate < end && r.endDate > start;

/** Mirrors the server capacity rule: free units minus un-allocated live holds that overlap the requested window. */
export function availability(db: DB, facilityId: string, unitTypeId: string, start = todayISO(), months = 1) {
  const end = addMonths(start, months);
  const typeUnits = db.units.filter((u) => u.facilityId === facilityId && u.unitTypeId === unitTypeId && !u.isDeleted);
  const free = typeUnits.filter((u) => u.status === 'AVAILABLE').length;
  const holds = db.reservations.filter((r) => r.facilityId === facilityId && r.unitTypeId === unitTypeId && (r.status === 'PENDING' || r.status === 'CONFIRMED') && overlaps(r, start, end)).length;
  return { total: typeUnits.length, free, holds, available: Math.max(0, free - holds) };
}

export function cancellationRefund(db: DB, r: Reservation, nowIso = new Date().toISOString()): { pct: number; amount: number } {
  if (r.status === 'PENDING' || !r.depositPaymentId) return { pct: 0, amount: 0 };
  const hours = (new Date(r.startDate).getTime() - new Date(nowIso).getTime()) / 3_600_000;
  const policy = db.policies.find((p) => p._id === r.quote.policyId) ?? effectivePolicy(db, r.facilityId);
  const tier = [...policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart).find((t) => hours >= t.minHoursBeforeStart);
  const pct = tier?.depositRefundPct ?? 0;
  return { pct, amount: Math.round((r.quote.depositAmount * pct) / 100) };
}

export function facilityStats(db: DB, facilityId: string) {
  const units = db.units.filter((u) => u.facilityId === facilityId && !u.isDeleted);
  const count = (s: StorageUnit['status']) => units.filter((u) => u.status === s).length;
  const rentable = units.length - count('MAINTENANCE');
  const occupied = count('OCCUPIED') + count('PENDING_INSPECTION');
  const contracts = db.contracts.filter((c) => c.facilityId === facilityId && c.status !== 'CLOSED');
  const mrr = contracts.reduce((s, c) => s + c.billing.monthlyRate, 0);
  const overdue = contracts.reduce((s, c) => s + c.balance.outstanding, 0);
  const area = units.reduce((s, u) => s + (byId(db.unitTypes, u.unitTypeId)?.areaM2 ?? 0), 0);
  const occArea = units.filter((u) => u.status === 'OCCUPIED' || u.status === 'PENDING_INSPECTION').reduce((s, u) => s + (byId(db.unitTypes, u.unitTypeId)?.areaM2 ?? 0), 0);
  return {
    total: units.length, available: count('AVAILABLE'), reserved: count('RESERVED'), occupied, maintenance: count('MAINTENANCE'),
    pendingInspection: count('PENDING_INSPECTION'),
    occupancy: rentable ? occupied / rentable : 0, areaOccupancy: area ? occArea / area : 0,
    mrr, overdue, delinquentCount: contracts.filter((c) => c.status === 'DELINQUENT' || c.status === 'LOCKED_OUT').length,
    activeContracts: contracts.length,
  };
}

/** Net collected revenue per month (charges - refunds), last `n` months. */
export function revenueByMonth(db: DB, facilityIds: string[], n = 6) {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(monthKey(addMonths(todayISO().slice(0, 8) + '01T00:00:00.000Z', -i)));
  const rows = keys.map((k) => ({ key: k, total: 0, byFacility: {} as Record<string, number> }));
  for (const p of db.payments) {
    if (p.status !== 'SUCCEEDED' && p.status !== 'PARTIALLY_REFUNDED' && p.status !== 'REFUNDED') continue;
    if (!p.paidAt || !facilityIds.includes(p.facilityId) || p.method === 'INTERNAL') continue;
    const row = rows.find((r) => r.key === monthKey(p.paidAt!));
    if (!row) continue;
    const v = p.direction === 'REFUND' ? -p.amount : p.amount;
    row.total += v;
    row.byFacility[p.facilityId] = (row.byFacility[p.facilityId] ?? 0) + v;
  }
  return rows;
}

/**
 * Hạn mức trách nhiệm bồi thường cho một sự vụ. PHẢI khớp CLAIM_LIABILITY_CAP ở BE/src/features/claims/claim-rules.ts —
 * ở đây chỉ để hiển thị và chặn sớm trên form; quyết định cuối cùng vẫn do server.
 */
export const CLAIM_LIABILITY_CAP = 20_000_000;
export const CLAIM_WINDOW_DAYS = 30;
export const claimTotal = (items: { quantity: number; unitValue: number }[]) =>
  items.reduce((sum, it) => sum + it.quantity * it.unitValue, 0);

export const facilityName = (db: DB, id?: string | null) => byId(db.facilities, id)?.name ?? '—';
export const userName = (db: DB, id?: string | null) => byId(db.users, id)?.fullName ?? '—';
export const unitLabel = (db: DB, id?: string | null) => byId(db.units, id)?.unitNumber ?? 'Chưa phân';
export const typeName = (db: DB, id?: string | null) => byId(db.unitTypes, id)?.name ?? '—';
export const isActiveFacility = (f: Facility) => f.status === 'ACTIVE' && !f.isDeleted;
export const daysOverdue = (paidThrough: string) => Math.max(0, daysBetween(paidThrough, todayISO()) - 1);
