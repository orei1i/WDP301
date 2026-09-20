import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { BusinessPolicy, Facility, PriceQuote, UnitType } from '@ssm/shared';
import { LEGAL_EFFECTIVE, PRIVACY_VERSION, TERMS_VERSION, UNIT_CATEGORY, addDays, todayISO, vnd } from '@ssm/shared';
import { api } from '../../shared/api/client';
import { useStore } from '../../shared/store/store';
import { Badge, Button, Card, Chips, DateStepper, EmptyState, KV, Muted, Screen, ScreenHeader, Skeleton } from '../../shared/ui';
import { C, S } from '../../shared/ui/theme';

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://wdp-301-webapp.vercel.app';

type TypeRow = UnitType & { quote: PriceQuote; availability: { total: number; free: number; holds: number; available: number } };
interface Detail {
  facility: Facility;
  unitTypes: TypeRow[];
  policy: Pick<BusinessPolicy, 'version' | 'scope' | 'reservationHoldMinutes' | 'cancellation' | 'minRentalMonths' | 'maxRentalMonths'>;
}

const MONTHS: { value: '1' | '3' | '6' | '12'; label: string }[] = [
  { value: '1', label: '1 tháng' }, { value: '3', label: '3 tháng' }, { value: '6', label: '6 tháng' }, { value: '12', label: '12 tháng' },
];

/** Bảng tóm tắt giá — tách hàm để không phải nhồi logic điều kiện vào JSX. */
function priceItems(q: PriceQuote, typeName: string, months: number): [string, ReactNode][] {
  const items: [string, ReactNode][] = [[`${typeName} / tháng`, vnd(q.monthlyRate)]];
  if (q.surchargeAmount > 0) items.push(['Phụ phí', `+${vnd(q.surchargeAmount)}`]);
  if (q.discountAmount > 0) items.push(['Giảm giá', `-${vnd(q.discountAmount)}`]);
  items.push(['Tiền thuê mỗi tháng', vnd(q.firstPeriodRent)]);
  items.push([`Tổng ${months} tháng`, vnd(q.firstPeriodRent * months)]);
  items.push(['Đặt cọc ngay', <Text key="deposit" style={{ fontWeight: '700', color: C.brand800 }}>{vnd(q.depositAmount)}</Text>]);
  return items;
}

export default function FacilityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { run } = useStore();
  const router = useRouter();
  const [start, setStart] = useState(todayISO());
  const [months, setMonths] = useState<'1' | '3' | '6' | '12'>('3');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  // Server tính chỗ trống theo khoảng ngày và giá theo chính sách hiện hành — dữ liệu này không
  // cần đồng bộ toàn app nên giữ ở state cục bộ, không qua store.
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/facilities/public/${id}?start=${start}&months=${months}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setError('');
        setTypeId((cur) => cur || d.unitTypes.find((t) => t.availability.available > 0)?._id || '');
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, start, months]);

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
  const monthsNum = Number(months);
  const canBook = !!ut && ut.availability.available > 0 && agreeTerms && agreePrivacy;

  return (
    <Screen>
      <ScreenHeader title={f.name} subtitle={`${f.address.district}, ${f.address.city}`} />

      <Card>
        <DateStepper label="Ngày bắt đầu" value={start} onChange={setStart} min={todayISO()} max={addDays(todayISO(), 60)} presets={[0, 3, 7, 14]} />
        <View style={{ marginTop: S.md }}>
          <Chips options={MONTHS} value={months} onChange={setMonths} columns={4} />
        </View>
      </Card>

      <Text style={st.section}>Loại kho & chỗ trống</Text>
      <View style={{ gap: S.sm }}>
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
                    <View style={{ marginTop: S.sm }}><Badge>{UNIT_CATEGORY[t.category]}</Badge></View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.typePrice}>{vnd(t.quote.firstPeriodRent)}</Text>
                    <Muted>/tháng</Muted>
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
          <KV items={priceItems(ut.quote, ut.name, monthsNum)} />
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
          onPress={() => void run(
            'createReservation',
            { unitTypeId: typeId, startDate: start, months: monthsNum },
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
