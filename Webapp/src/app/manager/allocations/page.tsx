'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import type { Reservation } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { RESERVATION_STATUS } from '@/shared/lib/labels';
import { effectivePolicy, typeName, unitLabel, unitRate, userName } from '@/shared/lib/domain';
import { fmtDate, relativeDay, todayISO, vnd } from '@/shared/lib/format';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, StatusBadge, Table, Tabs, cx } from '@/shared/ui';
import { FacilityPicker, useFacilityScope } from '@/features/facilities/facility-picker';

type Tab = 'todo' | 'allocated' | 'pending';

export default function Allocations() {
  const { db, run } = useStore();
  const scope = useFacilityScope();
  const fid = scope.facilityId;
  const T = todayISO();
  const policy = effectivePolicy(db, fid);
  const [tab, setTab] = useState<Tab>('todo');
  const [target, setTarget] = useState<Reservation | null>(null);
  const [unitId, setUnitId] = useState('');

  const list = db.reservations.filter((r) => r.facilityId === fid).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const groups: Record<Tab, Reservation[]> = {
    todo: list.filter((r) => r.status === 'CONFIRMED'),
    allocated: list.filter((r) => r.status === 'ALLOCATED'),
    pending: list.filter((r) => r.status === 'PENDING'),
  };
  const r = target ? db.reservations.find((x) => x._id === target._id) ?? null : null;
  const candidates = r ? db.units.filter((u) => u.facilityId === r.facilityId && u.unitTypeId === r.unitTypeId && u.status === 'AVAILABLE').sort((a, b) => a.location.floor - b.location.floor || a.unitNumber.localeCompare(b.unitNumber)) : [];

  const noShow = (x: Reservation) => new Date(x.startDate).getTime() + policy.noShowAfterHours * 3_600_000 < Date.now();

  return (
    <>
      <PageHeader title="Phân kho" description={`Gán kho cụ thể cho đặt chỗ đã đặt cọc. Nên phân trước ngày nhận ${policy.allocationLeadDays} ngày.`} actions={<FacilityPicker scope={scope} />} />
      <Tabs tabs={[{ key: 'todo', label: 'Chờ phân kho', count: groups.todo.length }, { key: 'allocated', label: 'Đã phân kho', count: groups.allocated.length }, { key: 'pending', label: 'Chờ đặt cọc', count: groups.pending.length }]} value={tab} onChange={setTab} />
      <Card className="mt-4">
        <Table rows={groups[tab]} rowKey={(x) => x._id} empty={<EmptyState title="Không có đặt chỗ" />} columns={[
          { key: 'c', header: 'Mã', cell: (x) => <span className="font-mono text-xs">{x.code}</span> },
          { key: 'k', header: 'Khách hàng', cell: (x) => userName(db, x.customerId) },
          { key: 't', header: 'Loại kho', cell: (x) => typeName(db, x.unitTypeId) },
          { key: 'd', header: 'Ngày nhận', cell: (x) => <div><p>{fmtDate(x.startDate)}</p><p className={cx('text-xs', x.startDate <= T ? 'font-medium text-red-600' : 'text-stone-500')}>{relativeDay(x.startDate)}</p></div> },
          { key: 'm', header: 'Thời hạn', cell: (x) => `${x.durationMonths} tháng` },
          { key: 'u', header: 'Kho', cell: (x) => (x.unitId ? <Badge tone="violet">{unitLabel(db, x.unitId)}</Badge> : <span className="text-stone-400">—</span>) },
          { key: 's', header: 'Trạng thái', cell: (x) => <StatusBadge map={RESERVATION_STATUS} value={x.status} /> },
          { key: 'a', header: '', className: 'text-right', cell: (x) => (
            <div className="flex justify-end gap-2">
              {x.status === 'CONFIRMED' && <Button size="sm" onClick={() => { setTarget(x); setUnitId(''); }}>Phân kho</Button>}
              {x.status === 'ALLOCATED' && <Button size="sm" variant="secondary" onClick={() => run('unallocate', { reservationId: x._id }, 'Đã gỡ phân kho')}>Gỡ</Button>}
              {(x.status === 'CONFIRMED' || x.status === 'ALLOCATED') && noShow(x) && <Button size="sm" variant="ghost" onClick={() => run('cancelReservation', { reservationId: x._id, reason: 'NO_SHOW' }, 'Đã hủy do khách không đến')}>Hủy (no-show)</Button>}
            </div>
          ) },
        ]} />
      </Card>

      <Modal open={!!r} onClose={() => setTarget(null)} title={`Phân kho cho ${r?.code ?? ''}`} description={r ? `${typeName(db, r.unitTypeId)} · ${userName(db, r.customerId)} · nhận ${fmtDate(r.startDate)}` : ''} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => r && void run('allocate', { reservationId: r._id }, (u) => `Đã tự động phân kho ${u.unitNumber}`, () => setTarget(null))}><Wand2 className="size-4" />Tự động chọn</Button>
          <Button disabled={!unitId} onClick={() => r && void run('allocate', { reservationId: r._id, unitId }, (u) => `Đã phân kho ${u.unitNumber}`, () => setTarget(null))}>Phân kho đã chọn</Button>
        </>}>
        {candidates.length === 0 ? <EmptyState title="Không còn kho trống cùng loại" description="Kiểm tra kho đang bảo trì hoặc liên hệ khách để đổi loại kho." /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {candidates.map((u) => (
              <button key={u._id} onClick={() => setUnitId(u._id)} className={cx('rounded-lg p-3 text-left ring-1 ring-inset', unitId === u._id ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-stone-300 hover:bg-stone-50')}>
                <p className="font-semibold">{u.unitNumber}</p>
                <p className="text-xs text-stone-500">Tầng {u.location.floor} · {u.priceTier === 'PREMIUM' ? 'Premium' : 'Tiêu chuẩn'}</p>
                <p className="mt-1 text-xs tabular-nums">{vnd(unitRate(db.unitTypes.find((t) => t._id === u.unitTypeId)!, u))}</p>
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-stone-500">Giá khách trả giữ nguyên theo báo giá lúc đặt ({vnd(r?.quote.firstPeriodRent ?? 0)}/tháng), kể cả khi phân vào kho Premium.</p>
      </Modal>
    </>
  );
}
