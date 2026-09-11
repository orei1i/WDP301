'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera, Car, Clock, MapPin, Phone, Thermometer, Truck, Zap } from 'lucide-react';
import type { BusinessPolicy, Facility, PriceQuote, UnitType } from '@ssm/shared';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { UNIT_CATEGORY } from '@/lib/labels';
import { addDays, fmtDate, todayISO, vnd } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, cx, inputCls } from '@/components/ui';

type TypeRow = UnitType & { quote: PriceQuote; availability: { total: number; free: number; holds: number; available: number } };
interface Detail {
  facility: Facility;
  unitTypes: TypeRow[];
  policy: Pick<BusinessPolicy, 'version' | 'scope' | 'reservationHoldMinutes' | 'cancellation' | 'minRentalMonths' | 'maxRentalMonths'>;
}

export default function FacilityDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, run, toast } = useStore();
  const router = useRouter();
  const [start, setStart] = useState(todayISO().slice(0, 10));
  const [months, setMonths] = useState(3);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState('');

  // Server computes availability for the chosen window and the quote with the current policy
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/facilities/public/${id}?start=${start}&months=${months}`)
      .then((d) => { if (!alive) return; setDetail(d); setError(''); setTypeId((cur) => cur || d.unitTypes.find((t) => t.availability.available > 0)?._id || ''); })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, start, months]);

  if (error) return <main className="mx-auto max-w-7xl p-8"><EmptyState title="Không tải được chi nhánh" description={error} action={<ButtonLink href="/facilities">Quay lại</ButtonLink>} /></main>;
  if (!detail) return <main className="mx-auto max-w-7xl p-16 text-center text-sm text-stone-500">Đang tải…</main>;

  const { facility: f, unitTypes: types, policy } = detail;
  const ut = types.find((t) => t._id === typeId);
  const q = ut?.quote;
  const discountPct = q && q.discountAmount ? Math.round((q.discountAmount / (q.monthlyRate + q.surchargeAmount)) * 100) : 0;
  const bookable = f.status === 'ACTIVE';

  const book = async () => {
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/facilities/${f._id}`)}`); return; }
    if (user.role !== 'CUSTOMER') { toast('Đặt chỗ dành cho tài khoản khách hàng', 'error'); return; }
    const res = await run('createReservation', { unitTypeId: typeId, startDate: `${start}T00:00:00.000Z`, months, source: 'WEB' }, 'Đã giữ chỗ — vui lòng thanh toán tiền cọc');
    if (res.ok) router.push(`/booking/${res.value._id}`);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{f.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-500">
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{f.address.line1}, {f.address.district}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />Ra vào {f.accessHours?.open ?? '06:00'}–{f.accessHours?.close ?? '22:00'}</span>
            <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{f.contact.phone}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{f.amenities.map((a) => <Badge key={a}>{a}</Badge>)}</div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Loại kho & chỗ trống" description={`Tính cho ngày ${fmtDate(`${start}T00:00:00.000Z`)}, thuê ${months} tháng`} />
          <ul className="divide-y divide-stone-100">
            {types.map((t) => {
              const a = t.availability;
              const selected = t._id === typeId;
              return (
                <li key={t._id}>
                  <button type="button" disabled={a.available === 0} onClick={() => setTypeId(t._id)} className={cx('flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', selected ? 'bg-brand-50' : 'hover:bg-stone-50')}>
                    <span className={cx('grid size-5 place-items-center rounded-full border-2', selected ? 'border-brand-600' : 'border-stone-300')}>{selected && <span className="size-2.5 rounded-full bg-brand-600" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.name} <span className="font-normal text-stone-500">· {t.dimensions.widthM}×{t.dimensions.depthM}×{t.dimensions.heightM} m ({t.areaM2} m²)</span></p>
                      <p className="mt-0.5 text-sm text-stone-500">{t.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>{UNIT_CATEGORY[t.category]}</Badge>
                        {t.features.climateControlled && <Badge tone="blue"><Thermometer className="size-3" />Điều hòa</Badge>}
                        {t.features.driveUp && <Badge tone="violet"><Truck className="size-3" />Drive-up</Badge>}
                        {t.features.powerOutlet && <Badge tone="amber"><Zap className="size-3" />Ổ điện</Badge>}
                        {t.category === 'VEHICLE' && <Badge><Car className="size-3" />Tầng hầm</Badge>}
                        {t.minRentalMonths > 1 && <Badge tone="gray">Tối thiểu {t.minRentalMonths} tháng</Badge>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{vnd(t.quote.firstPeriodRent)}<span className="text-xs font-normal text-stone-500">/tháng</span></p>
                      <p className={cx('mt-1 text-xs font-medium', a.available === 0 ? 'text-red-600' : a.available <= 2 ? 'text-amber-700' : 'text-emerald-700')}>
                        {a.available === 0 ? 'Hết chỗ' : `Còn ${a.available}/${a.total} kho`}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="font-semibold">Đặt chỗ</h2>
            <div className="mt-4 grid gap-4">
              <Field label="Ngày bắt đầu">
                <input type="date" className={inputCls} min={todayISO().slice(0, 10)} max={addDays(todayISO(), 60).slice(0, 10)} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Thời hạn thuê">
                <div className="grid grid-cols-4 gap-2">
                  {[1, 3, 6, 12].map((m) => (
                    <button key={m} type="button" onClick={() => setMonths(m)} className={cx('rounded-lg py-2 text-sm font-medium ring-1 ring-inset', months === m ? 'bg-ink text-white ring-ink' : 'ring-stone-300 hover:bg-stone-50')}>{m} th</button>
                  ))}
                </div>
              </Field>
            </div>
            {q && ut && (
              <dl className="mt-5 space-y-2 border-t border-dashed border-stone-200 pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-stone-500">{ut.name} / tháng</dt><dd className="tabular-nums">{vnd(q.monthlyRate)}</dd></div>
                {q.surchargeAmount > 0 && <div className="flex justify-between"><dt className="text-stone-500">Phụ phí điều hòa</dt><dd className="tabular-nums">+{vnd(q.surchargeAmount)}</dd></div>}
                {q.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><dt>Ưu đãi thuê {months} tháng (−{discountPct}%)</dt><dd className="tabular-nums">−{vnd(q.discountAmount)}</dd></div>}
                <div className="flex justify-between font-medium"><dt>Tiền thuê mỗi tháng</dt><dd className="tabular-nums">{vnd(q.firstPeriodRent)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Tổng {months} tháng</dt><dd className="tabular-nums">{vnd(q.firstPeriodRent * months)}</dd></div>
                <div className="mt-3 flex justify-between rounded-lg bg-brand-50 px-3 py-2.5 font-semibold text-brand-900"><dt>Đặt cọc ngay</dt><dd className="tabular-nums">{vnd(q.depositAmount)}</dd></div>
              </dl>
            )}
            <Button size="lg" className="mt-4 w-full" onClick={() => void book()} disabled={!ut || !bookable || (ut?.availability.available ?? 0) === 0}>
              {bookable ? 'Giữ chỗ & đặt cọc' : 'Chi nhánh chưa nhận đặt chỗ'}
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              Giữ chỗ {policy.reservationHoldMinutes} phút để thanh toán cọc. Hủy trước {policy.cancellation[0]?.minHoursBeforeStart} giờ được hoàn {policy.cancellation[0]?.depositRefundPct}% cọc,
              trước {policy.cancellation[1]?.minHoursBeforeStart} giờ hoàn {policy.cancellation[1]?.depositRefundPct}%. Tiền thuê tháng đầu thanh toán khi nhận kho.
            </p>
          </Card>
          <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-stone-500"><Camera className="size-3.5" />Chính sách áp dụng: phiên bản v{policy.version} ({policy.scope === 'FACILITY' ? 'riêng chi nhánh' : 'toàn chuỗi'})</p>
        </div>
      </div>
    </main>
  );
}
