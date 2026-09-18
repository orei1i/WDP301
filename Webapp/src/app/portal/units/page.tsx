'use client';

import { useState } from 'react';
import { HandCoins, KeyRound, LifeBuoy, Lock, PackageOpen, RefreshCw } from 'lucide-react';
import type { PaymentMethod, RentalContract } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { ACCESS_METHOD, CONTRACT_STATUS, DEPOSIT_STATUS } from '@/shared/lib/labels';
import { byId, facilityName, typeName, unitLabel } from '@/shared/lib/domain';
import { addDays, addMonths, fmtDate, todayISO, vnd } from '@/shared/lib/format';
import { Badge, Button, ButtonLink, Card, EmptyState, Field, KV, Modal, PageHeader, StatusBadge, inputCls } from '@/shared/ui';
import { PayMethodPicker } from '@/features/payments/pay-method';

type Dialog = { kind: 'pay' | 'extend' | 'moveout'; c: RentalContract } | null;

export default function MyUnits() {
  const { db, user, run } = useStore();
  const [dlg, setDlg] = useState<Dialog>(null);
  const [method, setMethod] = useState<PaymentMethod>('VNPAY');
  const [months, setMonths] = useState(3);
  const [date, setDate] = useState(addDays(todayISO(), 3).slice(0, 10));
  if (!user) return null;
  const contracts = db.contracts.filter((c) => c.customerId === user._id).sort((a, b) => (a.status === 'CLOSED' ? 1 : 0) - (b.status === 'CLOSED' ? 1 : 0));
  const close = () => setDlg(null);

  return (
    <>
      <PageHeader title="Kho đang thuê" description="Thanh toán, gia hạn hoặc đăng ký trả kho. Mọi thay đổi được ghi vào hợp đồng điện tử." />
      {contracts.length === 0 && <Card><EmptyState title="Bạn chưa có hợp đồng thuê kho" action={<ButtonLink href="/facilities">Tìm kho</ButtonLink>} /></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {contracts.map((c) => {
          const unit = byId(db.units, c.unitId);
          return (
            <Card key={c._id} className="p-5">
              <div className="flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-ink text-sm font-bold text-white">{unitLabel(db, c.unitId)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{typeName(db, c.unitTypeId)}</p>
                    <StatusBadge map={CONTRACT_STATUS} value={c.status} />
                    {unit?.overlockActive && <Badge tone="red"><Lock className="size-3" />Đã gắn khóa chặn</Badge>}
                  </div>
                  <p className="text-sm text-stone-500">{facilityName(db, c.facilityId)} · Tầng {unit?.location.floor} · {c.contractNumber}</p>
                </div>
              </div>
              <div className="mt-4"><KV items={[
                ['Thời hạn', `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`],
                ['Tiền thuê', `${vnd(c.billing.monthlyRate)}/tháng`],
                ['Kỳ thanh toán tới', fmtDate(c.billing.nextBillingDate)],
                ['Truy cập', <span key="a" className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5" />{ACCESS_METHOD[c.access.method]}{c.access.keyTag ? ` · ${c.access.keyTag}` : ''}</span>],
                ['Tiền cọc', <span key="d">{vnd(c.deposit.amount)} · {DEPOSIT_STATUS[c.deposit.status].label}</span>],
                ['Công nợ', <span key="o" className={c.balance.outstanding ? 'text-red-700' : ''}>{vnd(c.balance.outstanding)}</span>],
              ]} /></div>
              {c.status !== 'CLOSED' && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                  {c.balance.outstanding > 0 && <Button size="sm" onClick={() => setDlg({ kind: 'pay', c })}>Thanh toán {vnd(c.balance.outstanding)}</Button>}
                  {c.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'extend', c })}><RefreshCw className="size-3.5" />Gia hạn</Button>}
                  {c.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'moveout', c })}><PackageOpen className="size-3.5" />Đăng ký trả kho</Button>}
                  {c.status === 'MOVE_OUT_PENDING' && <Badge tone="violet">Hẹn trả kho {fmtDate(c.moveOut?.scheduledFor)}</Badge>}
                  <ButtonLink href={`/portal/tickets?contract=${c._id}`} size="sm" variant="ghost"><LifeBuoy className="size-3.5" />Báo sự cố</ButtonLink>
                  <ButtonLink href="/portal/claims" size="sm" variant="ghost"><HandCoins className="size-3.5" />Yêu cầu bồi thường</ButtonLink>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={dlg?.kind === 'pay'} onClose={close} title="Thanh toán công nợ" description={dlg ? `${unitLabel(db, dlg.c.unitId)} · ${vnd(dlg.c.balance.outstanding)}` : ''}
        footer={<Button onClick={() => dlg && void run('payBalance', { contractId: dlg.c._id, method }, (v) => `Đã thanh toán ${vnd(v)} — truy cập kho được khôi phục`, () => close())}>Thanh toán</Button>}>
        <PayMethodPicker value={method} onChange={setMethod} />
        {dlg?.c.status === 'LOCKED_OUT' && <p className="mt-3 text-sm text-stone-600">Sau khi thanh toán đủ, khóa chặn sẽ được gỡ và mã truy cập hoạt động lại.</p>}
      </Modal>

      <Modal open={dlg?.kind === 'extend'} onClose={close} title="Gia hạn hợp đồng" description={dlg ? `Hết hạn hiện tại: ${fmtDate(dlg.c.endDate)}` : ''}
        footer={<Button onClick={() => dlg && void run('extendContract', { contractId: dlg.c._id, months, method }, (v) => `Đã gia hạn ${months} tháng — thanh toán ${vnd(v)}`, () => close())}>Gia hạn & thanh toán</Button>}>
        <Field label="Số tháng gia hạn">
          <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} tháng</option>)}</select>
        </Field>
        {dlg && <p className="mt-3 text-sm">Hạn mới: <b>{fmtDate(addMonths(dlg.c.endDate, months))}</b> · Số tiền: <b>{vnd(dlg.c.billing.monthlyRate * months)}</b></p>}
        <div className="mt-4"><PayMethodPicker value={method} onChange={setMethod} /></div>
      </Modal>

      <Modal open={dlg?.kind === 'moveout'} onClose={close} title="Đăng ký trả kho"
        footer={<Button onClick={() => dlg && void run('requestMoveOut', { contractId: dlg.c._id, date: `${date}T00:00:00.000Z` }, 'Đã đăng ký trả kho', () => close())}>Xác nhận</Button>}>
        <Field label="Ngày trả kho dự kiến" hint="Nhân viên sẽ kiểm tra kho khi bạn bàn giao chìa khóa. Tiền cọc hoàn sau khi trừ chi phí hư hại (nếu có).">
          <input type="date" className={inputCls} min={todayISO().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
