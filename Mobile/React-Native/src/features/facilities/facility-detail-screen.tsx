import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { AccessMethod, BusinessPolicy, CheckInShift, Facility, PriceQuote, RentalPeriod, UnitType } from '@ssm/shared';
import {
  ACCESS_METHOD, AccessMethod as ACCESS_METHOD_ENUM, buildPaymentSchedule, CHECK_IN_SHIFT, dueAtBooking, dueAtCheckIn, enumValues, paymentAckText, PERIOD_UNIT,
  PRIVACY_VERSION, STAFF_SHIFTS, surchargeLines, TERMS_EFFECTIVE, TERMS_VERSION, UNIT_CATEGORY, addDays, periodLabel, todayISO, vnd,
} from '@ssm/shared';
import { api } from '../../shared/api/client';
import { useStore } from '../../shared/store/store';
import { Badge, Button, Card, Chips, DateStepper, EmptyState, Input, KV, Muted, Screen, ScreenHeader, Skeleton } from '../../shared/ui';
import { C, S } from '../../shared/ui/theme';
import { FloorPlanPicker, type FloorPlanUnit } from './floor-plan-picker';
import { DurationPicker } from './duration-picker';
import { PaymentSchedule } from '../payments/payment-schedule';

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://wdp-301-webapp.vercel.app';

// acEligible: loại kho này có tuỳ chọn điều hòa (add-on) hay không, theo policy.surcharges[CLIMATE].
type TypeRow = UnitType & { quote: PriceQuote; acEligible: boolean; availability: { total: number; free: number; available: number } };
interface Detail {
  facility: Facility;
  unitTypes: TypeRow[];
  services: { _id: string; code: string; name: string; description?: string; price: number; unitLabel: string }[];
  policy: Pick<BusinessPolicy, 'version' | 'scope' | 'reservationHoldMinutes' | 'cancellation' | 'minPeriods' | 'maxPeriods' | 'discounts' | 'gracePeriodDays'> & Partial<Pick<BusinessPolicy, 'surcharges'>>;
}
/** Một ô khách đã bấm chọn trên sơ đồ. Báo giá luôn lấy theo thời hạn/điều hòa đang chọn, không lưu cứng ở đây. */
interface PickedUnit { unitId: string; unitNumber: string; typeId: string; typeName: string }
/** Đặt tối đa bấy nhiêu kho trong một lượt (khớp giới hạn của API /reservations/batch). */
const MAX_UNITS = 10;

// Nhãn ngắn trên chip ("Ca 1"), thời gian đầy đủ chỉ hiện ở dòng chú thích bên dưới khi đã chọn — đỡ rối mắt.
const CHECK_IN_SHIFTS: { value: CheckInShift; label: string }[] = [...STAFF_SHIFTS, 'UNKNOWN' as const]
  .map((s) => ({ value: s, label: s === 'UNKNOWN' ? 'Chưa rõ' : `Ca ${s.slice(-1)}` }));
/** Hình thức khoá — thuộc tính của TỪNG Ô (không phải loại kho); 'ALL' = không lọc. */
const LOCK_OPTIONS: { value: AccessMethod | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  ...enumValues(ACCESS_METHOD_ENUM).map((v) => ({ value: v, label: ACCESS_METHOD[v] })),
];

/** Bảng tóm tắt giá — tách hàm để không phải nhồi logic điều kiện vào JSX. */
function priceItems(q: PriceQuote, typeName: string, periods: number, surcharges: Detail['policy']['surcharges']): [string, ReactNode][] {
  const unit = PERIOD_UNIT[q.rentalPeriod];
  const items: [string, ReactNode][] = [[`${typeName} / ${unit}`, vnd(q.rate)]];
  // Phụ phí phải nói rõ là phụ phí gì và tính thế nào — không ghi trơ trọi "Phụ phí".
  for (const s of surchargeLines(q, surcharges)) items.push([`${s.label}${s.basis ? ` (${s.basis})` : ''}`, `+${vnd(s.amount)}`]);
  if (q.discountAmount > 0) items.push([`Ưu đãi thuê ${periodLabel(q.rentalPeriod, periods)}`, `-${vnd(q.discountAmount)}`]);
  items.push([`Tiền thuê mỗi ${unit}`, vnd(q.firstPeriodRent)]);
  items.push([`Tổng giá trị ${periodLabel(q.rentalPeriod, periods)} (trả từng ${unit})`, vnd(q.firstPeriodRent * periods)]);
  return items;
}

