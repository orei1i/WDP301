'use client';

import { useStore } from '@/lib/store';
import { facilityStats } from '@/lib/domain';
import { pct } from '@/lib/format';
import { Card, PageHeader } from '@/components/ui';
import { FacilityPicker, useFacilityScope } from '@/components/facility-picker';
import { UnitMap } from '@/components/unit-map';

export default function StaffUnits() {
  const { db } = useStore();
  const scope = useFacilityScope();
  const s = facilityStats(db, scope.facilityId);
  return (
    <>
      <PageHeader title="Sơ đồ kho" description={`Lấp đầy ${pct(s.occupancy)} · ${s.available} kho trống · ${s.maintenance} đang bảo trì`} actions={<FacilityPicker scope={scope} />} />
      <Card className="p-5"><UnitMap facilityId={scope.facilityId} /></Card>
    </>
  );
}
