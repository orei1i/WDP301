'use client';

import { useState } from 'react';
import { Banknote, BadgePercent, Lock } from 'lucide-react';
import type { RentalContract } from '@ssm/shared';
import { useStore } from '@/lib/store';
import { ACCESS_METHOD, CONTRACT_STATUS, DEPOSIT_STATUS, PAYMENT_STATUS, PAYMENT_TYPE } from '@/lib/labels';
import { effectivePolicy, typeName, unitLabel, userName } from '@/lib/domain';
import { addDays, fmtDate, todayISO, vnd } from '@/lib/format';
import { Button, Card, EmptyState, Field, KV, Modal, PageHeader, StatusBadge, Table, Tabs, cx, inputCls } from '@/components/ui';
import { FacilityPicker, useFacilityScope } from '@/components/facility-picker';

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
          { key: 'r', header: 'Giá / tháng', className: 'tabular-nums', cell: (x) => vnd(x.billing.monthlyRate) },
          { key: 'o', header: 'Công nợ', className: 'tabular-nums', cell: (x) => <div><p className={cx(x.balance.outstanding > 0 && 'font-medium text-red-700')}>{vnd(x.balance.outstanding)}</p>{x.delinquency && <p className="text-xs text-stone-500">quá hạn {x.delinquency.daysOverdue} ngày</p>}</div> },
          { key: 's', header: 'Trạng thái', cell: (x) => <StatusBadge map={CONTRACT_STATUS} value={x.status} /> },
          { key: 'a', header: '', className: 'text-right', cell: (x) => (
            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
              {x.status === 'DELINQUENT' && <Button size="sm" variant="danger" onClick={() => run('lockout', { contractId: x._id }, `Đã khóa truy cập kho ${unitLabel(db, x.unitId)}`)}><Lock className="size-3.5" />Khóa</Button>}
              {x.balance.outstanding > 0 && <Button size="sm" variant="secondary" onClick={() => run('payBalance', { contractId: x._id, method: 'CASH' }, (v) => `Đã thu ${vnd(v)} tại quầy`)}><Banknote className="size-3.5" />Thu tại quầy</Button>}
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
              ['Thời hạn', `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`], ['Giá / tháng', vnd(c.billing.monthlyRate)],
              ['Đã thanh toán đến', fmtDate(c.billing.paidThrough)], ['Kỳ tới', fmtDate(c.billing.nextBillingDate)],
              ['Tiền cọc', vnd(c.deposit.amount)], ['Truy cập', `${ACCESS_METHOD[c.access.method]}${c.access.suspendedAt ? ' · đang tạm khóa' : ''}`],
              ['Chính sách', `v${c.terms.policyVersion} · ân hạn ${c.terms.gracePeriodDays} ngày`], ['Gia hạn', `${c.renewals.length} lần`],
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
    </>
  );
}
