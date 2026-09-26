'use client';

import { useEffect, useState } from 'react';
import { HandCoins, KeyRound, LifeBuoy, Lock, PackageOpen, RefreshCw, Repeat } from 'lucide-react';
import type { PaymentMethod, RentalContract, SwapMethod } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { ACCESS_METHOD, CONTRACT_STATUS, DEPOSIT_STATUS, SWAP_METHOD, SWAP_REQUEST_STATUS } from '@/shared/lib/labels';
import { byId, facilityName, typeName, unitLabel } from '@/shared/lib/domain';
import { addDays, fmtDate, todayISO, vnd } from '@/shared/lib/format';
import { addPeriods, OPEN_SWAP_STATUSES, PERIOD_UNIT, periodLabel } from '@ssm/shared';
import { Badge, Button, ButtonLink, Card, EmptyState, Field, KV, Modal, PageHeader, StatusBadge, cx, inputCls } from '@/shared/ui';
import { PayMethodPicker } from '@/features/payments/pay-method';
import { api } from '@/shared/api/client';
import { FloorPlanPicker, type FloorPlanUnit } from '@/features/facilities/floor-plan-picker';

type Dialog = { kind: 'pay' | 'extend' | 'moveout' | 'swap'; c: RentalContract } | null;

export default function MyUnits() {
  const { db, user, run } = useStore();
  const [dlg, setDlg] = useState<Dialog>(null);
  const [method, setMethod] = useState<PaymentMethod>('VNPAY');
  const [periods, setPeriods] = useState(3);
  const [date, setDate] = useState(addDays(todayISO(), 3).slice(0, 10));
  const [swapCandidates, setSwapCandidates] = useState<FloorPlanUnit[] | null>(null);
  const [swapUnitId, setSwapUnitId] = useState<string | null>(null);
  const [swapMethod, setSwapMethod] = useState<SwapMethod>('SELF');
  const [swapReason, setSwapReason] = useState('');
  if (!user) return null;
  const contracts = db.contracts.filter((c) => c.customerId === user._id).sort((a, b) => (a.status === 'CLOSED' ? 1 : 0) - (b.status === 'CLOSED' ? 1 : 0));
  const close = () => setDlg(null);

  // Sơ đồ ô trống cùng loại — tải khi mở dialog đổi ô, không tải sẵn cho mọi hợp đồng.
  useEffect(() => {
    if (dlg?.kind !== 'swap') return;
    let alive = true;
    setSwapCandidates(null); setSwapUnitId(null); setSwapReason(''); setSwapMethod('SELF');
    api.get<{ items: FloorPlanUnit[] }>(`/contracts/${dlg.c._id}/swap-candidates`).then((d) => alive && setSwapCandidates(d.items));
    return () => { alive = false; };
  }, [dlg]);

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
                ['Tiền thuê', `${vnd(c.billing.rate)}/${PERIOD_UNIT[c.billing.rentalPeriod]}`],
                ['Kỳ thanh toán tới', fmtDate(c.billing.nextBillingDate)],
                ['Truy cập', <span key="a" className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5" />{ACCESS_METHOD[c.access.method]}{c.access.keyTag ? ` · ${c.access.keyTag}` : ''}</span>],
                ['Tiền cọc', <span key="d">{vnd(c.deposit.amount)} · {DEPOSIT_STATUS[c.deposit.status].label}</span>],
                ['Công nợ', <span key="o" className={c.balance.outstanding ? 'text-red-700' : ''}>{vnd(c.balance.outstanding)}</span>],
              ]} /></div>
              {(() => {
                const openSwap = db.swapRequests.find((s) => s.contractId === c._id && (OPEN_SWAP_STATUSES as readonly string[]).includes(s.status));
                return (
                  <>
                    {c.status !== 'CLOSED' && (
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                        {c.balance.outstanding > 0 && <Button size="sm" onClick={() => setDlg({ kind: 'pay', c })}>Thanh toán {vnd(c.balance.outstanding)}</Button>}
                        {c.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'extend', c })}><RefreshCw className="size-3.5" />Gia hạn</Button>}
                        {c.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'moveout', c })}><PackageOpen className="size-3.5" />Đăng ký trả kho</Button>}
                        {c.status === 'ACTIVE' && !openSwap && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'swap', c })}><Repeat className="size-3.5" />Đổi ô kho</Button>}
                        {c.status === 'MOVE_OUT_PENDING' && <Badge tone="violet">Hẹn trả kho {fmtDate(c.moveOut?.scheduledFor)}</Badge>}
                        <ButtonLink href={`/portal/tickets?contract=${c._id}`} size="sm" variant="ghost"><LifeBuoy className="size-3.5" />Báo sự cố</ButtonLink>
                        <ButtonLink href="/portal/claims" size="sm" variant="ghost"><HandCoins className="size-3.5" />Yêu cầu bồi thường</ButtonLink>
                      </div>
                    )}
                    {openSwap && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-sm ring-1 ring-violet-200">
                        <span>
                          Yêu cầu đổi ô {openSwap.requestNumber} · <StatusBadge map={SWAP_REQUEST_STATUS} value={openSwap.status} />
                          {openSwap.status === 'APPROVED' && openSwap.method === 'SELF' && openSwap.moveDeadline && <> · hạn chuyển {fmtDate(openSwap.moveDeadline)}</>}
                        </span>
                        {openSwap.status === 'SUBMITTED' && (
                          <Button size="sm" variant="ghost" onClick={() => void run('cancelSwapRequest', { swapRequestId: openSwap._id }, 'Đã rút yêu cầu đổi ô')}>Rút yêu cầu</Button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
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
        footer={<Button onClick={() => dlg && void run('extendContract', { contractId: dlg.c._id, periods, method }, (v) => `Đã gia hạn ${periodLabel(dlg.c.billing.rentalPeriod, periods)} — thanh toán ${vnd(v)}`, () => close())}>Gia hạn & thanh toán</Button>}>
        <Field label={dlg ? `Số ${PERIOD_UNIT[dlg.c.billing.rentalPeriod]} gia hạn` : 'Số chu kỳ gia hạn'}>
          <select className={inputCls} value={periods} onChange={(e) => setPeriods(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{dlg ? periodLabel(dlg.c.billing.rentalPeriod, m) : m}</option>)}</select>
        </Field>
        {dlg && <p className="mt-3 text-sm">Hạn mới: <b>{fmtDate(addPeriods(dlg.c.endDate, dlg.c.billing.rentalPeriod, periods))}</b> · Số tiền: <b>{vnd(dlg.c.billing.rate * periods)}</b></p>}
        <div className="mt-4"><PayMethodPicker value={method} onChange={setMethod} /></div>
      </Modal>

      <Modal open={dlg?.kind === 'moveout'} onClose={close} title="Đăng ký trả kho"
        footer={<Button onClick={() => dlg && void run('requestMoveOut', { contractId: dlg.c._id, date: `${date}T00:00:00.000Z` }, 'Đã đăng ký trả kho', () => close())}>Xác nhận</Button>}>
        <Field label="Ngày trả kho dự kiến" hint="Nhân viên sẽ kiểm tra kho khi bạn bàn giao chìa khóa. Tiền cọc hoàn sau khi trừ chi phí hư hại (nếu có).">
          <input type="date" className={inputCls} min={todayISO().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </Modal>

      <Modal open={dlg?.kind === 'swap'} onClose={close} size="lg" title="Yêu cầu đổi ô kho"
        description="Gửi yêu cầu để Quản lý chi nhánh xét duyệt. Giá thuê và tiền cọc giữ nguyên vì chỉ đổi sang ô cùng loại."
        footer={<Button disabled={!swapUnitId || swapReason.trim().length < 5} onClick={() => dlg && swapUnitId && void run(
          'requestUnitSwap', { contractId: dlg.c._id, toUnitId: swapUnitId, method: swapMethod, reason: swapReason },
          (r) => `Đã gửi yêu cầu ${r.requestNumber} — chờ chi nhánh xét duyệt`, () => close(),
        )}>Gửi yêu cầu</Button>}>
        <div className="space-y-4">
          <Field label="Chọn ô mới trên sơ đồ">
            {swapCandidates === null ? <p className="text-sm text-stone-500">Đang tải sơ đồ…</p> : <FloorPlanPicker items={swapCandidates} value={swapUnitId} onChange={setSwapUnitId} />}
          </Field>
          <Field label="Hình thức chuyển">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SWAP_METHOD) as SwapMethod[]).map((m) => (
                <button key={m} type="button" onClick={() => setSwapMethod(m)} className={cx('rounded-lg py-2 text-sm font-medium ring-1 ring-inset', swapMethod === m ? 'bg-ink text-white ring-ink' : 'ring-stone-300 hover:bg-stone-50')}>{SWAP_METHOD[m]}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-stone-500">{swapMethod === 'SELF' ? 'Sau khi được duyệt, bạn có 7 ngày để tự chuyển đồ sang ô mới.' : 'Chi nhánh sẽ liên hệ hẹn ngày cử người chuyển giúp bạn.'}</p>
          </Field>
          <Field label="Lý do muốn đổi ô" hint="Tối thiểu 5 ký tự.">
            <textarea className={inputCls} rows={3} value={swapReason} onChange={(e) => setSwapReason(e.target.value)} placeholder="VD: Muốn đổi sang ô gần cửa ra vào hơn để dễ chở đồ." />
          </Field>
          <p className="text-xs text-stone-500">Phí đổi ô (nếu có) sẽ được chi nhánh thông báo khi duyệt — miễn phí nếu là lần đổi đầu tiên hoặc do lỗi từ chi nhánh.</p>
        </div>
      </Modal>
    </>
  );
}
