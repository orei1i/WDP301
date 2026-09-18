'use client';

import { useState } from 'react';
import { useStore } from '@/shared/store/store';
import { UNIT_CATEGORY } from '@/shared/lib/labels';
import { unitRate } from '@/shared/lib/domain';
import { pct, vnd } from '@/shared/lib/format';
import { Button, Card, CardHeader, PageHeader, cx, inputCls } from '@/shared/ui';

export default function Pricing() {
  const { db, run, toast } = useStore();
  const facilities = db.facilities.filter((f) => !f.isDeleted && f.status !== 'INACTIVE');
  const codes = [...new Set(db.unitTypes.map((t) => t.code))];
  const [edits, setEdits] = useState<Record<string, string>>({});

  const occ = (utId: string) => {
    const us = db.units.filter((u) => u.unitTypeId === utId && u.status !== 'MAINTENANCE');
    return us.length ? us.filter((u) => u.status === 'OCCUPIED' || u.status === 'PENDING_INSPECTION').length / us.length : null;
  };
  const save = async () => {
    let n = 0;
    for (const [id, v] of Object.entries(edits)) {
      const res = await run('setBasePrice', { unitTypeId: id, rate: Math.round(Number(v.replace(/\D/g, ''))) });
      if (res.ok) n++;
    }
    setEdits({});
    if (n) toast(`Đã cập nhật ${n} mức giá — áp dụng cho báo giá mới`, 'success');
  };

  return (
    <>
      <PageHeader title="Bảng giá" description="Giá cơ sở / tháng theo loại kho và chi nhánh. Hợp đồng đang chạy giữ nguyên giá đã ký." actions={<Button disabled={!Object.keys(edits).length} onClick={() => void save()}>Lưu {Object.keys(edits).length || ''} thay đổi</Button>} />
      <Card>
        <CardHeader title="Giá cơ sở (hạng Tiêu chuẩn)" description="Màu nền theo tỷ lệ lấp đầy: đỏ ≥ 90% (cân nhắc tăng giá), xanh < 60% (cân nhắc khuyến mãi)" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-2.5 font-medium">Loại kho</th>
                {facilities.map((f) => <th key={f._id} className="px-4 py-2.5 font-medium">{f.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {codes.map((code) => {
                const sample = db.unitTypes.find((t) => t.code === code)!;
                return (
                  <tr key={code}>
                    <td className="px-4 py-3"><p className="font-medium">{sample.name}</p><p className="text-xs text-stone-500">{UNIT_CATEGORY[sample.category]} · {sample.areaM2} m²</p></td>
                    {facilities.map((f) => {
                      const ut = db.unitTypes.find((t) => t.facilityId === f._id && t.code === code);
                      if (!ut) return <td key={f._id} className="px-4 py-3 text-stone-400">—</td>;
                      const o = occ(ut._id);
                      return (
                        <td key={f._id} className={cx('px-4 py-3', o !== null && o >= 0.9 && 'bg-red-50', o !== null && o < 0.6 && 'bg-emerald-50')}>
                          <input className={cx(inputCls, 'w-36 tabular-nums', edits[ut._id] !== undefined && 'ring-2 ring-amber-400')} value={edits[ut._id] ?? new Intl.NumberFormat('vi-VN').format(ut.pricing.baseMonthlyRate)} onChange={(e) => setEdits({ ...edits, [ut._id]: e.target.value })} />
                          <p className="mt-1 text-[11px] text-stone-500">{o === null ? 'Chưa có kho' : `Lấp đầy ${pct(o)}`} · Premium {vnd(unitRate(ut, { priceTier: 'PREMIUM', monthlyRateOverride: null }))}</p>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