export default function FacilityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { run } = useStore();
  const router = useRouter();
  const [start, setStart] = useState(todayISO());
  const [period, setPeriod] = useState<RentalPeriod>('MONTH');
  const [periods, setPeriods] = useState('3');
  const [checkInShift, setCheckInShift] = useState<CheckInShift>('UNKNOWN');
  // Điều hòa là ADD-ON khách tự bật khi đặt — không gắn với ô cụ thể nào, mọi ô của loại kho hợp lệ
  // đều dùng chung một giá. Hình thức khoá vẫn là thuộc tính của TỪNG Ô — lọc ngay trên sơ đồ.
  const [useAirConditioning, setUseAirConditioning] = useState(false);
  const [lockFilter, setLockFilter] = useState<AccessMethod | 'ALL'>('ALL');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState('');
  const [floorPlan, setFloorPlan] = useState<FloorPlanUnit[] | null>(null);
  // Chọn NHIỀU ô ngay trên sơ đồ: bấm một ô để chọn, bấm lại để bỏ. Đổi loại kho thì các ô đã chọn vẫn giữ.
  const [picked, setPicked] = useState<PickedUnit[]>([]);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  // Xác nhận đã đọc lịch thanh toán gắn với ĐÚNG số tiền đang hiển thị — đổi ô/chu kỳ (số tiền đổi) thì phải xác nhận lại.
  const [ackedPayment, setAckedPayment] = useState('');

  // Khách tự chọn chu kỳ (ngày/tuần/tháng) + số chu kỳ + có dùng điều hòa không — server tính lại
  // giá theo đúng combo này (ac bị bỏ qua cho loại kho không hợp lệ, xem TypeRow.acEligible).
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/facilities/public/${id}?period=${period}&periods=${periods}&ac=${useAirConditioning}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setError('');
        setTypeId((cur) => cur || d.unitTypes.find((t) => t.availability.available > 0)?._id || '');
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, period, periods, useAirConditioning]);

  // Sơ đồ 2D cơ bản của loại kho đang chọn — khách bấm chọn một hoặc nhiều ô trống.
  useEffect(() => {
    if (!typeId) { setFloorPlan(null); return; }
    let alive = true;
    api.get<{ items: FloorPlanUnit[] }>(`/facilities/public/${id}/unit-types/${typeId}/floor-plan`)
      .then((d) => alive && setFloorPlan(d.items))
      .catch(() => alive && setFloorPlan([]));
    return () => { alive = false; };
  }, [id, typeId]);

  if (error) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Không tải được chi nhánh"
          description={error}
          action={<Button title="Quay lại" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }
  if (!detail) {
    return (
      <Screen>
        <View style={{ gap: S.md }}>
          <Skeleton h={28} w="60%" />
          <Skeleton h={120} />
          <Skeleton h={120} />
        </View>
      </Screen>
    );
  }

  const { facility: f, unitTypes: types } = detail;
  const ut = types.find((t) => t._id === typeId);
  const q = ut?.quote;
  const periodsNum = Math.max(1, Math.min(365, Number(periods) || 1));
  // Mỗi ô đã chọn + báo giá hiện hành của loại kho đó (theo thời hạn và công tắc điều hòa đang chọn).
  const cart = picked.flatMap((p) => {
    const t = types.find((x) => x._id === p.typeId);
    return t ? [{ ...p, quote: t.quote, useAirConditioning: t.acEligible && useAirConditioning }] : [];
  });
  const schedule = cart.length ? buildPaymentSchedule(cart.map((l) => l.quote), detail.policy.gracePeriodDays) : null;
  const ackKey = schedule ? `${schedule.payNow}:${schedule.payAtCheckIn}` : '';
  const agreePayment = !!schedule && ackedPayment === ackKey;
  const canBook = cart.length > 0 && agreeTerms && agreePrivacy && agreePayment;
  const qReasons = q ? surchargeLines(q, detail.policy.surcharges) : [];

  const toggleUnit = (unitId: string) => {
    if (!ut) return;
    if (picked.some((p) => p.unitId === unitId)) { setPicked((c) => c.filter((p) => p.unitId !== unitId)); return; }
    if (picked.length >= MAX_UNITS) return;
    const u = floorPlan?.find((x) => x._id === unitId);
    setPicked((c) => [...c, { unitId, unitNumber: u?.unitNumber ?? '', typeId: ut._id, typeName: ut.name }]);
  };
  const book = () => {
    const item = (l: (typeof cart)[number]) => ({ unitTypeId: l.typeId, unitId: l.unitId, startDate: start, rentalPeriod: period, periods: periodsNum, preferredCheckInShift: checkInShift, useAirConditioning: l.useAirConditioning });
    if (cart.length === 1) {
      void run('createReservation', item(cart[0]), 'Đã giữ chỗ — vui lòng thanh toán để giữ kho', (v) => router.replace(`/booking/${v._id}`));
      return;
    }
    // Nhiều kho: mỗi kho là một đặt chỗ riêng — về trang chủ, mục "Chờ thanh toán" liệt kê từng kho để trả.
    void run('createReservationsBatch', { items: cart.map(item) }, (items) => `Đã giữ chỗ ${items.length} kho — thanh toán từng kho ở mục Chờ thanh toán`, () => router.replace('/'));
  };

  return (
    <Screen>
      <ScreenHeader title={f.name} subtitle={`${f.address.district}, ${f.address.city}`} />
      <Text style={[st.link, { marginBottom: S.sm }]} onPress={() => router.push(`/facility/intro/${f._id}`)}>Xem giới thiệu & hình ảnh kho</Text>

      <Card>
        <DateStepper label="Ngày bắt đầu" value={start} onChange={setStart} min={todayISO()} max={addDays(todayISO(), 60)} presets={[0, 3, 7, 14]} />

        <View style={{ marginTop: S.md }}>
          <Muted>Bạn sẽ gửi trong bao lâu?</Muted>
          <View style={{ marginTop: S.sm }}>
            <DurationPicker period={period} periods={periodsNum} discounts={detail?.policy.discounts ?? []} onChange={(p, n) => { setPeriod(p); setPeriods(String(n)); }} />
          </View>
        </View>

        <View style={{ marginTop: S.md }}>
          <Muted>Ca giờ dự kiến đến nhận kho</Muted>
          <View style={{ marginTop: S.sm }}><Chips options={CHECK_IN_SHIFTS} value={checkInShift} onChange={setCheckInShift} columns={5} /></View>
          {checkInShift !== 'UNKNOWN' && <Muted style={{ marginTop: 4 } as never}>{CHECK_IN_SHIFT[checkInShift].label} — giúp chi nhánh xếp đúng ca trực đón bạn</Muted>}
        </View>

        {ut?.acEligible && (
          <View style={st.filterRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs }}>
              <Ionicons name="snow-outline" size={16} color={C.blue} />
              <Muted>{useAirConditioning ? 'Có sử dụng điều hòa' : 'Không sử dụng điều hòa'}</Muted>
            </View>
            <Switch value={useAirConditioning} onValueChange={setUseAirConditioning} trackColor={{ false: C.line, true: C.brand600 }} thumbColor={C.card} />
          </View>
        )}
      </Card>

      <Text style={st.section}>Loại kho & chỗ trống</Text>
      <Muted>Giá từ, tính theo {PERIOD_UNIT[period]} — chọn ô cụ thể trên sơ đồ để xem giá chính xác.</Muted>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        {types.map((t) => {
          const a = t.availability;
          const selected = t._id === typeId;
          const full = a.available === 0;
          return (
            <Pressable key={t._id} disabled={full} onPress={() => setTypeId(t._id)}>
              <Card style={[st.typeCard, selected && st.typeCardSelected, full && st.typeCardFull]}>
                <View style={st.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.typeName}>{t.name}</Text>
                    <Muted>{t.dimensions.widthM}×{t.dimensions.depthM}×{t.dimensions.heightM} m ({t.areaM2} m²)</Muted>
                    {t.description ? <Muted style={{ marginTop: 4 } as never}>{t.description}</Muted> : null}
                    <View style={{ marginTop: S.sm, flexDirection: 'row', flexWrap: 'wrap', gap: S.xs }}>
                      <Badge>{UNIT_CATEGORY[t.category]}</Badge>
                      {t.quote.firstPeriodAtBooking && <Badge tone="amber">Giữ chân {periodLabel(period, t.quote.depositPeriods ?? 1)} + trả {PERIOD_UNIT[period]} đầu khi đặt</Badge>}
                      {picked.some((p) => p.typeId === t._id) && <Badge tone="violet">Đã chọn {picked.filter((p) => p.typeId === t._id).length} ô</Badge>}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.typePrice}>{vnd(t.quote.firstPeriodRent)}</Text>
                    <Muted>/{PERIOD_UNIT[period]}</Muted>
                    <Text style={[st.availText, full ? { color: C.red } : a.available <= 2 ? { color: C.amber } : { color: C.green }]}>
                      {full ? 'Hết chỗ' : `Còn ${a.available}/${a.total}`}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {ut && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.section}>Chọn ô kho — {ut.name}</Text>
          <Chips options={LOCK_OPTIONS} value={lockFilter} onChange={setLockFilter} columns={4} />
          <Muted style={{ marginTop: 4 } as never}>Bấm vào ô còn trống để chọn, bấm lại để bỏ — muốn thuê nhiều kho thì chọn nhiều ô (tối đa {MAX_UNITS}). Ô không khớp hình thức khoá đang lọc sẽ mờ đi.</Muted>
          <View style={{ marginTop: S.md }}>
            {floorPlan === null ? <Muted>Đang tải sơ đồ…</Muted> : (
              <FloorPlanPicker items={floorPlan} value={null} selected={picked.map((p) => p.unitId)} onChange={toggleUnit} lockMethod={lockFilter === 'ALL' ? null : lockFilter} />
            )}
          </View>
        </Card>
      )}

      {ut && q && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.cardTitle}>Báo giá {ut.name}</Text>
          <KV items={priceItems(q, ut.name, periodsNum, detail.policy.surcharges)} />
          {qReasons.map((s) => <Muted key={s.code} style={{ marginTop: 6 } as never}>{s.label}: {s.reason}</Muted>)}
        </Card>
      )}

      <Card style={{ marginTop: S.md }}>
        <Text style={st.cardTitle}>Kho đã chọn{cart.length > 0 ? ` (${cart.length})` : ''}</Text>
        {cart.length === 0 ? <Muted>Chưa chọn ô nào — bấm các ô còn trống trên sơ đồ ở trên.</Muted> : cart.map((l) => (
          <View key={l.unitId} style={st.cartLine}>
            <View style={{ flex: 1 }}>
              <Text style={st.cartName}>{l.typeName} · ô {l.unitNumber}{l.useAirConditioning ? ' · có điều hòa' : ''}</Text>
              <Muted>
                Hôm nay {vnd(dueAtBooking(l.quote))}{l.quote.firstPeriodAtBooking ? ` (giữ chân ${vnd(l.quote.depositAmount)} + thuê ${PERIOD_UNIT[period]} đầu ${vnd(l.quote.firstPeriodRent)})` : ' tiền giữ chân'}
                {dueAtCheckIn(l.quote) > 0 ? ` · thêm ${vnd(dueAtCheckIn(l.quote))} khi nhận kho` : ' · nhận kho không trả thêm'}
              </Muted>
            </View>
            <Pressable accessibilityLabel="Bỏ ô này" hitSlop={8} onPress={() => setPicked((c) => c.filter((p) => p.unitId !== l.unitId))}>
              <Ionicons name="close-circle" size={22} color={C.faint} />
            </Pressable>
          </View>
        ))}
        {schedule && <View style={{ marginTop: S.md }}><PaymentSchedule quotes={cart.map((l) => l.quote)} graceDays={detail.policy.gracePeriodDays} /></View>}
      </Card>

      <Card style={{ marginTop: S.md }}>
        {schedule && (
          <Pressable onPress={() => setAckedPayment(agreePayment ? '' : ackKey)} style={[st.consent, st.ackBox]}>
            <Ionicons name={agreePayment ? 'checkbox' : 'square-outline'} size={22} color={agreePayment ? C.brand700 : C.faint} />
            <Text style={[st.consentText, { fontWeight: '600', color: '#78350f' }]}>{paymentAckText(schedule)}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setAgreeTerms((v) => !v)} style={st.consent}>
          <Ionicons name={agreeTerms ? 'checkbox' : 'square-outline'} size={22} color={agreeTerms ? C.brand700 : C.faint} />
          <Text style={st.consentText}>
            Tôi đã đọc và đồng ý{' '}
            <Text style={st.link} onPress={() => Linking.openURL(`${WEB_ORIGIN}/dieu-khoan`)}>Điều khoản dịch vụ</Text>
            {' '}(bản {TERMS_VERSION}, hiệu lực {TERMS_EFFECTIVE}).
          </Text>
        </Pressable>
        <Pressable onPress={() => setAgreePrivacy((v) => !v)} style={st.consent}>
          <Ionicons name={agreePrivacy ? 'checkbox' : 'square-outline'} size={22} color={agreePrivacy ? C.brand700 : C.faint} />
          <Text style={st.consentText}>
            Tôi đồng ý cho KhoAn xử lý dữ liệu cá nhân theo{' '}
            <Text style={st.link} onPress={() => Linking.openURL(`${WEB_ORIGIN}/bao-mat`)}>Chính sách bảo mật</Text>
            {' '}(bản {PRIVACY_VERSION}).
          </Text>
        </Pressable>
        <Button
          title={`Giữ chỗ & thanh toán${cart.length > 1 ? ` (${cart.length} kho)` : ''}`}
          disabled={!canBook}
          style={{ marginTop: S.sm }}
          onPress={book}
        />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '700', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: S.lg, marginBottom: S.sm },
  filterRow: { marginTop: S.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: S.md },
  typeCard: { borderWidth: 1.5 },
  typeCardSelected: { borderColor: C.brand600, backgroundColor: C.brand50 },
  typeCardFull: { opacity: 0.6 },
  typeName: { fontSize: 15, fontWeight: '700', color: C.ink },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: S.sm },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.line },
  cartName: { fontSize: 14, fontWeight: '600', color: C.ink },
  typePrice: { fontSize: 15, fontWeight: '700', color: C.ink },
  availText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  consent: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', marginBottom: S.md },
  ackBox: { backgroundColor: C.amberBg, borderRadius: 12, padding: S.sm, marginBottom: S.sm },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.text },
  link: { color: C.brand700, fontWeight: '600' },
});
