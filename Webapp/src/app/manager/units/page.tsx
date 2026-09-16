'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { PriceTier } from '@ssm/shared';
import { useStore } from '@/lib/store';
import { UNIT_CATEGORY } from '@/lib/labels';
import { availability, unitRate } from '@/lib/domain';
import { vnd } from '@/lib/format';
import { Button, Card, CardHeader, Field, Modal, PageHeader, Table, inputCls } from '@/components/ui';
import { FacilityPicker, useFacilityScope } from '@/components/facility-picker';
import { UnitMap } from '@/components/unit-map';

export default function ManagerUnits() {
  const { db, run } = useStore();
  const scope = useFacilityScope();
  const fid = scope.facilityId;
  const types = db.unitTypes.filter((t) => t.facilityId === fid);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ unitTypeId: '', unitNumber: '', floor: 1, priceTier: 'STANDARD' as PriceTier });

  const rows = types.map((t) => {
    const us = db.units.filter((u) => u.unitTypeId === t._id && !u.isDeleted);
    const n = (s: string) => us.filter((u) => u.status === s).length;
    return { t, total: us.length, available: n('AVAILABLE'), reserved: n('RESERVED'), occupied: n('OCCUPIED') + n('PENDING_INSPECTION'), maintenance: n('MAINTENANCE'), sellable: availability(db, fid, t._id).available };
  });

  return (
    <>
      <PageHeader title="Quản lý kho" description="Tồn kho theo loại và sơ đồ từng kho. Giá cơ sở do Quản lý vận hành thiết lập." actions={<><FacilityPicker scope={scope} /><Button onClick={() => { setForm({ unitTypeId: types[0]?._id ?? '', unitNumber: '', floor: 1, priceTier: 'STANDARD' }); setOpen(true); }}><Plus className="size-4" />Thêm kho</Button></>} />
      <Card>
        <CardHeader title="Tồn kho theo loại" description="“Có thể bán” = trống trừ các lượt giữ chỗ chưa phân kho" />
        <Table rows={rows} rowKey={(r) => r.t._id} columns={[
          { key: 'n', header: 'Loại kho', cell: (r) => <div><p className="font-medium">{r.t.name}</p><p className="text-xs text-stone-500">{UNIT_CATEGORY[r.t.category]} · {r.t.dimensions.widthM}×{r.t.dimensions.depthM} m</p></div> },
          { key: 'p', header: 'Giá / tháng', className: 'tabular-nums', cell: (r) => vnd(unitRate(r.t)) },
          { key: 'tot', header: 'Tổng', className: 'text-right tabular-nums', cell: (r) => r.total },
          { key: 'a', header: 'Trống', className: 'text-right tabular-nums text-emerald-700', cell: (r) => r.available },
          { key: 'rs', header: 'Đã giữ', className: 'text-right tabular-nums', cell: (r) => r.reserved },
          { key: 'o', header: 'Đang thuê', className: 'text-right tabular-nums', cell: (r) => r.occupied },
          { key: 'm', header: 'Bảo trì', className: 'text-right tabular-nums text-amber-700', cell: (r) => r.maintenance },
          { key: 's', header: 'Có thể bán', className: 'text-right font-semibold tabular-nums', cell: (r) => r.sellable },
        ]} />
      </Card>
      <Card className="mt-6 p-5"><UnitMap facilityId={fid} /></Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Thêm kho mới"
        footer={<Button onClick={() => void run('addUnit', form, `Đã thêm kho ${form.unitNumber.toUpperCase()}`, () => setOpen(false))}>Lưu</Button>}>
        <div className="grid gap-4">
          <Field label="Loại kho">
            <select className={inputCls} value={form.unitTypeId} onChange={(e) => setForm({ ...form, unitTypeId: e.target.value })}>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mã kho"><input className={inputCls} value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="M2-09" /></Field>
            <Field label="Tầng"><input type="number" className={inputCls} value={form.floor} onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })} /></Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
