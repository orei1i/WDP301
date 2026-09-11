import type { ClientSession, Types } from 'mongoose';
import type { PriceQuote, PriceTier } from '@ssm/shared';
import { FacilityModel, PolicyModel, type PolicyDoc, type UnitTypeDoc, type ReservationDoc } from '../db/models';

/** Facility override if active, otherwise the active GLOBAL policy. */
export async function effectivePolicy(facilityId: Types.ObjectId | string, session?: ClientSession | null) {
  const f = await FacilityModel.findById(facilityId, { policyId: 1 }).session(session ?? null).lean();
  const own = f?.policyId ? await PolicyModel.findOne({ _id: f.policyId, isActive: true }).session(session ?? null) : null;
  const policy = own ?? (await PolicyModel.findOne({ scope: 'GLOBAL', isActive: true }).session(session ?? null));
  if (!policy) throw new Error('No active GLOBAL policy — run the seed script');
  return policy;
}

export function unitRate(ut: Pick<UnitTypeDoc, 'pricing'>, u?: { priceTier: PriceTier; monthlyRateOverride?: number | null }) {
  if (u?.monthlyRateOverride) return u.monthlyRateOverride;
  return Math.round((ut.pricing.baseMonthlyRate * ut.pricing.tierMultipliers[u?.priceTier ?? 'STANDARD']) / 1000) * 1000;
}

/** Same formula as the Webapp mock (lib/domain.ts) so quotes match across clients. */
export function quote(ut: Pick<UnitTypeDoc, 'pricing' | 'category' | 'features' | 'depositOverride'>, policy: PolicyDoc & { _id: Types.ObjectId }, months: number): PriceQuote<Types.ObjectId> {
  const monthlyRate = unitRate(ut);
  const surcharge = policy.surcharges
    .filter((s) => s.categories.includes(ut.category) && (s.code !== 'CLIMATE' || ut.features.climateControlled))
    .reduce((sum, s) => sum + (s.kind === 'PERCENT' ? Math.round((monthlyRate * s.value) / 100) : s.value), 0);
  const now = new Date();
  const eligible = policy.discounts
    .filter((d) => months >= d.minMonths && !d.requiresApprovalRole && (!d.validFrom || d.validFrom <= now) && (!d.validTo || d.validTo >= now))
    .sort((a, b) => b.minMonths - a.minMonths)[0];
  const gross = monthlyRate + surcharge;
  const discountAmount = eligible ? (eligible.kind === 'PERCENT' ? Math.round((gross * eligible.value) / 100) : eligible.value) : 0;
  const depositAmount = ut.depositOverride ?? (policy.deposit.mode === 'FIXED' ? policy.deposit.value : Math.round(gross * policy.deposit.value));
  return {
    currency: 'VND', priceTier: 'STANDARD', monthlyRate, depositAmount, discountAmount, surchargeAmount: surcharge,
    appliedRuleCodes: [...(surcharge ? ['CLIMATE'] : []), ...(eligible ? [eligible.code] : [])],
    firstPeriodRent: gross - discountAmount, totalDueAtBooking: depositAmount,
    policyId: policy._id, policyVersion: policy.version,
  };
}

export async function cancellationRefund(r: Pick<ReservationDoc, 'status' | 'depositPaymentId' | 'startDate' | 'quote' | 'facilityId'>, session?: ClientSession) {
  if (r.status === 'PENDING' || !r.depositPaymentId) return { pct: 0, amount: 0 };
  const policy = (await PolicyModel.findById(r.quote.policyId).session(session ?? null)) ?? (await effectivePolicy(r.facilityId, session));
  const hours = (r.startDate.getTime() - Date.now()) / 3_600_000;
  const tier = [...policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart).find((t) => hours >= t.minHoursBeforeStart);
  const pct = tier?.depositRefundPct ?? 0;
  return { pct, amount: Math.round((r.quote.depositAmount * pct) / 100) };
}
