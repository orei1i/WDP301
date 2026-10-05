import type { ClientSession, Types } from 'mongoose';
import { earlyTerminationOf, type PriceQuote, type RentalPeriod, type UnitCategory } from '@ssm/shared';
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

/** Loại kho này có tuỳ chọn điều hòa (add-on) hay không — theo đúng danh mục cỡ kho khai báo ở
 * policy.surcharges[CLIMATE].categories (VD SMALL/MEDIUM/LARGE/XL, không có LOCKER). */
export function climateEligible(policy: Pick<PolicyDoc, 'surcharges'>, category: UnitCategory) {
  return policy.surcharges.some((s) => s.code === 'CLIMATE' && s.categories.includes(category));
}

/**
 * Same formula as the Webapp mock (lib/domain.ts) so quotes match across clients. `periods` = số chu kỳ thuê.
 * `useAirConditioning` là add-on KHÁCH TỰ CHỌN lúc đặt (không phải thuộc tính của ô) — mọi ô của loại
 * kho hợp lệ đều sẵn có máy lạnh, chỉ tính phụ phí CLIMATE khi khách chọn dùng.
 */
export function quote(
  ut: Pick<UnitTypeDoc, 'rates' | 'category' | 'depositOverride'>,
  policy: PolicyDoc & { _id: Types.ObjectId },
  period: RentalPeriod,
  periods: number,
  useAirConditioning: boolean,
): PriceQuote<Types.ObjectId> {
  const rate = unitRate(ut, period);
  const surcharge = policy.surcharges
    .filter((s) => s.categories.includes(ut.category) && (s.code !== 'CLIMATE' || useAirConditioning))
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

/** % thời gian kỳ hạn hiện tại đã dùng tại ngày trả kho dự kiến, kẹp về [0, 100]. */
export function elapsedTermPct(startDate: Date, endDate: Date, scheduledFor: Date) {
  const span = endDate.getTime() - startDate.getTime();
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, ((scheduledFor.getTime() - startDate.getTime()) / span) * 100));
}

/**
 * TRẦN % hoàn cọc khi trả kho SỚM (trước `endDate` của kỳ hạn hiện tại), theo % thời gian kỳ hạn đã
 * dùng (`elapsedTermPct`). Dùng min() với phần hoàn còn lại sau khi trừ hư hỏng/công nợ ở
 * contract.service — không cộng dồn phạt. CHỈ áp dụng khi trả kho trước `endDate`; trả đúng/quá hạn
 * là move-out bình thường, không bị phạt.
 */
export function earlyTerminationRefundPct(policy: Pick<PolicyDoc, 'earlyTermination'>, elapsedPct: number) {
  const tier = [...earlyTerminationOf(policy)].sort((a, b) => a.maxElapsedPct - b.maxElapsedPct).find((t) => elapsedPct <= t.maxElapsedPct);
  return tier?.depositRefundPct ?? 0;
}
