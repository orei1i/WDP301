/**
 * Kỳ bắt đầu từ `start` đã được khách trả trước qua gia hạn (RENEWAL có paymentId) chưa.
 *
 * Gia hạn thu tiền ngay cho các kỳ sau `previousEndDate` và đẩy `endDate` ra xa; nếu job billing vẫn xuất
 * hoá đơn RENT cho đúng các kỳ đó thì khách bị thu hai lần. Gia hạn tự động (auto-renew) có paymentId = null
 * nên không tính là trả trước — kỳ đó vẫn phải xuất hoá đơn bình thường.
 */
export function coveredByPaidRenewal(
  renewals: readonly { previousEndDate: Date; newEndDate: Date; paymentId?: unknown }[],
  start: Date,
) {
  const t = start.getTime();
  return renewals.some((r) => !!r.paymentId && r.previousEndDate.getTime() <= t && t < r.newEndDate.getTime());
}
