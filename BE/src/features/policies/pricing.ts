import type { ClientSession, Types } from 'mongoose';
import type { PriceQuote, RentalPeriod } from '@ssm/shared';
import { FacilityModel, PolicyModel, type PolicyDoc, type UnitTypeDoc, type ReservationDoc } from '../../shared/db/models';

/** Facility override if active, otherwise the active GLOBAL policy. */
export async function effectivePolicy(facilityId: Types.ObjectId | string, session?: ClientSession | null) {
  const f = await FacilityModel.findById(facilityId, { policyId: 1 }).session(session ?? null).lean();
  const own = f?.policyId ? await PolicyModel.findOne({ _id: f.policyId, isActive: true }).session(session ?? null) : null;
  const policy = own ?? (await PolicyModel.findOne({ scope: 'GLOBAL', isActive: true }).session(session ?? null));
  if (!policy) throw new Error('No active GLOBAL policy — run the seed script');
  return policy;
}

/** Giá một chu kỳ của loại kho, theo chu kỳ KHÁCH CHỌN (không cố định theo loại kho). */
export function unitRate(ut: Pick<UnitTypeDoc, 'rates'>, period: RentalPeriod) {
  return ut.rates[period];
}

/** Same formula as the Webapp mock (lib/domain.ts) so quotes match across clients. `periods` = số chu kỳ thuê. */
export function quote(
  ut: Pick<UnitTypeDoc, 'rates' | 'category' | 'features' | 'depositOverride'>,
  policy: PolicyDoc & { _id: Types.ObjectId },
  period: RentalPeriod,
  periods: number,
): PriceQuote<Types.ObjectId> {
  const rate = unitRate(ut, period);
  const surcharge = policy.surcharges
    .filter((s) => s.categories.includes(ut.category) && (s.code !== 'CLIMATE' || ut.features.climateControlled))
    .reduce((sum, s) => sum + (s.kind === 'PERCENT' ? Math.round((rate * s.value) / 100) : s.value), 0);
  const now = new Date();
  const eligible = policy.discounts
    .filter((d) => periods >= d.minPeriods && !d.requiresApprovalRole && (!d.validFrom || d.validFrom <= now) && (!d.validTo || d.validTo >= now))
    .sort((a, b) => b.minPeriods - a.minPeriods)[0];
  const gross = rate + surcharge;
  const discountAmount = eligible ? (eligible.kind === 'PERCENT' ? Math.round((gross * eligible.value) / 100) : eligible.value) : 0;
  // Cọc = value chu kỳ tiền thuê (mặc định 1 chu kỳ) hoặc số tiền cố định, hoặc override theo loại kho.
  const depositAmount = ut.depositOverride ?? (policy.deposit.mode === 'FIXED' ? policy.deposit.value : Math.round(gross * policy.deposit.value));
  return {
    currency: 'VND', rentalPeriod: period, rate, depositAmount, discountAmount, surchargeAmount: surcharge,
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
