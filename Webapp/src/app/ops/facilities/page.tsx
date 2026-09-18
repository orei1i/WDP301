'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Facility, FacilityStatus } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { FACILITY_STATUS } from '@/shared/lib/labels';
import { effectivePolicy, facilityStats } from '@/shared/lib/domain';
import { pct } from '@/shared/lib/format';
import { Button, Card, Field, Modal, PageHeader, StatusBadge, Table, inputCls } from '@/shared/ui';

const EMPTY = { _id: undefined as string | undefined, name: '', code: '', status: 'UNDER_CONSTRUCTION' as FacilityStatus, line1: '', district: '', phone: '' };

export default function OpsFacilities() {
  const { db, run } = useStore();
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const edit = (f: Facility) => setForm({ _id: f._id, name: f.name, code: f.code, status: f.status, line1: f.address.line1, district: f.address.district, phone: f.contact.phone });

  return (
    <>
      <PageHeader title="Chi nhánh" description="Thêm, sửa, tạm ngưng chi nhánh trong chuỗi." actions={<Button onClick={() => setForm({ ...EMPTY })}><Plus className="size-4" />Thêm chi nhánh</Button>} />
      <Card>
        <Table rows={db.facilities.filter((f) => !f.isDeleted)} rowKey={(f) => f._id} onRowClick={edit} columns={[
          { key: 'c', header: 'Mã', cell: (f) => <span className="font-mono text-xs">{f.code}</span> },
          { key: 'n', header: 'Tên', cell: (f) => <div><p className="font-medium">{f.name}</p><p className="text-xs text-stone-500">{f.address.line1}, {f.address.district}</p></div> },
          { key: 's', header: 'Trạng thái', cell: (f) => <StatusBadge map={FACILITY_STATUS} value={f.status} /> },
          { key: 'u', header: 'Số kho', className: 'text-right tabular-nums', cell: (f) => facilityStats(db, f._id).total },
          { key: 'o', header: 'Lấp đầy', className: 'text-right tabular-nums', cell: (f) => pct(facilityStats(db, f._id).occupancy) },
          { key: 'p', header: 'Chính sách', cell: (f) => { const p = effectivePolicy(db, f._id); return <span className="text-xs">{p.scope === 'FACILITY' ? 'Riêng' : 'Toàn chuỗi'} v{p.version}</span>; } },
          { key: 'm', header: 'Quản lý', cell: (f) => <span className="text-xs">{db.users.filter((u) => u.role === 'FACILITY_MANAGER' && u.facilityIds.includes(f._id)).map((u) => u.fullName).join(', ') || '—'}</span> },
        ]} />
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Sửa chi nhánh' : 'Thêm chi nhánh'}
        footer={<Button onClick={() => form && void run('saveFacility', form, 'Đã lưu chi nhánh', () => setForm(null))}>Lưu</Button>}>
        {form && (
          <div className="grid gap-4">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Field label="Tên chi nhánh"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Mã"><input className={inputCls} value={form.code} disabled={!!form._id} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="HCM-GV-01" /></Field>
            </div>
            <Field label="Địa chỉ"><input className={inputCls} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Khu vực"><input className={inputCls} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
              <Field label="Điện thoại"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Trạng thái" hint="Chi nhánh không ở trạng thái 'Đang hoạt động' sẽ không nhận đặt chỗ mới.">
              <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FacilityStatus })}>
                {Object.entries(FACILITY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
