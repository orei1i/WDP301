'use client';

import { useState } from 'react';
import { ArrowLeftRight, Banknote, BadgePercent, Lock } from 'lucide-react';
import type { RentalContract } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { PERIOD_UNIT } from '@ssm/shared';
import { ACCESS_METHOD, CONTRACT_STATUS, DEPOSIT_STATUS, PAYMENT_STATUS, PAYMENT_TYPE } from '@/shared/lib/labels';
import { effectivePolicy, typeName, unitLabel, userName } from '@/shared/lib/domain';
import { addDays, fmtDate, todayISO, vnd } from '@/shared/lib/format';
import { Button, Card, EmptyState, Field, KV, Modal, PageHeader, StatusBadge, Table, Tabs, cx, inputCls } from '@/shared/ui';
import { FacilityPicker, useFacilityScope } from '@/features/facilities/facility-picker';

type Tab = 'overdue' | 'expiring' | 'moveout' | 'all';

export default function Contracts() {
  const { db, run } = useStore();
  const scope = useFacilityScope();
  const fid = scope.facilityId;
  const policy = effectivePolicy(db, fid);
  const [tab, setTab] = useState<Tab>('overdue');
  const [view, setView] = useState<RentalContract | null>(null);
  const [waive, setWaive] = useState<RentalContract | null>(null);
  const [reason, setReason] = useState('');
  const [swap, setSwap] = useState<RentalContract | null>(null);
  const [swapForm, setSwapForm] = useState({ toUnitId: '', reason: '', keyTag: '', fee: 0 });
  const T = todayISO();

  const open = db.contracts.filter((c) => c.facilityId === fid && c.status !== 'CLOSED');
  const groups: Record<Tab, RentalContract[]> = {
    overdue: open.filter((c) => c.status === 'DELINQUENT' || c.status === 'LOCKED_OUT').sort((a, b) => (b.delinquency?.daysOverdue ?? 0) - (a.delinquency?.daysOverdue ?? 0)),
    expiring: open.filter((c) => c.status === 'ACTIVE' && c.endDate <= addDays(T, 30) && !c.autoRenew).sort((a, b) => a.endDate.localeCompare(b.endDate)),
    moveout: open.filter((c) => c.status === 'MOVE_OUT_PENDING'),
    all: open,
  };
  const c = view ? db.contracts.find((x) => x._id === view._id) ?? null : null;
  const cPayments = c ? db.payments.filter((p) => p.contractId === c._id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8) : [];

  /** Đổi ô chỉ trong CÙNG loại kho — cùng loại thì cùng giá, hợp đồng không phải định giá lại. */
  const swapCandidates = swap
    ? db.units.filter((u) => u.facilityId === swap.facilityId && u.unitTypeId === swap.unitTypeId && u.status === 'AVAILABLE' && !u.isDeleted)
      .sort((a, b) => a.location.floor - b.location.floor || a.unitNumber.localeCompare(b.unitNumber))
    : [];
  const openSwap = (x: RentalContract) => { setSwapForm({ toUnitId: '', reason: '', keyTag: '', fee: 0 }); setSwap(x); };
  const canSwap = (x: RentalContract) => x.status === 'ACTIVE' && x.balance.outstanding === 0;

  return (
    <>
      <PageHeader title="Hợp đồng & công nợ" description={`Ân hạn ${policy.gracePeriodDays} ngày · khóa truy cập khi quá hạn trên ${policy.gracePeriodDays} ngày (tự động sau ${policy.lockoutAfterDays} ngày).`} actions={<FacilityPicker scope={scope} />} />
      <Tabs tabs={[
        { key: 'overdue', label: 'Quá hạn', count: groups.overdue.length }, { key: 'expiring', label: 'Sắp hết hạn (30 ngày)', count: groups.expiring.length },
        { key: 'moveout', label: 'Chờ trả kho', count: groups.moveout.length }, { key: 'all', label: 'Tất cả đang mở', count: groups.all.length },
      ]} value={tab} onChange={setTab} />
      <Card className="mt-4">
        <Table rows={groups[tab]} rowKey={(x) => x._id} onRowClick={setView} empty={<EmptyState title="Không có hợp đồng" />} columns={[
          { key: 'u', header: 'Kho', cell: (x) => <div><p className="font-semibold">{unitLabel(db, x.unitId)}</p><p className="text-xs text-stone-500">{typeName(db, x.unitTypeId)}</p></div> },
          { key: 'k', header: 'Khách hàng', cell: (x) => <div><p>{userName(db, x.customerId)}</p><p className="font-mono text-[11px] text-stone-500">{x.contractNumber}</p></div> },
          { key: 'e', header: 'Hết hạn', cell: (x) => <div><p>{fmtDate(x.endDate)}</p><p className="text-xs text-stone-500">{x.autoRenew ? 'Tự gia hạn' : 'Không tự gia hạn'}</p></div> },
          { key: 'r', header: 'Giá thuê', className: 'tabular-nums', cell: (x) => `${vnd(x.billing.rate)}/${PERIOD_UNIT[x.billing.rentalPeriod]}` },
          { key: 'o', header: 'Công nợ', className: 'tabular-nums', cell: (x) => <div><p className={cx(x.balance.outstanding > 0 && 'font-medium text-red-700')}>{vnd(x.balance.outstanding)}</p>{x.delinquency && <p className="text-xs text-stone-500">quá hạn {x.delinquency.daysOverdue} ngày</p>}</div> },
          { key: 's', header: 'Trạng thái', cell: (x) => <StatusBadge map={CONTRACT_STATUS} value={x.status} /> },
          { key: 'a', header: '', className: 'text-right', cell: (x) => (
            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
              {x.status === 'DELINQUENT' && <Button size="sm" variant="danger" onClick={() => run('lockout', { contractId: x._id }, `Đã khóa truy cập kho ${unitLabel(db, x.unitId)}`)}><Lock className="size-3.5" />Khóa</Button>}
              {x.balance.outstanding > 0 && <Button size="sm" variant="secondary" onClick={() => run('payBalance', { contractId: x._id, method: 'CASH' }, (v) => `Đã thu ${vnd(v)} tại quầy`)}><Banknote className="size-3.5" />Thu tại quầy</Button>}
              {canSwap(x) && <Button size="sm" variant="secondary" onClick={() => openSwap(x)}><ArrowLeftRight className="size-3.5" />Đổi ô</Button>}
              {(x.delinquency?.lateFeesAccrued ?? 0) > 0 && <Button size="sm" variant="ghost" onClick={() => { setWaive(x); setReason(''); }}><BadgePercent className="size-3.5" />Miễn phí trễ</Button>}
            </div>
          ) },
        ]} />
      </Card>

      <Modal open={!!c} onClose={() => setView(null)} size="lg" title={`Hợp đồng ${c?.contractNumber ?? ''}`} description={c ? `${userName(db, c.customerId)} · kho ${unitLabel(db, c.unitId)}` : ''}>
        {c && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2"><StatusBadge map={CONTRACT_STATUS} value={c.status} /><StatusBadge map={DEPOSIT_STATUS} value={c.deposit.status} /></div>
            <KV items={[
              ['Thời hạn', `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`], ['Giá thuê', `${vnd(c.billing.rate)}/${PERIOD_UNIT[c.billing.rentalPeriod]}`],
              ['Đã thanh toán đến', fmtDate(c.billing.paidThrough)], ['Kỳ tới', fmtDate(c.billing.nextBillingDate)],
              ['Tiền cọc', vnd(c.deposit.amount)], ['Truy cập', `${ACCESS_METHOD[c.access.method]}${c.access.suspendedAt ? ' · đang tạm khóa' : ''}`],
              ['Chính sách', `v${c.terms.policyVersion} · ân hạn ${c.terms.gracePeriodDays} ngày`], ['Gia hạn', `${c.renewals.length} lần`],
              ['Đổi ô', `${c.unitSwaps?.length ?? 0} lần`],
            ]} />
            <div>
              <h4 className="mb-2 text-sm font-semibold">Thanh toán gần đây</h4>
              <Table rows={cPayments} rowKey={(p) => p._id} columns={[
                { key: 'd', header: 'Ngày', cell: (p) => fmtDate(p.paidAt ?? p.createdAt) },
                { key: 't', header: 'Khoản', cell: (p) => PAYMENT_TYPE[p.type].label },
                { key: 'a', header: 'Số tiền', className: 'text-right tabular-nums', cell: (p) => vnd(p.amount) },
                { key: 's', header: 'Trạng thái', cell: (p) => <StatusBadge map={PAYMENT_STATUS} value={p.status} /> },
              ]} />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Lịch sử trạng thái</h4>
              <ol className="space-y-1 text-sm">
                {c.statusHistory.map((h, i) => <li key={i} className="flex gap-2"><span className="w-24 shrink-0 text-xs text-stone-500">{fmtDate(h.at)}</span>{h.from ? `${CONTRACT_STATUS[h.from].label} → ` : ''}{CONTRACT_STATUS[h.to].label}{h.reason && <span className="text-stone-500"> · {h.reason}</span>}</li>)}
              </ol>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!waive} onClose={() => setWaive(null)} title="Miễn phí trễ hạn" description={waive ? `${unitLabel(db, waive.unitId)} · phí ${vnd(waive.delinquency?.lateFeesAccrued ?? 0)}` : ''}
        footer={<Button disabled={reason.trim().length < 5} onClick={() => waive && void run('waiveLateFees', { contractId: waive._id, reason }, (v) => `Đã miễn ${vnd(v)}`, () => setWaive(null))}>Xác nhận miễn</Button>}>
        <Field label="Lý do (ghi vào nhật ký kiểm toán)" hint={`Hạn mức của Quản lý chi nhánh: ${vnd(policy.waiverLimits.find((w) => w.role === 'FACILITY_MANAGER')?.maxAmount ?? 0)} / lần`}>
          <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>

      <Modal open={!!swap} onClose={() => setSwap(null)} size="lg"
        title="Đổi ô kho" description={swap ? `${userName(db, swap.customerId)} · đang thuê ${unitLabel(db, swap.unitId)} (${typeName(db, swap.unitTypeId)})` : ''}
        footer={
          <Button disabled={!swapForm.toUnitId || swapForm.reason.trim().length < 5}
            onClick={() => swap && void run('swapUnit', { contractId: swap._id, toUnitId: swapForm.toUnitId, reason: swapForm.reason, keyTag: swapForm.keyTag, fee: swapForm.fee },
              (u) => `Đã chuyển sang ô ${u.unitNumber} — giá thuê giữ nguyên`, () => setSwap(null))}>
            Xác nhận đổi ô
          </Button>
        }>
        {swap && (
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-200">
              Chỉ đổi được sang ô <b>cùng loại</b>. Giá thuê <b>{vnd(swap.billing.rate)}/{PERIOD_UNIT[swap.billing.rentalPeriod]}</b> và tiền cọc <b>{vnd(swap.deposit.amount)}</b> giữ nguyên theo hợp đồng đã ký.
              Ô cũ chuyển sang <b>chờ kiểm tra</b> sau khi đổi.
            </div>

            {swapCandidates.length === 0 ? (
              <EmptyState title="Không còn ô trống cùng loại" description="Chi nhánh này đã kín loại kho đó. Chờ có ô trả hoặc thương lượng đổi sang loại khác qua hợp đồng mới." />
            ) : (
              <Field label={`Ô kho mới (${swapCandidates.length} ô trống cùng loại)`}>
                <select className={inputCls} value={swapForm.toUnitId} onChange={(e) => setSwapForm((f) => ({ ...f, toUnitId: e.target.value }))}>
                  <option value="">— Chọn ô —</option>
                  {swapCandidates.map((u) => <option key={u._id} value={u._id}>{u.unitNumber} · tầng {u.location.floor}{u.location.zone ? ` · khu ${u.location.zone}` : ''}</option>)}
                </select>
              </Field>
            )}

            <Field label="Lý do đổi ô" hint="Ghi vào hợp đồng và nhật ký kiểm toán — tối thiểu 5 ký tự">
              <textarea className={inputCls} rows={2} value={swapForm.reason} onChange={(e) => setSwapForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="VD: khách xin đổi sang ô gần lối ra, ô cũ ẩm sau mưa…" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nhãn chìa khóa / thẻ mới" hint="Bỏ trống nếu giữ nguyên khóa cũ">
                <input className={inputCls} value={swapForm.keyTag} onChange={(e) => setSwapForm((f) => ({ ...f, keyTag: e.target.value }))} placeholder="VD: K-217" />
              </Field>
              <Field label="Phí thao tác (VND)" hint="Cùng loại nên không tính lại giá. Khoản này chỉ là phí di dời / cấp lại khóa, tối đa 500.000 ₫ — để 0 nếu miễn.">
                <input type="number" min={0} max={500_000} step={10_000} className={inputCls} value={swapForm.fee}
                  onChange={(e) => setSwapForm((f) => ({ ...f, fee: Math.max(0, Number(e.target.value) || 0) }))} />
              </Field>
            </div>

            {swapForm.fee > 0 && <p className="text-sm text-amber-800">Phí {vnd(swapForm.fee)} sẽ được cộng vào công nợ của hợp đồng, khách thanh toán ở kỳ tới hoặc tại quầy.</p>}

            {(swap.unitSwaps?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Đã đổi ô {swap.unitSwaps!.length} lần</h4>
                <ol className="space-y-1 text-sm text-stone-600">
                  {swap.unitSwaps!.map((s, i) => (
                    <li key={i} className="flex flex-wrap gap-2">
                      <span className="w-24 shrink-0 text-xs text-stone-500">{fmtDate(s.at)}</span>
                      {unitLabel(db, s.fromUnitId)} → {unitLabel(db, s.toUnitId)}
                      <span className="text-stone-500">· {s.reason}{s.fee > 0 ? ` · phí ${vnd(s.fee)}` : ''}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
