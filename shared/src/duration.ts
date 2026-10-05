import type { RentalPeriod } from './enums';

/**
 * Ưu đãi thuê dài hạn tính theo SỐ THÁNG (`minPeriods` = số tháng tối thiểu). Chỉ chu kỳ THÁNG mới được hưởng —
 * thuê theo ngày/tuần không có ưu đãi. Một nguồn duy nhất cho BE (báo giá), web, app và dữ liệu mẫu.
 */
export interface DiscountTier {
  code: string;
  kind: 'FIXED' | 'PERCENT';
  value: number;
  minPeriods: number;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  requiresApprovalRole?: string | null;
}

/** Bậc cho mức giảm NHIỀU NHẤT trong các bậc khách đủ điều kiện (bậc cao hơn đặt 0% cũng không làm mất ưu đãi bậc thấp). */
export function pickDiscount<T extends DiscountTier>(
  discounts: readonly T[], period: RentalPeriod, periods: number, gross: number, now = new Date(),
): { tier: T; amount: number } | null {
  if (period !== 'MONTH') return null;
  let best: { tier: T; amount: number } | null = null;
  for (const d of discounts) {
    if (periods < d.minPeriods || d.requiresApprovalRole) continue;
    if (d.validFrom && new Date(d.validFrom) > now) continue;
    if (d.validTo && new Date(d.validTo) < now) continue;
    const amount = Math.min(gross, d.kind === 'PERCENT' ? Math.round((gross * d.value) / 100) : d.value);
    if (amount > 0 && (!best || amount > best.amount)) best = { tier: d, amount };
  }
  return best;
}

/** % giảm cao nhất khách được hưởng khi thuê `months` tháng (chỉ tính bậc theo %) — dùng cho nhãn "Tiết kiệm x%". */
export const discountPctFor = (discounts: readonly DiscountTier[], months: number, now = new Date()) =>
  pickDiscount(discounts.filter((d) => d.kind === 'PERCENT'), 'MONTH', months, 100, now)?.amount ?? 0;

// ---------- Bộ chọn "Bạn sẽ gửi trong bao lâu?" (web + app dùng chung) ----------
export type DurationKey = 'SHORT' | 'M1' | 'M2' | 'M3' | 'M6' | 'Y1';
export const DURATION_CHOICES: readonly { key: DurationKey; label: string; months: number | null }[] = [
  { key: 'SHORT', label: 'Dưới 1 tháng', months: null },
  { key: 'M1', label: '1 tháng', months: 1 },
  { key: 'M2', label: '2 tháng', months: 2 },
  { key: 'M3', label: '3 tháng', months: 3 },
  { key: 'M6', label: '6 tháng', months: 6 },
  { key: 'Y1', label: '1+ năm', months: 12 },
];

/** Nút nào đang được chọn theo (chu kỳ, số chu kỳ); null = số tháng tuỳ ý (4, 5, 7–11 tháng) không trùng nút nào. */
export function durationKeyOf(period: RentalPeriod, periods: number): DurationKey | null {
  if (period !== 'MONTH') return 'SHORT';
  if (periods >= 12) return 'Y1';
  return DURATION_CHOICES.find((c) => c.months === periods)?.key ?? null;
}

/** Bấm một nút thì đặt chu kỳ/số chu kỳ nào. "Dưới 1 tháng" mặc định 2 tuần (giữ nguyên nếu đang ở ngày/tuần). */
export function applyDurationChoice(key: DurationKey, current: { period: RentalPeriod; periods: number }): { period: RentalPeriod; periods: number } {
  const c = DURATION_CHOICES.find((x) => x.key === key)!;
  if (c.months === null) return current.period === 'MONTH' ? { period: 'WEEK', periods: 2 } : current;
  return { period: 'MONTH', periods: key === 'Y1' && current.period === 'MONTH' && current.periods >= 12 ? current.periods : c.months };
}
