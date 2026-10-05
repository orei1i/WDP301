'use client';

import Link from 'next/link';
import type { ContractSignature, Reservation } from '@ssm/shared';
import { buildContractClauses } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { byId, effectivePolicy, facilityName, typeName, userName } from '@/shared/lib/domain';
import { fmtDateTime } from '@/shared/lib/format';

/**
 * Bản hợp đồng thuê kho dựng từ đặt chỗ + chính sách đã chốt lúc đặt. Hợp đồng chính thức (có số)
 * chỉ phát sinh khi nhận kho, nhưng nội dung ràng buộc là đúng bản này — khách ký xác nhận ở đây.
 * Nội dung điều khoản lấy từ `buildContractClauses` (shared) — cùng nguồn với mobile và file PDF gửi email.
 */
export function ContractDocument({ reservation: r }: { reservation: Reservation }) {
  const { db } = useStore();
  const policy = db.policies.find((p) => p._id === r.quote.policyId) ?? effectivePolicy(db, r.facilityId);
  const facility = byId(db.facilities, r.facilityId);
  const unit = byId(db.units, r.unitId);
  const type = byId(db.unitTypes, r.unitTypeId);
  const contract = byId(db.contracts, r.contractId);

  const clauses = buildContractClauses({
    code: r.code, contractNumber: contract?.contractNumber, facilityName: facilityName(db, r.facilityId),
    facilityAddress: facility ? `${facility.address.line1}, ${facility.address.district}` : null, customerName: userName(db, r.customerId),
    unitTypeName: type?.name ?? typeName(db, r.unitTypeId), unitNumber: unit?.unitNumber, floor: unit?.location.floor, zone: unit?.location.zone,
    areaM2: type?.areaM2, accessMethod: unit?.accessMethod, useAirConditioning: r.useAirConditioning, rentalPeriod: r.quote.rentalPeriod,
    periods: r.periods, startDate: r.startDate, endDate: r.endDate, quote: r.quote, depositPaid: !!r.depositPaymentId, termsVersion: r.signature?.termsVersion, policy,
  });

  return (
    <article className="max-h-96 space-y-4 overflow-y-auto rounded-lg bg-stone-50 p-5 text-sm leading-relaxed text-stone-700 ring-1 ring-inset ring-stone-200">
      <header className="text-center">
        <h3 className="text-base font-bold uppercase tracking-wide text-ink">Hợp đồng thuê kho</h3>
        <p className="text-xs text-stone-500">Mã đặt chỗ {r.code} · {contract ? `số hợp đồng ${contract.contractNumber}` : 'số hợp đồng được cấp khi nhận kho'}</p>
      </header>
      {clauses.map((c) => (
        <section key={c.title}>
          <h4 className="font-semibold text-ink">{c.title}</h4>
          {c.paragraphs.map((p) => <p key={p}>{p}</p>)}
          {c.bullets.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{c.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        </section>
      ))}
      <p><Link href="/dieu-khoan" target="_blank" className="font-medium text-brand-700 hover:underline">Xem Điều khoản thuê kho đầy đủ</Link></p>
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
