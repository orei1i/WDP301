import type { AccessMethod, RentalPeriod } from './enums';
import type { BusinessPolicy, PriceQuote } from './entities';
import { fmtDate, vnd } from './format';
import { ACCESS_METHOD, PERIOD_UNIT, periodLabel } from './labels';
import { TERMS_VERSION } from './legal';
import { abandonDaysOf, earlyTerminationOf } from './policy-defaults';

/**
 * Nội dung hợp đồng thuê kho — MỘT nguồn duy nhất cho bản xem trên web, trên mobile và file PDF gửi
 * email, để ba nơi không bao giờ lệch nhau. Chỉ nhận dữ liệu thuần (không đọc DB), trả về các điều khoản
 * đã soạn sẵn để mỗi nơi tự dàn trang.
 */
export interface ContractTextInput {
  code: string;                              // mã đặt chỗ
  contractNumber?: string | null;            // chỉ có sau khi nhận kho
  facilityName: string;
  facilityAddress?: string | null;
  customerName: string;
  unitTypeName: string;
  unitNumber?: string | null;
  floor?: number | null;
  zone?: string | null;
  areaM2?: number | null;
  accessMethod?: AccessMethod | null;
  useAirConditioning: boolean;
  rentalPeriod: RentalPeriod;
  periods: number;
  startDate: string;
  endDate: string;
  quote: Pick<PriceQuote, 'rate' | 'surchargeAmount' | 'discountAmount' | 'firstPeriodRent' | 'depositAmount' | 'policyVersion'>;
  depositPaid: boolean;
  policy: Pick<BusinessPolicy, 'gracePeriodDays' | 'lockoutAfterDays' | 'cancellation'> & Partial<Pick<BusinessPolicy, 'earlyTermination' | 'abandonAfterLockedOutDays'>>;
}

export interface ContractClause { title: string; paragraphs: string[]; bullets: string[] }

/** Khoảng % kỳ hạn đã dùng của từng bậc hoàn cọc khi trả kho sớm, theo thứ tự tăng dần. */
function earlyTerminationLines(policy: ContractTextInput['policy']) {
  const tiers = [...earlyTerminationOf(policy)].sort((a, b) => a.maxElapsedPct - b.maxElapsedPct);
  return tiers.map((t, i) => {
    const prev = tiers[i - 1]?.maxElapsedPct;
    const range = prev === undefined ? `đã dùng đến ${t.maxElapsedPct}% kỳ hạn` : i === tiers.length - 1 ? `đã dùng trên ${prev}% kỳ hạn` : `đã dùng trên ${prev}% đến ${t.maxElapsedPct}% kỳ hạn`;
    return `Trả kho sớm khi ${range}: hoàn ${t.depositRefundPct}% tiền cọc.`;
  });
}

export function buildContractClauses(i: ContractTextInput): ContractClause[] {
  const unit = PERIOD_UNIT[i.rentalPeriod];
  const q = i.quote;
  const cancel = [...i.policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart)
    .map((t) => `${t.minHoursBeforeStart > 0 ? `Hủy trước ngày nhận ≥ ${t.minHoursBeforeStart} giờ` : 'Hủy sát ngày nhận'}: hoàn ${t.depositRefundPct}% tiền cọc.`);

  const unitBits = [
    i.unitTypeName,
    i.unitNumber ? `ô ${i.unitNumber}${i.floor != null ? ` (tầng ${i.floor}${i.zone ? `, ${i.zone}` : ''})` : ''}` : null,
    i.areaM2 ? `diện tích ${i.areaM2} m²` : null,
    i.accessMethod ? `hình thức khoá: ${ACCESS_METHOD[i.accessMethod]}` : null,
  ].filter(Boolean).join(', ');

  const price = [`Giá thuê mỗi ${unit}: ${vnd(q.rate)}`];
  if (q.surchargeAmount > 0) price.push(`phụ phí điều hòa ${vnd(q.surchargeAmount)}`);
  if (q.discountAmount > 0) price.push(`ưu đãi thuê dài hạn −${vnd(q.discountAmount)}`);

  return [
    {
      title: '1. Các bên',
      paragraphs: [
        `Bên cho thuê: KhoAn — ${i.facilityName}${i.facilityAddress ? `, ${i.facilityAddress}` : ''}.`,
        `Bên thuê: ${i.customerName}.`,
      ],
      bullets: [],
    },
    {
      title: '2. Đối tượng thuê',
      paragraphs: [`${unitBits}. Điều hòa: ${i.useAirConditioning ? 'có sử dụng (tính phụ phí)' : 'không sử dụng'}.`],
      bullets: [],
    },
    {
      title: '3. Thời hạn',
      paragraphs: [`Từ ngày ${fmtDate(i.startDate)}, thời hạn ${periodLabel(i.rentalPeriod, i.periods)} (dự kiến đến ${fmtDate(i.endDate)}). Hết hạn mà chưa gia hạn hay trả kho, tiền thuê tiếp tục được tính theo giá cũ cho đến khi bên thuê trả kho.`],
      bullets: [],
    },
    {
      title: '4. Giá và thanh toán',
      paragraphs: [],
      bullets: [
        `${price.join(', ')}.`,
        `Tiền cọc ${vnd(q.depositAmount)}${i.depositPaid ? ' (đã thanh toán)' : ''}: thanh toán khi đặt chỗ, được giữ đến khi trả kho — không trừ vào tiền thuê — và hoàn lại sau khi trừ chi phí hư hại, công nợ (nếu có).`,
        `Tiền thuê kỳ đầu ${vnd(q.firstPeriodRent)}: thanh toán khi nhận kho.`,
        `Các kỳ sau thanh toán theo từng ${unit} vào đầu mỗi kỳ — không phải trả trước toàn bộ thời hạn. Bên thuê cũng có thể gia hạn và trả trước thêm.`,
        `Quá hạn thanh toán quá ${i.policy.gracePeriodDays} ngày bị tính phí trễ; quá ${i.policy.lockoutAfterDays} ngày bị khoá truy cập.`,
      ],
    },
    {
      title: '5. Hủy, trả kho sớm và hàng bỏ lại',
      paragraphs: [],
      bullets: [
        ...cancel,
        ...earlyTerminationLines(i.policy),
        `Bị khoá truy cập quá ${abandonDaysOf(i.policy)} ngày mà không đóng tiền hay liên hệ: chi nhánh được kiểm kê, thanh lý đồ trong kho và giữ toàn bộ tiền cọc.`,
      ],
    },
    {
      title: '6. Điều khoản chung',
      paragraphs: [`Hai bên thực hiện theo Điều khoản thuê kho (v${TERMS_VERSION}) và chính sách phiên bản v${q.policyVersion} áp dụng tại thời điểm đặt chỗ.`],
      bullets: [],
    },
  ];
}
