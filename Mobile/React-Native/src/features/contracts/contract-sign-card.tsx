import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BusinessPolicy, Reservation } from '@ssm/shared';
import { ACCESS_METHOD, PERIOD_UNIT, TERMS_VERSION, fmtDate, fmtDateTime, periodLabel, vnd } from '@ssm/shared';
import { byId, facilityName, typeName, useStore } from '../../shared/store/store';
import { Badge, Button, Card, Field, Input, Muted } from '../../shared/ui';
import { C, R, S } from '../../shared/ui/theme';

const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://wdp-301-webapp.vercel.app';

function earlyTerminationLines(policy: BusinessPolicy) {
  const tiers = [...policy.earlyTermination].sort((a, b) => a.maxElapsedPct - b.maxElapsedPct);
  return tiers.map((t, i) => {
    const prev = tiers[i - 1]?.maxElapsedPct;
    const range = prev === undefined ? `đã dùng đến ${t.maxElapsedPct}% kỳ hạn` : i === tiers.length - 1 ? `đã dùng trên ${prev}% kỳ hạn` : `đã dùng trên ${prev}% đến ${t.maxElapsedPct}% kỳ hạn`;
    return `Trả kho sớm khi ${range}: hoàn ${t.depositRefundPct}% tiền cọc`;
  });
}

/**
 * Bước ký hợp đồng sau khi trả cọc, trước khi nhận kho: đọc tóm tắt hợp đồng rồi gõ họ tên + đồng ý.
 * (Mobile ký bằng họ tên gõ vào — web có thêm ký tay trên canvas; cùng một API, cùng giá trị pháp lý.)
 */
