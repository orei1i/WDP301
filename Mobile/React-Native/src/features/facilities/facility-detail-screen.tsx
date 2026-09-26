import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { BusinessPolicy, CheckInShift, Facility, PriceQuote, RentalPeriod, UnitType } from '@ssm/shared';
import {
  ACCESS_METHOD, CHECK_IN_SHIFT, LEGAL_EFFECTIVE, PERIOD_UNIT, PRIVACY_VERSION, RENTAL_PERIOD, STAFF_SHIFTS,
  TERMS_VERSION, UNIT_CATEGORY, addDays, periodLabel, todayISO, vnd,
} from '@ssm/shared';
import { api } from '../../shared/api/client';
import { useStore } from '../../shared/store/store';
import { Badge, Button, Card, Chips, DateStepper, EmptyState, Input, KV, Muted, Screen, ScreenHeader, Skeleton } from '../../shared/ui';
import { C, S } from '../../shared/ui/theme';
import { FloorPlanPicker, type FloorPlanUnit } from './floor-plan-picker';

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://wdp-301-webapp.vercel.app';

type TypeRow = UnitType & { quote: PriceQuote; availability: { total: number; free: number; available: number } };
interface Detail {
  facility: Facility;
  unitTypes: TypeRow[];
  policy: Pick<BusinessPolicy, 'version' | 'scope' | 'reservationHoldMinutes' | 'cancellation' | 'minPeriods' | 'maxPeriods'>;
}

const RENTAL_PERIODS: { value: RentalPeriod; label: string }[] = (['DAY', 'WEEK', 'MONTH'] as const).map((p) => ({ value: p, label: RENTAL_PERIOD[p] }));
// Nhãn ngắn trên chip ("Ca 1"), thời gian đầy đủ chỉ hiện ở dòng chú thích bên dưới khi đã chọn — đỡ rối mắt.
const CHECK_IN_SHIFTS: { value: CheckInShift; label: string }[] = [...STAFF_SHIFTS, 'UNKNOWN' as const]
  .map((s) => ({ value: s, label: s === 'UNKNOWN' ? 'Chưa rõ' : `Ca ${s.slice(-1)}` }));

