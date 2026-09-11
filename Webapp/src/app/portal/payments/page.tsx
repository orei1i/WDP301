'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { PAYMENT_METHOD, PAYMENT_STATUS, PAYMENT_TYPE } from '@/lib/labels';
import { byId, facilityName, unitLabel } from '@/lib/domain';
import { fmtDate, fmtDateTime, vnd } from '@/lib/format';
import { Card, PageHeader, Stat, StatusBadge, Table, Tabs } from '@/components/ui';

type Tab = 'all' | 'due';

export default function MyPayments() {
  const { db, user } = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const mine = useMemo(() => (user ? db.payments.filter((p) => p.customerId === user._id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []), [db.payments, user]);
  if (!user) return null;
  const due = mine.filter((p) => p.status === 'PENDING' || p.status === 'FAILED');
  const paid = mine.filter((p) => p.status === 'SUCCEEDED' && p.direction === 'CHARGE' && p.method !== 'INTERNAL').reduce((s, p) => s + p.amount, 0);
  const refunded = mine.filter((p) => p.direction === 'REFUND').reduce((s, p) => s + p.amount, 0);
  const rows = tab === 'all' ? mine : due;

  return (
    <>
      <PageHeader title="Lịch sử thanh toán" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Đã thanh toán" value={vnd(paid)} tone="green" />
        <Stat label="Chờ thanh toán" value={vnd(due.reduce((s, p) => s + p.amount, 0))} tone="amber" />
        <Stat label="Đã hoàn" value={vnd(refunded)} tone="violet" />
      </div>
      <Tabs tabs={[{ key: 'all', label: 'Tất cả', count: mine.length }, { key: 'due', label: 'Chưa thanh toán', count: due.length }]} value={tab} onChange={setTab} />
      <Card className="mt-4">
        <Table rows={rows} rowKey={(p) => p._id} columns={[
          { key: 'date', header: 'Ngày', cell: (p) => fmtDateTime(p.paidAt ?? p.createdAt) },
          { key: 'type', header: 'Khoản', cell: (p) => <div><StatusBadge map={PAYMENT_TYPE} value={p.type} />{p.period && <p className="mt-1 text-xs text-stone-500">Kỳ {fmtDate(p.period.start)} – {fmtDate(p.period.end)}</p>}</div> },
          { key: 'unit', header: 'Kho', cell: (p) => { const c = byId(db.contracts, p.contractId); return <span className="text-sm">{c ? unitLabel(db, c.unitId) : '—'} <span className="text-stone-500">· {facilityName(db, p.facilityId)}</span></span>; } },
          { key: 'method', header: 'Phương thức', cell: (p) => PAYMENT_METHOD[p.method] },
          { key: 'amount', header: 'Số tiền', className: 'text-right tabular-nums', cell: (p) => <span className={p.direction === 'REFUND' ? 'text-violet-700' : ''}>{p.direction === 'REFUND' ? '+' : ''}{vnd(p.amount)}</span> },
          { key: 'status', header: 'Trạng thái', cell: (p) => <StatusBadge map={PAYMENT_STATUS} value={p.status} /> },
        ]} />
      </Card>
    </>
  );
}
