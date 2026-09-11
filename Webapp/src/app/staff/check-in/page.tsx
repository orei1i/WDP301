'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CircleCheck, KeyRound, ScanLine, Search, TriangleAlert } from 'lucide-react';
import type { AccessMethod, PaymentMethod, Reservation } from '@ssm/shared';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { ACCESS_METHOD, RESERVATION_STATUS } from '@/lib/labels';
import { byId, facilityName, inScope, typeName, unitLabel, userName } from '@/lib/domain';
import { fmtDate, todayISO, vnd } from '@/lib/format';
import { Button, ButtonLink, Card, CardHeader, Field, KV, PageHeader, StatusBadge, cx, inputCls } from '@/components/ui';
import { PayMethodPicker } from '@/components/pay-method';

function CheckInInner() {
  const { db, user, run, refresh } = useStore();
  const sp = useSearchParams();
  const [code, setCode] = useState(sp.get('code') ?? '');
  const [found, setFound] = useState<Reservation | null>(null);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<AccessMethod>('PIN');
  const [keyTag, setKeyTag] = useState('');
  const [pay, setPay] = useState<PaymentMethod>('CASH');
  const [done, setDone] = useState<{ pin?: string; contract: string; unit: string } | null>(null);
  useEffect(() => { const c = sp.get('code'); if (c) void lookup(c); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const r = found ? db.reservations.find((x) => x._id === found._id) ?? null : null;
  const arrivals = db.reservations.filter((x) => x.status === 'ALLOCATED' && x.startDate <= todayISO() && inScope(db, user, x.facilityId));

  // Server-side lookup: enforces facility scope (out-of-scope codes are written to the audit log as DENIED)
  const lookup = async (c = code) => {
    setDone(null); setError('');
    if (!c.trim()) return;
    try {
      const res = await api.get<{ reservation: Reservation; qrValid: boolean | null }>(`/reservations/lookup?code=${encodeURIComponent(c.trim())}`);
      if (!db.reservations.some((x) => x._id === res.reservation._id)) await refresh();
      setFound(res.reservation);
      if (res.qrValid === false) setError('Mã QR không khớp — kiểm tra giấy tờ khách trước khi bàn giao');
    } catch (e) {
      setFound(null);
      setError(e instanceof Error ? e.message : 'Không tra cứu được');
    }
  };

  const confirm = async () => {
    if (!r) return;
    const res = await run('checkIn', { reservationId: r._id, accessMethod: method, keyTag: keyTag || undefined, payMethod: pay }, 'Nhận kho thành công — hợp đồng đã kích hoạt');
    if (res.ok) setDone({ pin: res.value.pin, contract: res.value.contract.contractNumber, unit: res.value.unit.unitNumber });
  };

  const blockers: string[] = [];
  if (r) {
    if (r.status !== 'ALLOCATED') blockers.push(r.status === 'CONFIRMED' ? 'Đặt chỗ chưa được phân kho — cần Quản lý chi nhánh phân kho trước.' : `Trạng thái "${RESERVATION_STATUS[r.status].label}" không cho phép nhận kho.`);
    if (r.startDate > todayISO()) blockers.push(`Chưa đến ngày nhận kho (${fmtDate(r.startDate)}).`);
    const c = byId(db.users, r.customerId);
    if (c?.status === 'SUSPENDED') blockers.push('Tài khoản khách đang bị tạm khóa.');
  }

  return (
    <>
      <PageHeader title="Nhận kho (check-in)" description="Quét mã QR của khách hoặc nhập mã đặt chỗ, xác minh giấy tờ và bàn giao quyền truy cập." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
              <div className="relative min-w-60 flex-1">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input className={cx(inputCls, 'pl-9 font-mono uppercase')} placeholder="RSV-260911-XXXXXX" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Button type="submit"><Search className="size-4" />Tra cứu</Button>
            </form>
            {error && <p className="mt-3 flex items-center gap-2 text-sm text-red-700"><TriangleAlert className="size-4" />{error}</p>}
          </Card>

          {done && (
            <Card className="border-emerald-200 bg-emerald-50 p-5">
              <p className="flex items-center gap-2 font-semibold text-emerald-800"><CircleCheck className="size-5" />Đã bàn giao kho {done.unit}</p>
              <p className="mt-1 text-sm text-emerald-900">Hợp đồng {done.contract} đã kích hoạt, tiền thuê tháng đầu đã ghi nhận.</p>
              {done.pin && <p className="mt-3 text-sm">Mã PIN truy cập (chỉ hiển thị một lần): <span className="ml-1 rounded-md bg-white px-2 py-1 font-mono text-lg font-bold tracking-[0.3em] text-ink ring-1 ring-emerald-200">{done.pin}</span></p>}
              <div className="mt-4"><ButtonLink href="/staff" variant="secondary" size="sm">Về hàng đợi</ButtonLink></div>
            </Card>
          )}

          {r && !done && (
            <Card>
              <CardHeader title={`Đặt chỗ ${r.code}`} actions={<StatusBadge map={RESERVATION_STATUS} value={r.status} />} />
              <div className="p-5">
                <KV items={[
                  ['Khách hàng', userName(db, r.customerId)],
                  ['CCCD (4 số cuối)', byId(db.users, r.customerId)?.customerProfile?.idNumberLast4 ?? 'Kiểm tra tại quầy'],
                  ['Chi nhánh', facilityName(db, r.facilityId)], ['Loại kho', typeName(db, r.unitTypeId)],
                  ['Kho được phân', unitLabel(db, r.unitId)], ['Ngày nhận', fmtDate(r.startDate)],
                  ['Thời hạn', `${r.durationMonths} tháng`], ['Tiền cọc', r.depositPaymentId ? `${vnd(r.quote.depositAmount)} · đã thu` : 'Chưa thu'],
                ]} />
                {blockers.length > 0 ? (
                  <div className="mt-5 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blockers.map((b) => <p key={b} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{b}</p>)}</div>
                ) : (
                  <div className="mt-6 grid gap-5 border-t border-stone-100 pt-5 md:grid-cols-2">
                    <div className="space-y-4">
                      <Field label="Hình thức truy cập">
                        <div className="grid grid-cols-3 gap-2">
                          {(Object.keys(ACCESS_METHOD) as AccessMethod[]).map((m) => (
                            <button key={m} type="button" onClick={() => setMethod(m)} className={cx('rounded-lg py-2 text-xs font-medium ring-1 ring-inset', method === m ? 'bg-ink text-white ring-ink' : 'ring-stone-300')}>{ACCESS_METHOD[m]}</button>
                          ))}
                        </div>
                      </Field>
                      {method !== 'PIN' && <Field label={method === 'PHYSICAL_KEY' ? 'Mã thẻ chìa khóa' : 'Số thẻ từ'}><input className={inputCls} value={keyTag} onChange={(e) => setKeyTag(e.target.value)} placeholder={method === 'PHYSICAL_KEY' ? `K-${unitLabel(db, r.unitId)}` : 'RF-000123'} /></Field>}
                    </div>
                    <Field label={`Thu tiền thuê tháng đầu · ${vnd(r.quote.firstPeriodRent)}`}>
                      <PayMethodPicker value={pay} onChange={setPay} methods={['CASH', 'CARD', 'VNPAY', 'BANK_TRANSFER']} />
                    </Field>
                    <Button size="lg" className="md:col-span-2" onClick={() => void confirm()}><KeyRound className="size-4" />Xác nhận bàn giao kho</Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="Sẵn sàng nhận kho" description="Đã phân kho, đến ngày" />
          <ul className="divide-y divide-stone-100">
            {arrivals.length === 0 && <li className="px-5 py-6 text-sm text-stone-500">Không có lượt nào.</li>}
            {arrivals.map((x) => (
              <li key={x._id}>
                <button onClick={() => { setCode(x.code); void lookup(x.code); }} className="w-full px-5 py-3 text-left hover:bg-stone-50">
                  <p className="text-sm font-medium">{userName(db, x.customerId)}</p>
                  <p className="font-mono text-xs text-stone-500">{x.code} · {unitLabel(db, x.unitId)}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default function CheckInPage() {
  return <Suspense><CheckInInner /></Suspense>;
}