/** Bảng tóm tắt giá — tách hàm để không phải nhồi logic điều kiện vào JSX. */
function priceItems(q: PriceQuote, typeName: string, periods: number): [string, ReactNode][] {
  const unit = PERIOD_UNIT[q.rentalPeriod];
  const items: [string, ReactNode][] = [[`${typeName} / ${unit}`, vnd(q.rate)]];
  if (q.surchargeAmount > 0) items.push(['Phụ phí', `+${vnd(q.surchargeAmount)}`]);
  if (q.discountAmount > 0) items.push(['Giảm giá', `-${vnd(q.discountAmount)}`]);
  items.push([`Tiền thuê mỗi ${unit}`, vnd(q.firstPeriodRent)]);
  items.push([`Tổng ${periodLabel(q.rentalPeriod, periods)}`, vnd(q.firstPeriodRent * periods)]);
  items.push(['Đặt cọc ngay', <Text key="deposit" style={{ fontWeight: '700', color: C.brand800 }}>{vnd(q.depositAmount)}</Text>]);
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
  const [acOnly, setAcOnly] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState('');
  const [floorPlan, setFloorPlan] = useState<FloorPlanUnit[] | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  // Khách tự chọn chu kỳ (ngày/tuần/tháng) + số chu kỳ — server tính lại giá theo đúng combo này.
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/facilities/public/${id}?period=${period}&periods=${periods}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setError('');
        setTypeId((cur) => cur || d.unitTypes.find((t) => t.availability.available > 0)?._id || '');
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, period, periods]);

  // Sơ đồ 2D cơ bản của loại kho đang chọn — bắt buộc chọn đúng một ô trống trước khi đặt.
  useEffect(() => {
    if (!typeId) { setFloorPlan(null); return; }
    let alive = true;
    setUnitId(null);
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
  // Có/không điều hòa là một biến thể loại kho riêng (giá gốc như nhau, biến thể có điều hòa cộng
  // thêm phụ phí điều hòa của chính sách giá) — công tắc chỉ để khách dễ so sánh trong danh sách.
  const visibleTypes = types.filter((t) => t.features.climateControlled === acOnly);
  const ut = types.find((t) => t._id === typeId);
  const periodsNum = Math.max(1, Math.min(365, Number(periods) || 1));
  const step = (delta: number) => setPeriods(String(Math.max(1, Math.min(365, (Number(periods) || 1) + delta))));
  const canBook = !!ut && !!unitId && ut.availability.available > 0 && agreeTerms && agreePrivacy;

  return (
    <Screen>
      <ScreenHeader title={f.name} subtitle={`${f.address.district}, ${f.address.city}`} />

      <Card>
        <DateStepper label="Ngày bắt đầu" value={start} onChange={setStart} min={todayISO()} max={addDays(todayISO(), 60)} presets={[0, 3, 7, 14]} />

        <View style={{ marginTop: S.md, flexDirection: 'row', gap: S.md }}>
          <View style={{ flex: 1 }}>
            <Muted>Chu kỳ thuê</Muted>
            <View style={{ marginTop: S.sm }}><Chips options={RENTAL_PERIODS} value={period} onChange={setPeriod} columns={3} /></View>
          </View>
        </View>

        <View style={{ marginTop: S.md }}>
          <Muted>Số chu kỳ ({PERIOD_UNIT[period]})</Muted>
          <View style={{ marginTop: S.sm, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <Pressable onPress={() => step(-1)} style={st.stepBtn} hitSlop={8}><Ionicons name="remove" size={18} color={C.ink} /></Pressable>
            <Input style={st.stepInput} keyboardType="number-pad" value={periods} onChangeText={setPeriods} />
            <Pressable onPress={() => step(1)} style={st.stepBtn} hitSlop={8}><Ionicons name="add" size={18} color={C.ink} /></Pressable>
            <Muted>{PERIOD_UNIT[period]} — chạm số để tự nhập</Muted>
          </View>
        </View>

        <View style={{ marginTop: S.md }}>
          <Muted>Ca giờ dự kiến đến nhận kho</Muted>
          <View style={{ marginTop: S.sm }}><Chips options={CHECK_IN_SHIFTS} value={checkInShift} onChange={setCheckInShift} columns={5} /></View>
          {checkInShift !== 'UNKNOWN' && <Muted style={{ marginTop: 4 } as never}>{CHECK_IN_SHIFT[checkInShift].label} — giúp chi nhánh xếp đúng ca trực đón bạn</Muted>}
        </View>
      </Card>

      <View style={{ marginTop: S.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[st.section, { marginTop: 0 }]}>Loại kho & chỗ trống</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs }}>
          <Muted>Có điều hòa</Muted>
          <Switch value={acOnly} onValueChange={setAcOnly} trackColor={{ false: C.line, true: C.brand600 }} thumbColor={C.card} />
        </View>
      </View>
      {visibleTypes.length === 0 && <Muted>Không có loại kho phù hợp bộ lọc.</Muted>}
      <View style={{ gap: S.sm }}>
        {visibleTypes.map((t) => {
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
                      <Badge tone="violet">{ACCESS_METHOD[t.accessMethod]}</Badge>
                      {t.features.climateControlled && <Badge tone="blue">Điều hòa</Badge>}
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
          {floorPlan === null ? <Muted>Đang tải sơ đồ…</Muted> : <FloorPlanPicker items={floorPlan} value={unitId} onChange={setUnitId} />}
        </Card>
      )}

      {ut && (
        <Card style={{ marginTop: S.md }}>
          <KV items={priceItems(ut.quote, ut.name, periodsNum)} />
        </Card>
      )}

      <Card style={{ marginTop: S.md }}>
        <Pressable onPress={() => setAgreeTerms((v) => !v)} style={st.consent}>
          <Ionicons name={agreeTerms ? 'checkbox' : 'square-outline'} size={22} color={agreeTerms ? C.brand700 : C.faint} />
          <Text style={st.consentText}>
            Tôi đã đọc và đồng ý{' '}
            <Text style={st.link} onPress={() => Linking.openURL(`${WEB_ORIGIN}/dieu-khoan`)}>Điều khoản dịch vụ</Text>
            {' '}(bản {TERMS_VERSION}, hiệu lực {LEGAL_EFFECTIVE}).
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
          title="Giữ chỗ & đặt cọc"
          disabled={!canBook}
          style={{ marginTop: S.sm }}
          onPress={() => unitId && void run(
            'createReservation',
            { unitTypeId: typeId, unitId, startDate: start, rentalPeriod: period, periods: periodsNum, preferredCheckInShift: checkInShift },
            'Đã giữ chỗ — vui lòng thanh toán tiền cọc',
            (v) => router.replace(`/booking/${v._id}`),
          )}
        />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '700', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: S.lg, marginBottom: S.sm },
  stepBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  stepInput: { width: 56, textAlign: 'center', paddingHorizontal: 0 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: S.md },
  typeCard: { borderWidth: 1.5 },
  typeCardSelected: { borderColor: C.brand600, backgroundColor: C.brand50 },
  typeCardFull: { opacity: 0.6 },
  typeName: { fontSize: 15, fontWeight: '700', color: C.ink },
  typePrice: { fontSize: 15, fontWeight: '700', color: C.ink },
  availText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  consent: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-start', marginBottom: S.md },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.text },
  link: { color: C.brand700, fontWeight: '600' },
});
