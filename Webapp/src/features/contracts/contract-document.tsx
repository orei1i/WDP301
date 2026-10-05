'use client';

import Link from 'next/link';
import type { BusinessPolicy, ContractSignature, Reservation } from '@ssm/shared';
import { periodLabel, PERIOD_UNIT, TERMS_VERSION } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { ACCESS_METHOD } from '@/shared/lib/labels';
import { byId, effectivePolicy, facilityName, typeName, userName } from '@/shared/lib/domain';
import { fmtDate, fmtDateTime, vnd } from '@/shared/lib/format';

/** Khoảng % kỳ hạn đã dùng của từng bậc phạt trả kho sớm, đọc theo thứ tự tăng dần. */
function earlyTerminationLines(policy: BusinessPolicy) {
  const tiers = [...policy.earlyTermination].sort((a, b) => a.maxElapsedPct - b.maxElapsedPct);
  return tiers.map((t, i) => {
    const prev = tiers[i - 1]?.maxElapsedPct;
    const range = prev === undefined ? `đã dùng đến ${t.maxElapsedPct}% kỳ hạn` : i === tiers.length - 1 ? `đã dùng trên ${prev}% kỳ hạn` : `đã dùng trên ${prev}% đến ${t.maxElapsedPct}% kỳ hạn`;
    return `Trả kho sớm khi ${range}: hoàn ${t.depositRefundPct}% tiền cọc`;
  });
}

/**
 * Bản hợp đồng thuê kho dựng từ đặt chỗ + chính sách đã chốt lúc đặt. Hợp đồng chính thức (có số)
 * chỉ phát sinh khi nhận kho, nhưng nội dung ràng buộc là đúng bản này — khách ký xác nhận ở đây.
 */
export function ContractDocument({ reservation: r }: { reservation: Reservation }) {
  const { db } = useStore();
  const policy = db.policies.find((p) => p._id === r.quote.policyId) ?? effectivePolicy(db, r.facilityId);
  const facility = byId(db.facilities, r.facilityId);
  const unit = byId(db.units, r.unitId);
  const type = byId(db.unitTypes, r.unitTypeId);
  const cancelTiers = [...policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);

  return (
    <article className="max-h-96 space-y-4 overflow-y-auto rounded-lg bg-stone-50 p-5 text-sm leading-relaxed text-stone-700 ring-1 ring-inset ring-stone-200">
      <header className="text-center">
        <h3 className="text-base font-bold uppercase tracking-wide text-ink">Hợp đồng thuê kho</h3>
        <p className="text-xs text-stone-500">Mã đặt chỗ {r.code} · số hợp đồng được cấp khi nhận kho</p>
      </header>

      <section>
        <h4 className="font-semibold text-ink">1. Các bên</h4>
        <p><b>Bên cho thuê:</b> KhoAn — {facilityName(db, r.facilityId)}{facility ? `, ${facility.address.line1}, ${facility.address.district}` : ''}.</p>
        <p><b>Bên thuê:</b> {userName(db, r.customerId)}.</p>
      </section>

      <section>
        <h4 className="font-semibold text-ink">2. Đối tượng thuê</h4>
        <p>
          {type?.name ?? typeName(db, r.unitTypeId)}{unit ? `, ô ${unit.unitNumber} (tầng ${unit.location.floor}${unit.location.zone ? `, ${unit.location.zone}` : ''})` : ''}
          {type ? `, diện tích ${type.areaM2} m²` : ''}{unit ? `, hình thức khoá: ${ACCESS_METHOD[unit.accessMethod]}` : ''}.
          {' '}Điều hòa: {r.useAirConditioning ? 'có sử dụng (tính phụ phí)' : 'không sử dụng'}.
        </p>
      </section>

      <section>
        <h4 className="font-semibold text-ink">3. Thời hạn</h4>
        <p>Từ ngày {fmtDate(r.startDate)}, thời hạn {periodLabel(r.quote.rentalPeriod, r.periods)} (dự kiến đến {fmtDate(r.endDate)}). Hết hạn mà chưa gia hạn hay trả kho, tiền thuê tiếp tục được tính theo giá cũ cho đến khi bên thuê trả kho.</p>
      </section>

      <section>
        <h4 className="font-semibold text-ink">4. Giá và thanh toán</h4>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>Giá thuê mỗi {PERIOD_UNIT[r.quote.rentalPeriod]}: {vnd(r.quote.rate)}{r.quote.surchargeAmount > 0 ? `, phụ phí điều hòa ${vnd(r.quote.surchargeAmount)}` : ''}{r.quote.discountAmount > 0 ? `, ưu đãi −${vnd(r.quote.discountAmount)}` : ''}.</li>
          <li>Tiền thuê kỳ đầu: {vnd(r.quote.firstPeriodRent)} (thanh toán khi nhận kho).</li>
          <li>Tiền cọc: {vnd(r.quote.depositAmount)}{r.depositPaymentId ? ' — đã thanh toán' : ''}.</li>
          <li>Quá hạn quá {policy.gracePeriodDays} ngày bị tính phí trễ; quá {policy.lockoutAfterDays} ngày bị khoá truy cập.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-semibold text-ink">5. Hủy, trả kho sớm và hàng bỏ lại</h4>
        <ul className="list-disc space-y-0.5 pl-5">
          {cancelTiers.map((t) => <li key={t.minHoursBeforeStart}>{t.minHoursBeforeStart > 0 ? `Hủy trước ngày nhận ≥ ${t.minHoursBeforeStart} giờ` : 'Hủy sát ngày nhận'}: hoàn {t.depositRefundPct}% tiền cọc.</li>)}
          {earlyTerminationLines(policy).map((l) => <li key={l}>{l}.</li>)}
          <li>Bị khoá truy cập quá {policy.abandonAfterLockedOutDays} ngày mà không đóng tiền hay liên hệ: chi nhánh được kiểm kê, thanh lý đồ trong kho và giữ toàn bộ tiền cọc.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-semibold text-ink">6. Điều khoản chung</h4>
        <p>Hai bên thực hiện theo <Link href="/dieu-khoan" target="_blank" className="font-medium text-brand-700 hover:underline">Điều khoản thuê kho (v{TERMS_VERSION})</Link> và chính sách phiên bản v{r.quote.policyVersion} áp dụng tại thời điểm đặt chỗ.</p>
      </section>
    </article>
  );
}

/** Dòng tóm tắt người ký / thời điểm ký, kèm ảnh chữ ký vẽ tay nếu có. */
export function SignatureInfo({ signature: s }: { signature: ContractSignature }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
      {s.image && <img src={s.image} alt="Chữ ký" className="h-14 rounded bg-white px-2 ring-1 ring-emerald-200" />}
      <div>
        <p className="font-semibold">Đã ký hợp đồng — {s.signerName}</p>
        <p className="text-xs">{fmtDateTime(s.signedAt)} · {s.method === 'DRAWN' ? 'ký tay' : 'ký bằng họ tên'}{s.onBehalf ? ' · nhân viên thao tác tại quầy' : ''}</p>
      </div>
    </div>
  );
}
