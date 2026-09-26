'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Camera, Clock, KeyRound, MapPin, Phone, ShoppingCart, Thermometer, Trash2 } from 'lucide-react';
import type { BusinessPolicy, CheckInShift, Facility, PriceQuote, RentalPeriod, UnitType } from '@ssm/shared';
import { periodLabel, STAFF_SHIFTS } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { api } from '@/shared/api/client';
import { ACCESS_METHOD, CHECK_IN_SHIFT, PERIOD_UNIT, RENTAL_PERIOD, UNIT_CATEGORY } from '@/shared/lib/labels';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/features/legal/legal-content';
import { addDays, fmtDate, todayISO, vnd } from '@/shared/lib/format';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, cx, inputCls } from '@/shared/ui';
import { FloorPlanPicker, type FloorPlanUnit } from '@/features/facilities/floor-plan-picker';

type TypeRow = UnitType & { quote: PriceQuote; availability: { total: number; free: number; available: number } };
interface Detail {
  facility: Facility;
  unitTypes: TypeRow[];
  policy: Pick<BusinessPolicy, 'version' | 'scope' | 'reservationHoldMinutes' | 'cancellation' | 'minPeriods' | 'maxPeriods'>;
}
/** Một dòng trong giỏ — đã chốt ô cụ thể và báo giá tại thời điểm thêm vào giỏ. */
interface CartLine { key: string; typeId: string; typeName: string; unitId: string; unitNumber: string; quote: PriceQuote }

const PERIODS: RentalPeriod[] = ['DAY', 'WEEK', 'MONTH'];
/** Ca giờ nhận kho — chọn ngay lúc đặt, cộng thêm "Chưa rõ giờ" cho khách chưa chắc lịch. */
const CHECK_IN_SHIFTS: { value: CheckInShift; label: string }[] = [...STAFF_SHIFTS, 'UNKNOWN' as const].map((s) => ({ value: s, label: CHECK_IN_SHIFT[s].label }));
const AC_FILTERS: { value: 'ALL' | 'NO' | 'YES'; label: string }[] = [{ value: 'ALL', label: 'Tất cả' }, { value: 'NO', label: 'Không điều hòa' }, { value: 'YES', label: 'Có điều hòa' }];

