'use client';

import { Lock } from 'lucide-react';
import type { UnitStatus } from '@ssm/shared';
import { UNIT_STATUS } from '@/shared/lib/labels';
import { cx } from '@/shared/ui';

export interface FloorPlanUnit {
  _id: string;
  unitNumber: string;
  location: { floor: number; zone?: string };
  status: UnitStatus;
  overlockActive?: boolean;
}

const CELL: Record<UnitStatus, string> = {
  AVAILABLE: 'bg-emerald-50 ring-emerald-300 text-emerald-900 hover:bg-emerald-100 cursor-pointer',
  RESERVED: 'bg-sky-50 ring-sky-200 text-sky-700 cursor-not-allowed opacity-60',
  OCCUPIED: 'bg-stone-100 ring-stone-200 text-stone-500 cursor-not-allowed opacity-60',
  MAINTENANCE: 'bg-amber-50 ring-amber-200 text-amber-700 cursor-not-allowed opacity-60',
  PENDING_INSPECTION: 'bg-violet-50 ring-violet-200 text-violet-700 cursor-not-allowed opacity-60',
};

/**
 * Sơ đồ 2D cơ bản: gom theo tầng, mỗi ô kho là một nút bấm — chỉ ô còn trống mới chọn được.
 * Dùng chung cho khách chọn ô lúc đặt kho và lúc gửi yêu cầu đổi ô (chỉ khác nguồn `items`).
 */
export function FloorPlanPicker({ items, value, onChange }: { items: FloorPlanUnit[]; value: string | null; onChange: (unitId: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-stone-500">Chưa có ô kho nào thuộc loại này.</p>;
  const floors = [...new Set(items.map((u) => u.location.floor))].sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      {floors.map((fl) => (
        <div key={fl}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">{fl < 0 ? 'Tầng hầm' : `Tầng ${fl}`}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
            {items.filter((u) => u.location.floor === fl).sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)).map((u) => {
              const selected = u._id === value;
              const pickable = u.status === 'AVAILABLE';
              return (
                <button key={u._id} type="button" disabled={!pickable} onClick={() => onChange(u._id)}
                  className={cx('relative rounded-lg px-2 py-2 text-left ring-1 ring-inset transition-colors', CELL[u.status], selected && 'ring-2 ring-brand-600 bg-brand-50')}>
                  <p className="text-sm font-semibold">{u.unitNumber}</p>
                  <p className="truncate text-[10px] opacity-75">{pickable ? 'Còn trống' : UNIT_STATUS[u.status].label}</p>
                  {u.overlockActive && <Lock className="absolute right-1 top-1 size-3 text-red-600" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
