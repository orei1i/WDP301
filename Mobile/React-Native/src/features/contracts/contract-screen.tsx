import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PaymentMethod } from '@ssm/shared';
import {
  ACCESS_METHOD, CONTRACT_STATUS, DEPOSIT_STATUS, OPEN_SWAP_STATUSES, PAYMENT_METHOD, PERIOD_UNIT, SWAP_REQUEST_STATUS,
  addDays, addPeriods, fmtDate, periodLabel, todayISO, vnd,
} from '@ssm/shared';
import { byId, facilityName, typeName, unitLabel, useStore } from '../../shared/store/store';
import { Badge, Button, Card, Chips, DateStepper, EmptyState, KV, Screen, ScreenHeader, StatusBadge } from '../../shared/ui';
import { C, S } from '../../shared/ui/theme';

const METHODS: { value: PaymentMethod; label: string }[] = (['VNPAY', 'MOMO', 'CARD', 'BANK_TRANSFER'] as PaymentMethod[])
  .map((v) => ({ value: v, label: PAYMENT_METHOD[v] }));
const PERIODS: { value: '1' | '3' | '6' | '12'; label: string }[] = [
  { value: '1', label: '1 tháng' }, { value: '3', label: '3 tháng' }, { value: '6', label: '6 tháng' }, { value: '12', label: '12 tháng' },
];

export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, run } = useStore();
  const router = useRouter();
  const [payMethod, setPayMethod] = useState<PaymentMethod>('VNPAY');
  const [extendMethod, setExtendMethod] = useState<PaymentMethod>('VNPAY');
  const [periods, setPeriods] = useState<'1' | '3' | '6' | '12'>('3');
  const [moveOutDate, setMoveOutDate] = useState(addDays(todayISO(), 3));

  const c = byId(db.contracts, id);
  if (!c) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Không tìm thấy hợp đồng"
          action={<Button title="Quay lại" variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  const periodsNum = Number(periods);
  const openSwap = db.swapRequests.find((s) => s.contractId === c._id && (OPEN_SWAP_STATUSES as readonly string[]).includes(s.status));

  return (
    <Screen>
      <ScreenHeader title={`Hợp đồng ${c.contractNumber}`} right={<StatusBadge map={CONTRACT_STATUS} value={c.status} />} />

      <Card>
        <KV items={[
          ['Kho', `${unitLabel(db, c.unitId)} · ${typeName(db, c.unitTypeId)}`],
          ['Chi nhánh', facilityName(db, c.facilityId)],
          ['Thời hạn', `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`],
          ['Tiền thuê', `${vnd(c.billing.rate)}/${PERIOD_UNIT[c.billing.rentalPeriod]}`],
          ['Kỳ thanh toán tới', fmtDate(c.billing.nextBillingDate)],
          ['Phương thức truy cập', ACCESS_METHOD[c.access.method]],
          ['Tiền cọc', `${vnd(c.deposit.amount)} · ${DEPOSIT_STATUS[c.deposit.status].label}`],
          ['Công nợ', c.balance.outstanding > 0
            ? <Text key="o" style={{ color: C.red, fontWeight: '700' }}>{vnd(c.balance.outstanding)}</Text>
            : 'Không có'],
        ]} />
      </Card>

      {c.balance.outstanding > 0 && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.sectionTitle}>Thanh toán công nợ</Text>
          <Text style={st.hint}>{vnd(c.balance.outstanding)}</Text>
          <Chips options={METHODS} value={payMethod} onChange={setPayMethod} columns={2} />
          <Button
            title={`Thanh toán ${vnd(c.balance.outstanding)}`}
            style={{ marginTop: S.lg }}
            onPress={() => void run('payBalance', { contractId: c._id, method: payMethod }, (v) => `Đã thanh toán ${vnd(v)}`)}
          />
        </Card>
      )}

      {c.status === 'ACTIVE' && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.sectionTitle}>Gia hạn hợp đồng</Text>
          <Chips options={PERIODS} value={periods} onChange={setPeriods} columns={4} />
          <Chips options={METHODS} value={extendMethod} onChange={setExtendMethod} columns={2} />
          <Text style={st.hint}>
            Hạn mới: {fmtDate(addPeriods(c.endDate, c.billing.rentalPeriod, periodsNum))} · Số tiền: {vnd(c.billing.rate * periodsNum)}
          </Text>
          <Button
            title="Gia hạn & thanh toán"
            style={{ marginTop: S.md }}
            onPress={() => void run(
              'extendContract',
              { contractId: c._id, periods: periodsNum, method: extendMethod },
              (v) => `Đã gia hạn ${periodLabel(c.billing.rentalPeriod, periodsNum)} — thanh toán ${vnd(v)}`,
            )}
          />
        </Card>
      )}

      {c.status === 'ACTIVE' && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.sectionTitle}>Đăng ký trả kho</Text>
          <Text style={st.hint}>Nhân viên sẽ kiểm tra kho khi bạn bàn giao chìa khóa. Tiền cọc hoàn sau khi trừ chi phí hư hại (nếu có).</Text>
          <DateStepper label="Ngày trả kho dự kiến" value={moveOutDate} onChange={setMoveOutDate} min={todayISO()} />
          <Button
            title="Đăng ký trả kho"
            variant="secondary"
            style={{ marginTop: S.md }}
            onPress={() => void run('requestMoveOut', { contractId: c._id, date: moveOutDate }, 'Đã đăng ký trả kho')}
          />
        </Card>
      )}

      {c.status === 'MOVE_OUT_PENDING' && (
        <Badge tone="violet">Hẹn trả kho {fmtDate(c.moveOut?.scheduledFor)}</Badge>
      )}

      {openSwap ? (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.sectionTitle}>Yêu cầu đổi ô {openSwap.requestNumber}</Text>
          <StatusBadge map={SWAP_REQUEST_STATUS} value={openSwap.status} />
          {openSwap.status === 'APPROVED' && openSwap.method === 'SELF' && openSwap.moveDeadline && (
            <Text style={st.hint}>Hạn tự chuyển: {fmtDate(openSwap.moveDeadline)}</Text>
          )}
          {openSwap.status === 'SUBMITTED' && (
            <Button
              title="Rút yêu cầu" variant="ghost" style={{ marginTop: S.sm }}
              onPress={() => void run('cancelSwapRequest', { swapRequestId: openSwap._id }, 'Đã rút yêu cầu đổi ô')}
            />
          )}
        </Card>
      ) : c.status === 'ACTIVE' && (
        <Card style={{ marginTop: S.md }}>
          <Button
            title="Yêu cầu đổi ô kho"
            variant="secondary"
            icon="swap-horizontal-outline"
            onPress={() => router.push(`/contract/swap?contract=${c._id}`)}
          />
        </Card>
      )}

      {c.status !== 'CLOSED' && (
        <Card style={{ marginTop: S.md }}>
          <Button
            title="Báo sự cố"
            variant="secondary"
            icon="alert-circle-outline"
            onPress={() => router.push(`/ticket/new?contract=${c._id}`)}
          />
          <Button
            title="Yêu cầu bồi thường"
            variant="secondary"
            icon="cash-outline"
            style={{ marginTop: S.sm }}
            onPress={() => router.push(`/claim/new?contract=${c._id}`)}
          />
        </Card>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  hint: { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: S.md },
});
