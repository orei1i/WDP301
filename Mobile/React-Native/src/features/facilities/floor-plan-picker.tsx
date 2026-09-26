import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UnitStatus } from '@ssm/shared';
import { UNIT_STATUS } from '@ssm/shared';
import { C, R, S } from '../../shared/ui/theme';

export interface FloorPlanUnit { _id: string; unitNumber: string; location: { floor: number; zone?: string }; status: UnitStatus }

const CELL: Record<UnitStatus, { bg: string; border: string; text: string }> = {
  AVAILABLE: { bg: C.greenBg, border: '#a7f3d0', text: C.green },
  RESERVED: { bg: C.blueBg, border: '#bae6fd', text: C.blue },
  OCCUPIED: { bg: C.fill, border: C.line, text: C.muted },
  MAINTENANCE: { bg: C.amberBg, border: '#fde68a', text: C.amber },
  PENDING_INSPECTION: { bg: C.violetBg, border: '#ddd6fe', text: C.violet },
};

/**
 * Sơ đồ 2D cơ bản: gom theo tầng, mỗi ô kho là một nút bấm — chỉ ô còn trống mới chọn được.
 * Cùng thiết kế với Webapp/src/features/facilities/floor-plan-picker.tsx, viết cho React Native.
 */
export function FloorPlanPicker({ items, value, onChange }: { items: FloorPlanUnit[]; value: string | null; onChange: (unitId: string) => void }) {
  if (items.length === 0) return <Text style={st.empty}>Chưa có ô kho nào thuộc loại này.</Text>;
  const floors = [...new Set(items.map((u) => u.location.floor))].sort((a, b) => b - a);
  return (
    <View style={{ gap: S.md }}>
      {floors.map((fl) => (
        <View key={fl}>
          <Text style={st.floorLabel}>{fl < 0 ? 'Tầng hầm' : `Tầng ${fl}`}</Text>
          <View style={st.grid}>
            {items.filter((u) => u.location.floor === fl).sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)).map((u) => {
              const pickable = u.status === 'AVAILABLE';
              const selected = u._id === value;
              const c = CELL[u.status];
              return (
                <Pressable key={u._id} disabled={!pickable} onPress={() => onChange(u._id)}
                  style={[st.cell, { backgroundColor: c.bg, borderColor: selected ? C.brand600 : c.border, borderWidth: selected ? 2 : 1 }]}>
                  <Text style={[st.cellNumber, { color: c.text }]}>{u.unitNumber}</Text>
                  <Text style={[st.cellStatus, { color: c.text }]}>{pickable ? 'Còn trống' : UNIT_STATUS[u.status].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  empty: { fontSize: 13, color: C.muted },
  floorLabel: { fontSize: 11, fontWeight: '700', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: S.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  cell: { width: 84, borderRadius: R.md, paddingVertical: S.sm, paddingHorizontal: S.sm },
  cellNumber: { fontSize: 13, fontWeight: '700' },
  cellStatus: { fontSize: 10, marginTop: 2 },
});
