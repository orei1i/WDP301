'use client';

import { useEffect, useState } from 'react';
import { PERIOD_UNIT, type ExtensionQuote } from '@ssm/shared';
import { api } from '@/shared/api/client';
import { fmtDate, vnd } from '@/shared/lib/format';

/** Báo giá gia hạn lấy từ server mỗi khi khách đổi số kỳ — gia hạn là cam kết mới nên giá và ưu đãi tính lại, không dùng giá cũ. */
export function useExtensionQuote(contractId: string | undefined, periods: number) {
  const [state, setState] = useState<{ key: string; quote: ExtensionQuote | null; error: string }>({ key: '', quote: null, error: '' });
  const key = contractId ? `${contractId}:${periods}` : '';
  useEffect(() => {
    if (!contractId) return;
    let alive = true;
    api.get<ExtensionQuote>(`/contracts/${contractId}/extension-quote?periods=${periods}`)
      .then((quote) => alive && setState({ key: `${contractId}:${periods}`, quote, error: '' }))
      .catch((e) => alive && setState({ key: `${contractId}:${periods}`, quote: null, error: e instanceof Error ? e.message : 'Không tính được giá gia hạn' }));
    return () => { alive = false; };
  }, [contractId, periods]);
  return state.key === key ? state : { key, quote: null, error: '' };
}

export function ExtensionQuoteSummary({ quote, error }: { quote: ExtensionQuote | null; error: string }) {
  if (error) return <p className="mt-3 text-sm text-red-700">{error}</p>;
  if (!quote) return <p className="mt-3 text-sm text-stone-500">Đang tính giá gia hạn…</p>;
  const unit = PERIOD_UNIT[quote.rentalPeriod];
  return (
    <div className="mt-3 space-y-1.5 rounded-lg bg-stone-50 p-3 text-sm ring-1 ring-inset ring-stone-200">
      <p className="flex justify-between"><span className="text-stone-600">Kỳ gia hạn</span><b>{fmtDate(quote.from)} → {fmtDate(quote.newEndDate)}</b></p>
      <p className="flex justify-between"><span className="text-stone-600">Giá niêm yết hiện hành</span><span className="tabular-nums">{vnd(quote.gross)}/{unit}</span></p>
      <p className="flex justify-between"><span className="text-stone-600">Ưu đãi theo thời gian gia hạn</span><span className="tabular-nums">{quote.discountAmount > 0 ? `−${vnd(quote.discountAmount)}/${unit}` : 'không có'}</span></p>
      <p className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold"><span>Tiền thuê trong kỳ gia hạn</span><span className="tabular-nums">{vnd(quote.rate)}/{unit}</span></p>
      <p className="text-xs leading-relaxed text-stone-500">
        Gia hạn là một cam kết mới: ưu đãi tính theo số {unit} gia hạn, không cộng dồn thời gian đã thuê. Bạn đang trả {vnd(quote.currentRate)}/{unit}.{' '}
        {quote.payNow > 0
          ? `Thuê theo ${unit}: trả trọn ${vnd(quote.payNow)} ngay khi gia hạn, không hoàn các ${unit} chưa dùng.`
          : 'Không phải trả trước — tiền thuê vẫn xuất hoá đơn từng tháng. Tiền giữ chân giữ nguyên. Trả kho trước khi hết kỳ gia hạn thì áp mức hoàn và thu hồi ưu đãi của kỳ này.'}
      </p>
    </div>
  );
}