export function ContractSignCard({ reservation: r }: { reservation: Reservation }) {
  const { db, user, run } = useStore();
  const [name, setName] = useState(user?.fullName ?? '');
  const [agree, setAgree] = useState(false);
  const [open, setOpen] = useState(false);

  if (r.signature) {
    return (
      <Card style={{ marginTop: S.md, backgroundColor: C.greenBg, borderColor: C.green }}>
        <Text style={{ color: C.green, fontWeight: '700' }}>Đã ký hợp đồng — {r.signature.signerName}</Text>
        <Muted style={{ marginTop: 2 } as never}>{fmtDateTime(r.signature.signedAt)}{r.signature.onBehalf ? ' · nhân viên thao tác tại quầy' : ''}</Muted>
      </Card>
    );
  }

  const policy = db.policies.find((p) => p._id === r.quote.policyId);
  const facility = byId(db.facilities, r.facilityId);
  const unit = byId(db.units, r.unitId);
  const type = byId(db.unitTypes, r.unitTypeId);
  const valid = name.trim().length >= 2 && agree;

  return (
    <Card style={{ marginTop: S.md }}>
      <View style={st.rowBetween}>
        <Text style={st.title}>Bước 2 — Ký hợp đồng</Text>
        <Badge tone="amber">Chưa ký</Badge>
      </View>
      <Muted style={{ marginTop: 4 } as never}>Cần ký trước khi nhận kho. Nhân viên sẽ không bàn giao kho nếu chưa ký.</Muted>

      <Pressable onPress={() => setOpen((v) => !v)} style={st.toggle}>
        <Text style={st.toggleText}>{open ? 'Thu gọn nội dung hợp đồng' : 'Xem nội dung hợp đồng'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.brand700} />
      </Pressable>

      {open && (
        <View style={st.doc}>
          <Text style={st.h}>1. Các bên</Text>
          <Text style={st.p}>Bên cho thuê: KhoAn — {facilityName(db, r.facilityId)}{facility ? `, ${facility.address.line1}, ${facility.address.district}` : ''}.{'\n'}Bên thuê: {user?.fullName ?? '—'}.</Text>
          <Text style={st.h}>2. Đối tượng thuê</Text>
          <Text style={st.p}>
            {type?.name ?? typeName(db, r.unitTypeId)}{unit ? `, ô ${unit.unitNumber} (tầng ${unit.location.floor})` : ''}{type ? `, ${type.areaM2} m²` : ''}
            {unit ? `, khoá: ${ACCESS_METHOD[unit.accessMethod]}` : ''}. Điều hòa: {r.useAirConditioning ? 'có sử dụng (tính phụ phí)' : 'không sử dụng'}.
          </Text>
          <Text style={st.h}>3. Thời hạn</Text>
          <Text style={st.p}>Từ {fmtDate(r.startDate)}, {periodLabel(r.quote.rentalPeriod, r.periods)} (dự kiến đến {fmtDate(r.endDate)}). Hết hạn mà chưa gia hạn hay trả kho thì tiền thuê tiếp tục được tính theo giá cũ.</Text>
          <Text style={st.h}>4. Giá và thanh toán</Text>
          <Text style={st.p}>
            Giá thuê mỗi {PERIOD_UNIT[r.quote.rentalPeriod]}: {vnd(r.quote.rate)}{r.quote.surchargeAmount > 0 ? `, phụ phí điều hòa ${vnd(r.quote.surchargeAmount)}` : ''}{r.quote.discountAmount > 0 ? `, ưu đãi −${vnd(r.quote.discountAmount)}` : ''}.{'\n'}
            Tiền thuê kỳ đầu {vnd(r.quote.firstPeriodRent)} (thanh toán khi nhận kho). Tiền cọc {vnd(r.quote.depositAmount)} — đã thanh toán.
            {policy ? `\nQuá hạn quá ${policy.gracePeriodDays} ngày bị tính phí trễ; quá ${policy.lockoutAfterDays} ngày bị khoá truy cập.` : ''}
          </Text>
          {policy && (
            <>
              <Text style={st.h}>5. Hủy, trả kho sớm và hàng bỏ lại</Text>
              <Text style={st.p}>
                {[...policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart)
                  .map((t) => `${t.minHoursBeforeStart > 0 ? `Hủy trước ngày nhận ≥ ${t.minHoursBeforeStart} giờ` : 'Hủy sát ngày nhận'}: hoàn ${t.depositRefundPct}% cọc`).join('\n')}
                {'\n'}{earlyTerminationLines(policy).join('\n')}
                {`\nBị khoá truy cập quá ${policy.abandonAfterLockedOutDays} ngày mà không đóng tiền hay liên hệ: chi nhánh được kiểm kê, thanh lý đồ trong kho và giữ toàn bộ tiền cọc.`}
              </Text>
            </>
          )}
          <Text style={st.p}>
            Hai bên thực hiện theo{' '}
            <Text style={st.link} onPress={() => Linking.openURL(`${WEB_ORIGIN}/dieu-khoan`)}>Điều khoản thuê kho (v{TERMS_VERSION})</Text>.
          </Text>
        </View>
      )}

      <View style={{ marginTop: S.md }}>
        <Field label="Gõ đầy đủ họ tên để ký" hint="Họ tên gõ vào có giá trị như chữ ký xác nhận hợp đồng.">
          <Input value={name} onChangeText={setName} autoCapitalize="words" />
        </Field>
      </View>
      <Pressable onPress={() => setAgree((v) => !v)} style={st.consent}>
        <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? C.brand700 : C.faint} />
        <Text style={st.consentText}>Tôi đã đọc và đồng ý toàn bộ nội dung hợp đồng trên.</Text>
      </Pressable>
      <Button
        title="Ký & xác nhận hợp đồng"
        icon="create-outline"
        style={{ marginTop: S.md }}
        disabled={!valid}
        onPress={() => void run('signContract', { reservationId: r._id, signerName: name.trim(), method: 'TYPED' }, 'Đã ký hợp đồng')}
      />
    </Card>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.md },
  title: { fontSize: 15, fontWeight: '700', color: C.ink },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: S.md, paddingVertical: S.sm },
  toggleText: { color: C.brand700, fontWeight: '600', fontSize: 14 },
  doc: { backgroundColor: C.bg, borderRadius: R.md, padding: S.md, gap: 4 },
  h: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: S.sm },
  p: { fontSize: 13, color: C.text, lineHeight: 19 },
  link: { color: C.brand700, fontWeight: '600' },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
  consentText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
});
