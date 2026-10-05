'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { AccessMethod, enumValues, UnitCategory, type RentalPeriod, type StorageUnit, type UnitType } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { ACCESS_METHOD, FACILITY_STATUS, RENTAL_PERIOD, UNIT_CATEGORY, UNIT_STATUS } from '@/shared/lib/labels';
import { typeName } from '@/shared/lib/domain';
import { vnd } from '@/shared/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, StatusBadge, Table, cx, inputCls } from '@/shared/ui';

const PERIODS: RentalPeriod[] = ['DAY', 'WEEK', 'MONTH'];
const EDITABLE: StorageUnit['status'][] = ['AVAILABLE', 'MAINTENANCE'];

const EMPTY_TYPE = {
  _id: undefined as string | undefined, code: '', name: '', category: 'SMALL' as UnitCategory, description: '',
  widthM: 1.5, depthM: 2, heightM: 2.4, indoor: true, rates: { DAY: 60_000, WEEK: 350_000, MONTH: 990_000 } as Record<RentalPeriod, number>,
  minPeriods: 1, depositOverride: '' as string,
};
const EMPTY_BULK = { unitTypeId: '', prefix: '', start: 1, count: 1, floor: 1, zone: '', accessMethod: 'PIN' as AccessMethod };

function InventoryInner() {
  const { db, run } = useStore();
  const sp = useSearchParams();
  const facilities = db.facilities.filter((f) => !f.isDeleted);
  const [facilityId, setFacilityId] = useState(() => {
    const preset = sp.get('facility');
    return facilities.some((f) => f._id === preset) ? preset! : facilities[0]?._id ?? '';
  });
  const [typeForm, setTypeForm] = useState<typeof EMPTY_TYPE | null>(null);
  const [bulk, setBulk] = useState<typeof EMPTY_BULK | null>(null);
  const [unitForm, setUnitForm] = useState<{ unitId: string; unitNumber: string; floor: number; zone: string; accessMethod: AccessMethod } | null>(null);
  const [unitFilter, setUnitFilter] = useState('ALL');

  const facility = facilities.find((f) => f._id === facilityId);
  const types = db.unitTypes.filter((t) => t.facilityId === facilityId && !t.isDeleted);
  const units = db.units.filter((u) => u.facilityId === facilityId && !u.isDeleted)
    .filter((u) => unitFilter === 'ALL' || u.unitTypeId === unitFilter)
    .sort((a, b) => a.location.floor - b.location.floor || a.unitNumber.localeCompare(b.unitNumber));
  const unitCount = (t: UnitType) => db.units.filter((u) => u.unitTypeId === t._id && !u.isDeleted).length;

  const editType = (t: UnitType) => setTypeForm({
    _id: t._id, code: t.code, name: t.name, category: t.category, description: t.description ?? '',
    widthM: t.dimensions.widthM, depthM: t.dimensions.depthM, heightM: t.dimensions.heightM, indoor: t.features.indoor,
    rates: { ...t.rates }, minPeriods: t.minPeriods, depositOverride: t.depositOverride == null ? '' : String(t.depositOverride),
  });
  const saveType = () => {
    if (!typeForm || !facility) return;
    const deposit = typeForm.depositOverride.trim() === '' ? null : Math.round(Number(typeForm.depositOverride.replace(/\D/g, '')));
    const shared = {
      name: typeForm.name, description: typeForm.description, widthM: typeForm.widthM, depthM: typeForm.depthM, heightM: typeForm.heightM,
      indoor: typeForm.indoor, rates: typeForm.rates, minPeriods: typeForm.minPeriods, depositOverride: deposit,
    };
    if (typeForm._id) void run('updateUnitType', { unitTypeId: typeForm._id, ...shared }, 'Đã cập nhật loại kho', () => setTypeForm(null));
    else void run('createUnitType', { facilityId: facility._id, code: typeForm.code, category: typeForm.category, ...shared }, 'Đã thêm loại kho', () => setTypeForm(null));
  };
  const typeValid = !!typeForm && typeForm.name.trim().length >= 2 && (!!typeForm._id || /^[A-Za-z0-9.-]{2,20}$/.test(typeForm.code))
    && PERIODS.every((p) => typeForm.rates[p] >= 1_000) && typeForm.widthM >= 0.3 && typeForm.depthM >= 0.3 && typeForm.heightM >= 0.3;

  const openBulk = (t?: UnitType) => setBulk({ ...EMPTY_BULK, unitTypeId: t?._id ?? types[0]?._id ?? '', prefix: t ? `${t.code.split('-')[0]}-` : '' });
  const bulkWidth = bulk ? Math.max(2, String(bulk.start + bulk.count - 1).length) : 2;
  const bulkName = (n: number) => `${bulk!.prefix.toUpperCase()}${String(n).padStart(bulkWidth, '0')}`;
  const bulkValid = !!bulk && !!bulk.unitTypeId && /^[A-Za-z0-9-]{1,12}$/.test(bulk.prefix) && bulk.count >= 1 && bulk.count <= 200 && bulk.start >= 0;

  const area = typeForm ? Math.round(typeForm.widthM * typeForm.depthM * 100) / 100 : 0;

  return (
    <>
      <PageHeader title="Loại kho & ô kho" description="Thiết lập danh mục tủ/phòng thuê và các ô kho vật lý theo từng chi nhánh. Giá thuê theo từng chi nhánh, mỗi chi nhánh một bảng giá riêng."
        actions={
          <>
            <select className={cx(inputCls, 'w-auto min-w-56')} value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setUnitFilter('ALL'); }}>
              {facilities.map((f) => <option key={f._id} value={f._id}>{f.name} · {FACILITY_STATUS[f.status].label}</option>)}
            </select>
            <Button onClick={() => setTypeForm({ ...EMPTY_TYPE })} disabled={!facility}><Plus className="size-4" />Thêm loại kho</Button>
          </>
        } />

      {!facility ? <Card><EmptyState title="Chưa có chi nhánh" description="Tạo chi nhánh ở mục Chi nhánh trước." /></Card> : (
        <>
          {facility.status !== 'ACTIVE' && (
            <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Chi nhánh đang ở trạng thái “{FACILITY_STATUS[facility.status].label}” nên chưa nhận đặt chỗ. Thêm đủ loại kho và ô kho rồi chuyển sang “Đang hoạt động” ở mục Chi nhánh.
            </Card>
          )}

          <Card>
            <CardHeader title="Loại tủ/phòng thuê" description="Mã và nhóm cỡ cố định sau khi tạo — nhóm cỡ quyết định loại kho có tuỳ chọn điều hòa hay không."
              actions={<Button size="sm" variant="secondary" onClick={() => openBulk()} disabled={types.length === 0}><Plus className="size-3.5" />Thêm ô kho</Button>} />
            <Table rows={types} rowKey={(t) => t._id} empty={<EmptyState title="Chi nhánh chưa có loại kho" description="Bấm “Thêm loại kho” để tạo loại tủ/phòng đầu tiên." />} columns={[
              { key: 'n', header: 'Loại kho', cell: (t) => <div><p className="font-medium">{t.name}</p><p className="text-xs text-stone-500">{t.code} · {UNIT_CATEGORY[t.category]} · {t.dimensions.widthM}×{t.dimensions.depthM}×{t.dimensions.heightM} m ({t.areaM2} m²)</p></div> },
              { key: 'r', header: 'Giá ngày / tuần / tháng', className: 'tabular-nums text-xs', cell: (t) => `${vnd(t.rates.DAY)} / ${vnd(t.rates.WEEK)} / ${vnd(t.rates.MONTH)}` },
              { key: 'u', header: 'Số ô', className: 'text-right tabular-nums', cell: (t) => unitCount(t) },
              { key: 's', header: 'Trạng thái', cell: (t) => (t.isActive ? <Badge tone="green">Đang bán</Badge> : <Badge>Đã ẩn</Badge>) },
              { key: 'a', header: '', className: 'text-right', cell: (t) => (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => openBulk(t)}><Plus className="size-3.5" />Ô</Button>
                  <Button size="sm" variant="ghost" onClick={() => editType(t)} aria-label="Sửa"><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label={t.isActive ? 'Ẩn' : 'Hiện'} onClick={() => void run('updateUnitType', { unitTypeId: t._id, isActive: !t.isActive }, t.isActive ? 'Đã ẩn loại kho' : 'Đã hiện loại kho')}>
                    {t.isActive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Xoá" onClick={() => { if (window.confirm(`Xoá loại kho ${t.name}? Chỉ xoá được khi chưa có ô nào và chưa từng có đặt chỗ.`)) void run('deleteUnitType', { unitTypeId: t._id }, 'Đã xoá loại kho'); }}><Trash2 className="size-3.5 text-red-600" /></Button>
                </div>
              ) },
            ]} />
          </Card>

          <Card className="mt-6">
            <CardHeader title="Ô kho vật lý" description={`${units.length} ô${unitFilter === 'ALL' ? '' : ` thuộc ${typeName(db, unitFilter)}`} · chỉ sửa/xoá được ô đang Trống hoặc Bảo trì`}
              actions={
                <select className={cx(inputCls, 'w-auto min-w-44')} value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
                  <option value="ALL">Tất cả loại kho</option>
                  {types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              } />
            <Table rows={units} rowKey={(u) => u._id} empty={<EmptyState title="Chưa có ô kho" description="Thêm ô ở bảng loại kho phía trên (nút “Ô”)." />} columns={[
              { key: 'n', header: 'Mã ô', cell: (u) => <span className="font-semibold">{u.unitNumber}</span> },
              { key: 't', header: 'Loại kho', cell: (u) => typeName(db, u.unitTypeId) },
              { key: 'f', header: 'Tầng', className: 'tabular-nums', cell: (u) => (u.location.floor < 0 ? 'Hầm' : u.location.floor) },
              { key: 'z', header: 'Khu', cell: (u) => u.location.zone ?? '—' },
              { key: 'k', header: 'Khoá', cell: (u) => ACCESS_METHOD[u.accessMethod] },
              { key: 's', header: 'Trạng thái', cell: (u) => <StatusBadge map={UNIT_STATUS} value={u.status} /> },
              { key: 'a', header: '', className: 'text-right', cell: (u) => EDITABLE.includes(u.status) && !u.currentContractId && !u.currentReservationId && (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" aria-label="Sửa" onClick={() => setUnitForm({ unitId: u._id, unitNumber: u.unitNumber, floor: u.location.floor, zone: u.location.zone ?? '', accessMethod: u.accessMethod })}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Xoá" onClick={() => { if (window.confirm(`Xoá ô ${u.unitNumber}? Ô đã từng có đặt chỗ/hợp đồng sẽ không xoá được.`)) void run('deleteUnit', { unitId: u._id }, `Đã xoá ô ${u.unitNumber}`); }}><Trash2 className="size-3.5 text-red-600" /></Button>
                </div>
              ) },
            ]} />
          </Card>
        </>
      )}

      <Modal open={!!typeForm} onClose={() => setTypeForm(null)} size="lg" title={typeForm?._id ? 'Sửa loại kho' : 'Thêm loại kho'} description={facility ? `Chi nhánh ${facility.name}` : ''}
        footer={<Button disabled={!typeValid} onClick={saveType}>Lưu</Button>}>
        {typeForm && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px]">
              <Field label="Tên loại kho"><input className={inputCls} value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Phòng M" /></Field>
              <Field label="Mã" hint="Duy nhất trong chi nhánh"><input className={inputCls} value={typeForm.code} disabled={!!typeForm._id} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} placeholder="M-2x3" /></Field>
              <Field label="Nhóm cỡ">
                <select className={inputCls} value={typeForm.category} disabled={!!typeForm._id} onChange={(e) => setTypeForm({ ...typeForm, category: e.target.value as UnitCategory })}>
                  {enumValues(UnitCategory).map((c) => <option key={c} value={c}>{UNIT_CATEGORY[c]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Mô tả"><textarea className={inputCls} rows={2} value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Phù hợp đồ đạc căn hộ 1–2 phòng ngủ…" /></Field>
            <div className="grid gap-3 sm:grid-cols-4">
              {([['widthM', 'Rộng (m)'], ['depthM', 'Sâu (m)'], ['heightM', 'Cao (m)']] as const).map(([k, label]) => (
                <Field key={k} label={label}><input type="number" min={0.3} max={30} step={0.1} className={inputCls} value={typeForm[k]} onChange={(e) => setTypeForm({ ...typeForm, [k]: Number(e.target.value) })} /></Field>
              ))}
              <Field label="Diện tích"><p className="rounded-lg bg-stone-50 px-3 py-2 text-sm tabular-nums ring-1 ring-inset ring-stone-200">{area} m²</p></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PERIODS.map((p) => (
                <Field key={p} label={`Giá theo ${RENTAL_PERIOD[p].toLowerCase()} (₫)`}>
                  <input className={cx(inputCls, 'tabular-nums')} inputMode="numeric" value={new Intl.NumberFormat('vi-VN').format(typeForm.rates[p])}
                    onChange={(e) => setTypeForm({ ...typeForm, rates: { ...typeForm.rates, [p]: Number(e.target.value.replace(/\D/g, '')) || 0 } })} />
                </Field>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Thuê tối thiểu (số chu kỳ)"><input type="number" min={1} max={365} className={inputCls} value={typeForm.minPeriods} onChange={(e) => setTypeForm({ ...typeForm, minPeriods: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              <Field label="Tiền cọc cố định (₫)" hint="Để trống: tính theo chính sách chi nhánh"><input className={inputCls} inputMode="numeric" value={typeForm.depositOverride} onChange={(e) => setTypeForm({ ...typeForm, depositOverride: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={typeForm.indoor} onChange={(e) => setTypeForm({ ...typeForm, indoor: e.target.checked })} />Trong nhà (không phải kiểu drive-up ngoài trời)</label>
          </div>
        )}
      </Modal>

      <Modal open={!!bulk} onClose={() => setBulk(null)} size="lg" title="Thêm ô kho" description="Tạo một hoặc nhiều ô liền mã cùng loại, tầng, khu và hình thức khoá."
        footer={<Button disabled={!bulkValid} onClick={() => bulk && void run('addUnitsBulk', bulk, (n) => `Đã thêm ${n} ô kho`, () => setBulk(null))}>Tạo ô</Button>}>
        {bulk && (
          <div className="grid gap-4">
            <Field label="Loại kho">
              <select className={inputCls} value={bulk.unitTypeId} onChange={(e) => setBulk({ ...bulk, unitTypeId: e.target.value })}>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tiền tố mã" hint="VD M2-"><input className={inputCls} value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} placeholder="M2-" /></Field>
              <Field label="Bắt đầu từ số"><input type="number" min={0} className={inputCls} value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <Field label="Số lượng ô" hint="Tối đa 200"><input type="number" min={1} max={200} className={inputCls} value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            </div>
            {bulkValid && <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm ring-1 ring-inset ring-stone-200">Sẽ tạo: <b>{bulkName(bulk.start)}</b>{bulk.count > 1 && <> … <b>{bulkName(bulk.start + bulk.count - 1)}</b></>} ({bulk.count} ô)</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tầng" hint="Âm = tầng hầm"><input type="number" className={inputCls} value={bulk.floor} onChange={(e) => setBulk({ ...bulk, floor: Number(e.target.value) })} /></Field>
              <Field label="Khu"><input className={inputCls} value={bulk.zone} onChange={(e) => setBulk({ ...bulk, zone: e.target.value })} placeholder="Khu A" /></Field>
              <Field label="Hình thức khoá">
                <select className={inputCls} value={bulk.accessMethod} onChange={(e) => setBulk({ ...bulk, accessMethod: e.target.value as AccessMethod })}>
                  {enumValues(AccessMethod).map((m) => <option key={m} value={m}>{ACCESS_METHOD[m]}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!unitForm} onClose={() => setUnitForm(null)} title="Sửa ô kho"
        footer={<Button disabled={!unitForm?.unitNumber.trim()} onClick={() => unitForm && void run('updateUnit', unitForm, 'Đã cập nhật ô kho', () => setUnitForm(null))}>Lưu</Button>}>
        {unitForm && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã ô"><input className={inputCls} value={unitForm.unitNumber} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} /></Field>
              <Field label="Tầng"><input type="number" className={inputCls} value={unitForm.floor} onChange={(e) => setUnitForm({ ...unitForm, floor: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Khu"><input className={inputCls} value={unitForm.zone} onChange={(e) => setUnitForm({ ...unitForm, zone: e.target.value })} /></Field>
            <Field label="Hình thức khoá">
              <select className={inputCls} value={unitForm.accessMethod} onChange={(e) => setUnitForm({ ...unitForm, accessMethod: e.target.value as AccessMethod })}>
                {enumValues(AccessMethod).map((m) => <option key={m} value={m}>{ACCESS_METHOD[m]}</option>)}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function OpsInventory() {
  return <Suspense><InventoryInner /></Suspense>;
}
