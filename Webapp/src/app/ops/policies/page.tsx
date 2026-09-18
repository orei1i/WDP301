'use client';

import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import type { BusinessPolicy } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { effectivePolicy, facilityName, userName } from '@/shared/lib/domain';
import { fmtDate, vnd } from '@/shared/lib/format';
import { Badge, Button, Card, CardHeader, Field, PageHeader, Table, cx, inputCls } from '@/shared/ui';

export default function Policies() {
  const { db, run } = useStore();
  const [target, setTarget] = useState<string>('GLOBAL');
  const facilityId = target === 'GLOBAL' ? null : target;
  const current: BusinessPolicy = facilityId ? effectivePolicy(db, facilityId) : db.policies.find((p) => p.scope === 'GLOBAL' && p.isActive)!;
  const inherits = !!facilityId && current.scope === 'GLOBAL';

  const [draft, setDraft] = useState(() => toDraft(current));
  const [draftFor, setDraftFor] = useState(current._id);
  if (draftFor !== current._id) { setDraftFor(current._id); setDraft(toDraft(current)); }

  const history = useMemo(() => db.policies.filter((p) => (facilityId ? p.facilityId === facilityId : p.scope === 'GLOBAL')).sort((a, b) => b.version - a.version), [db.policies, facilityId]);

  const publish = () => run('publishPolicy', {
    facilityId,
    patch: {
      gracePeriodDays: draft.grace, lockoutAfterDays: draft.lockout, reservationHoldMinutes: draft.hold,
      deposit: { mode: 'MONTHS_OF_RENT', value: draft.depositMonths },
      lateFees: [{ afterDays: draft.grace, kind: 'PERCENT_OF_RENT', value: draft.latePct, recurringEveryDays: null }, { afterDays: draft.lockout, kind: 'FIXED', value: draft.lateFixed, recurringEveryDays: 30 }],
      cancellation: [{ minHoursBeforeStart: 72, depositRefundPct: draft.refund72 }, { minHoursBeforeStart: 24, depositRefundPct: draft.refund24 }, { minHoursBeforeStart: 0, depositRefundPct: 0 }],
      discounts: [
        { code: 'DAI_HAN_6', kind: 'PERCENT', value: draft.disc6, minMonths: 6, validFrom: null, validTo: null, requiresApprovalRole: null },
        { code: 'DAI_HAN_12', kind: 'PERCENT', value: draft.disc12, minMonths: 12, validFrom: null, validTo: null, requiresApprovalRole: null },
      ],
    },
  }, (p) => `Đã phát hành chính sách v${p.version} — áp dụng cho đặt chỗ mới`);

  const num = (k: keyof typeof draft, label: string, hint?: string, suffix?: string) => (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" min={0} className={cx(inputCls, suffix && 'pr-14')} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-500">{suffix}</span>}
      </div>
    </Field>
  );

  return (
    <>
      <PageHeader title="Chính sách vận hành" description="Mỗi lần lưu tạo một phiên bản mới. Đặt chỗ và hợp đồng đã ký giữ nguyên phiên bản tại thời điểm ký." actions={
        <select className={cx(inputCls, 'w-auto min-w-56')} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="GLOBAL">Toàn chuỗi (mặc định)</option>
          {db.facilities.filter((f) => !f.isDeleted).map((f) => <option key={f._id} value={f._id}>Riêng: {f.name}</option>)}
        </select>
      } />
      {inherits && <Card className="mb-4 border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{facilityName(db, facilityId)} đang dùng chính sách toàn chuỗi v{current.version}. Phát hành ở đây sẽ tạo chính sách riêng cho chi nhánh này.</Card>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title={`Đang áp dụng: v${current.version}`} description={`Hiệu lực từ ${fmtDate(current.effectiveFrom)}`} actions={<Button onClick={publish}>Phát hành phiên bản mới</Button>} />
          <div className="space-y-6 p-5">
            <section>
              <h4 className="mb-3 text-sm font-semibold">Đặt chỗ & tiền cọc</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                {num('hold', 'Thời gian giữ chỗ', 'Chờ thanh toán cọc', 'phút')}
                {num('depositMonths', 'Tiền cọc', 'Tính theo số tháng tiền thuê', 'tháng')}
              </div>
            </section>
            <section>
              <h4 className="mb-3 text-sm font-semibold">Quá hạn & khóa truy cập</h4>
              <div className="grid gap-4 sm:grid-cols-4">
                {num('grace', 'Thời gian ân hạn', undefined, 'ngày')}
                {num('lockout', 'Khóa truy cập sau', undefined, 'ngày')}
                {num('latePct', 'Phí trễ (sau ân hạn)', 'Trên tiền thuê tháng', '%')}
                {num('lateFixed', 'Phí cố định (khi khóa)', undefined, '₫')}
              </div>
            </section>
            <section>
              <h4 className="mb-3 text-sm font-semibold">Hủy đặt chỗ — hoàn cọc</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                {num('refund72', 'Hủy trước ≥ 72 giờ', undefined, '%')}
                {num('refund24', 'Hủy trước ≥ 24 giờ', 'Dưới 24 giờ: không hoàn', '%')}
              </div>
            </section>
            <section>
              <h4 className="mb-3 text-sm font-semibold">Ưu đãi thuê dài hạn</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                {num('disc6', 'Từ 6 tháng', undefined, '%')}
                {num('disc12', 'Từ 12 tháng', undefined, '%')}
              </div>
            </section>
          </div>
        </Card>

        <Card>
          <CardHeader title="Lịch sử phiên bản" actions={<History className="size-4 text-stone-400" />} />
          <Table rows={history} rowKey={(p) => p._id} columns={[
            { key: 'v', header: 'Bản', cell: (p) => <span className="font-medium">v{p.version}</span> },
            { key: 'e', header: 'Hiệu lực', cell: (p) => <div><p>{fmtDate(p.effectiveFrom)}</p><p className="text-xs text-stone-500">{p.createdBy ? userName(db, p.createdBy) : 'Seed'}</p></div> },
            { key: 'g', header: 'Ân hạn / khóa', cell: (p) => `${p.gracePeriodDays} / ${p.lockoutAfterDays} ngày` },
            { key: 's', header: '', cell: (p) => (p.isActive ? <Badge tone="green">Đang dùng</Badge> : <Badge>Cũ</Badge>) },
          ]} />
          <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">Hạn mức miễn giảm: {current.waiverLimits.map((w) => `${w.role === 'FACILITY_MANAGER' ? 'QL chi nhánh' : 'QL vận hành'} ${vnd(w.maxAmount)}`).join(' · ')}</p>
        </Card>
      </div>
    </>
  );
}

function toDraft(p: BusinessPolicy) {
  const pctFee = p.lateFees.find((f) => f.kind === 'PERCENT_OF_RENT');
  const fixed = p.lateFees.find((f) => f.kind === 'FIXED');
  return {
    hold: p.reservationHoldMinutes, depositMonths: p.deposit.value, grace: p.gracePeriodDays, lockout: p.lockoutAfterDays,
    latePct: pctFee?.value ?? 0, lateFixed: fixed?.value ?? 0,
    refund72: p.cancellation.find((c) => c.minHoursBeforeStart === 72)?.depositRefundPct ?? 100,
    refund24: p.cancellation.find((c) => c.minHoursBeforeStart === 24)?.depositRefundPct ?? 50,
    disc6: p.discounts.find((d) => d.minMonths === 6)?.value ?? 0, disc12: p.discounts.find((d) => d.minMonths === 12)?.value ?? 0,
  };
}