export default function FacilityDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, run, toast } = useStore();
  const router = useRouter();
  const [start, setStart] = useState(todayISO().slice(0, 10));
  const [period, setPeriod] = useState<RentalPeriod>('MONTH');
  const [periods, setPeriods] = useState(3);
  const [checkInShift, setCheckInShift] = useState<CheckInShift>('UNKNOWN');
  const [acFilter, setAcFilter] = useState<'ALL' | 'NO' | 'YES'>('ALL');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState('');
  const [floorPlan, setFloorPlan] = useState<FloorPlanUnit[] | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  // Khách tự chọn chu kỳ (ngày/tuần/tháng) + số chu kỳ — server tính lại giá theo đúng combo này.
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/facilities/public/${id}?period=${period}&periods=${periods}`)
      .then((d) => { if (!alive) return; setDetail(d); setError(''); setTypeId((cur) => cur || d.unitTypes.find((t) => t.availability.available > 0)?._id || ''); })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, period, periods]);

  // Sơ đồ 2D cơ bản của loại kho đang chọn — bắt buộc chọn đúng một ô trống trước khi thêm vào giỏ.
  useEffect(() => {
    if (!typeId) { setFloorPlan(null); return; }
    let alive = true;
    setUnitId(null);
    api.get<{ items: FloorPlanUnit[] }>(`/facilities/public/${id}/unit-types/${typeId}/floor-plan`)
      .then((d) => alive && setFloorPlan(d.items))
      .catch(() => alive && setFloorPlan([]));
    return () => { alive = false; };
  }, [id, typeId]);

  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.quote.depositAmount, 0), [cart]);

  if (error) return <main className="mx-auto max-w-7xl p-8"><EmptyState title="Không tải được chi nhánh" description={error} action={<ButtonLink href="/facilities">Quay lại</ButtonLink>} /></main>;
  if (!detail) return <main className="mx-auto max-w-7xl p-16 text-center text-sm text-stone-500">Đang tải…</main>;

  const { facility: f, unitTypes: types, policy } = detail;
  // Có/không điều hòa là một biến thể loại kho riêng (giá gốc bằng nhau, biến thể có điều hòa cộng
  // thêm phụ phí điều hòa của chính sách giá) — bộ lọc này chỉ để khách dễ so sánh trong danh sách.
  const visibleTypes = types.filter((t) => acFilter === 'ALL' || (acFilter === 'YES') === t.features.climateControlled);
  const ut = types.find((t) => t._id === typeId);
  const q = ut?.quote;
  const discountPct = q && q.discountAmount ? Math.round((q.discountAmount / (q.rate + q.surchargeAmount)) * 100) : 0;
  const bookable = f.status === 'ACTIVE';
  const alreadyInCart = cart.some((l) => l.unitId === unitId);

  const addToCart = () => {
    if (!ut || !q || !unitId) return;
    const unit = floorPlan?.find((u) => u._id === unitId);
    setCart((c) => [...c, { key: `${unitId}-${c.length}`, typeId: ut._id, typeName: ut.name, unitId, unitNumber: unit?.unitNumber ?? '', quote: q }]);
    setUnitId(null);
    toast('Đã thêm vào giỏ — chọn tiếp ô khác hoặc giữ chỗ toàn bộ giỏ', 'info');
  };
  const removeFromCart = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  const book = async () => {
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/facilities/${f._id}`)}`); return; }
    if (user.role !== 'CUSTOMER') { toast('Đặt chỗ dành cho tài khoản khách hàng', 'error'); return; }
    if (cart.length === 0) return;
    const consent = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
    const startDate = `${start}T00:00:00.000Z`;
    if (cart.length === 1) {
      const line = cart[0];
      const res = await run('createReservation', { unitTypeId: line.typeId, unitId: line.unitId, startDate, rentalPeriod: period, periods, preferredCheckInShift: checkInShift, source: 'WEB', consent }, 'Đã giữ chỗ — vui lòng thanh toán tiền cọc');
      if (res.ok) router.push(`/booking/${res.value._id}`);
      return;
    }
    const res = await run('createReservationsBatch', {
      items: cart.map((l) => ({ unitTypeId: l.typeId, unitId: l.unitId, startDate, rentalPeriod: period, periods, preferredCheckInShift: checkInShift })), consent,
    }, (items) => `Đã giữ chỗ ${items.length} kho — thanh toán cọc từng kho trong mục Đặt chỗ của tôi`);
    if (res.ok) router.push('/portal/reservations');
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

      <Card className="mt-6 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ngày bắt đầu">
            <input type="date" className={inputCls} min={todayISO().slice(0, 10)} max={addDays(todayISO(), 60).slice(0, 10)} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Chu kỳ thuê">
            <div className="grid grid-cols-3 gap-2">
              {PERIODS.map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} className={cx('rounded-lg py-2 text-sm font-medium ring-1 ring-inset', period === p ? 'bg-ink text-white ring-ink' : 'ring-stone-300 hover:bg-stone-50')}>{RENTAL_PERIOD[p]}</button>
              ))}
            </div>
          </Field>
          <Field label="Số chu kỳ">
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button key={m} type="button" onClick={() => setPeriods(m)} className={cx('rounded-lg py-2 text-sm font-medium ring-1 ring-inset', periods === m ? 'bg-ink text-white ring-ink' : 'ring-stone-300 hover:bg-stone-50')}>{periodLabel(period, m)}</button>
              ))}
            </div>
            {/* Tự nhập ngày/tháng tuỳ ý thay vì chỉ chọn trong 4 mốc dựng sẵn. */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number" min={1} max={365} value={periods}
                onChange={(e) => setPeriods(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className={cx(inputCls, 'w-24')}
              />
              <span className="text-xs text-stone-500">{PERIOD_UNIT[period]} — tự nhập số bất kỳ</span>
            </div>
          </Field>
        </div>
        <div className="mt-4 border-t border-dashed border-stone-200 pt-4">
          <Field label="Ca giờ dự kiến đến nhận kho" hint="Giúp chi nhánh xếp đúng nhân viên trực ca đón bạn — chọn 'Chưa rõ giờ' nếu chưa chắc lịch.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CHECK_IN_SHIFTS.map((s) => (
                <button key={s.value} type="button" onClick={() => setCheckInShift(s.value)} className={cx('rounded-lg py-2 text-xs font-medium ring-1 ring-inset', checkInShift === s.value ? 'bg-ink text-white ring-ink' : 'ring-stone-300 hover:bg-stone-50')}>{s.label}</button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Loại kho" description={`Giá tính theo ${periodLabel(period, periods)}, bắt đầu ${fmtDate(`${start}T00:00:00.000Z`)}`} />
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              {AC_FILTERS.map((o) => (
                <button key={o.value} type="button" onClick={() => setAcFilter(o.value)} className={cx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', acFilter === o.value ? 'bg-brand-600 text-white ring-brand-600' : 'ring-stone-300 text-stone-600 hover:bg-stone-50')}>{o.label}</button>
              ))}
            </div>
            <ul className="divide-y divide-stone-100">
              {visibleTypes.length === 0 && <li className="px-5 py-6 text-sm text-stone-500">Không có loại kho phù hợp bộ lọc.</li>}
              {visibleTypes.map((t) => {
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
                          <Badge tone="violet"><KeyRound className="size-3" />{ACCESS_METHOD[t.accessMethod]}</Badge>
                          {t.minPeriods > 1 && <Badge tone="gray">Tối thiểu {periodLabel(period, t.minPeriods)}</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{vnd(t.quote.firstPeriodRent)}<span className="text-xs font-normal text-stone-500">/{PERIOD_UNIT[period]}</span></p>
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

          {ut && (
            <Card className="p-5">
              <CardHeader title={`Chọn ô kho — ${ut.name}`} description="Bắt buộc chọn đúng một ô còn trống trên sơ đồ" />
              <div className="mt-4">
                {floorPlan === null ? <p className="text-sm text-stone-500">Đang tải sơ đồ…</p> : <FloorPlanPicker items={floorPlan} value={unitId} onChange={setUnitId} />}
              </div>
              <Button className="mt-4" disabled={!unitId || alreadyInCart} onClick={addToCart}>
                <ShoppingCart className="size-4" />{alreadyInCart ? 'Ô này đã có trong giỏ' : 'Thêm vào giỏ'}
              </Button>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-4" />Giỏ đặt kho {cart.length > 0 && `(${cart.length})`}</h2>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">Chọn loại kho rồi chọn một ô trên sơ đồ để thêm vào giỏ. Có thể thêm nhiều kho khác loại trong cùng một lượt đặt.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.typeName} · ô {l.unitNumber}</p>
                      <p className="text-xs text-stone-500">Cọc {vnd(l.quote.depositAmount)}</p>
                    </div>
                    <button type="button" aria-label="Bỏ khỏi giỏ" onClick={() => removeFromCart(l.key)} className="grid size-7 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-200 hover:text-red-600"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            {cart.length > 0 && (
              <div className="mt-3 flex justify-between rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-900"><span>Tổng tiền cọc</span><span className="tabular-nums">{vnd(cartTotal)}</span></div>
            )}

            <div className="mt-5 space-y-2.5 border-t border-dashed border-stone-200 pt-4">
              <label className="flex cursor-pointer gap-2.5 text-xs leading-relaxed text-stone-700">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                <span>Tôi đã đọc và đồng ý với <Link href="/dieu-khoan" target="_blank" className="font-medium text-brand-700 hover:underline">Điều khoản thuê kho (v{TERMS_VERSION})</Link></span>
              </label>
              <label className="flex cursor-pointer gap-2.5 text-xs leading-relaxed text-stone-700">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
                <span>Tôi đồng ý cho KhoAn xử lý dữ liệu cá nhân theo <Link href="/bao-mat" target="_blank" className="font-medium text-brand-700 hover:underline">Chính sách bảo mật (v{PRIVACY_VERSION})</Link></span>
              </label>
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={() => void book()} disabled={cart.length === 0 || !bookable || !agreeTerms || !agreePrivacy}>
              {bookable ? `Giữ chỗ & đặt cọc${cart.length > 1 ? ` (${cart.length} kho)` : ''}` : 'Chi nhánh chưa nhận đặt chỗ'}
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              Giữ chỗ {policy.reservationHoldMinutes} phút để thanh toán cọc. Hủy trước {policy.cancellation[0]?.minHoursBeforeStart} giờ được hoàn {policy.cancellation[0]?.depositRefundPct}% cọc,
              trước {policy.cancellation[1]?.minHoursBeforeStart} giờ hoàn {policy.cancellation[1]?.depositRefundPct}%. Tiền thuê kỳ đầu thanh toán khi nhận kho.
            </p>
          </Card>
          {q && ut && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Báo giá {ut.name}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-stone-500">{ut.name} / {PERIOD_UNIT[period]}</dt><dd className="tabular-nums">{vnd(q.rate)}</dd></div>
                {q.surchargeAmount > 0 && <div className="flex justify-between"><dt className="text-stone-500">Phụ phí điều hòa</dt><dd className="tabular-nums">+{vnd(q.surchargeAmount)}</dd></div>}
                {q.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><dt>Ưu đãi thuê {periodLabel(period, periods)} (−{discountPct}%)</dt><dd className="tabular-nums">−{vnd(q.discountAmount)}</dd></div>}
                <div className="flex justify-between font-medium"><dt>Tiền thuê mỗi {PERIOD_UNIT[period]}</dt><dd className="tabular-nums">{vnd(q.firstPeriodRent)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Tổng {periodLabel(period, periods)}</dt><dd className="tabular-nums">{vnd(q.firstPeriodRent * periods)}</dd></div>
                <div className="mt-1 flex justify-between rounded-lg bg-brand-50 px-3 py-2.5 font-semibold text-brand-900"><dt>Đặt cọc</dt><dd className="tabular-nums">{vnd(q.depositAmount)}</dd></div>
              </dl>
            </Card>
          )}
          <p className="flex items-center gap-1.5 px-1 text-xs text-stone-500"><Camera className="size-3.5" />Chính sách áp dụng: phiên bản v{policy.version} ({policy.scope === 'FACILITY' ? 'riêng chi nhánh' : 'toàn chuỗi'})</p>
        </div>
      </div>
    </main>
  );
}
