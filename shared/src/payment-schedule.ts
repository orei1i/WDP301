import type { PriceQuote } from './entities';
import { vnd } from './format';
import { PERIOD_UNIT } from './labels';

/**
 * Lịch thanh toán "1 cọc + 1 tháng đầu" — MỘT nguồn cho báo giá lúc đặt chỗ (web/app), màn thanh toán cọc,
 * màn nhận kho và điều khoản hợp đồng, để mọi nơi nói cùng một con số và khách biết trước KHOẢN THỨ HAI
 * (tiền thuê kỳ đầu, trả khi nhận kho) ngay từ lúc đặt, không bị bất ngờ ở quầy.
 */
export interface PaymentStep {
  key: 'DEPOSIT' | 'FIRST_RENT' | 'NEXT_PERIODS';
  /** "Hôm nay — khi đặt chỗ" / "Khi nhận kho" / "Các tháng sau" */
  when: string;
  title: string;
  amount: number;
  note: string;
}

export interface PaymentSchedule {
  steps: PaymentStep[];
  /** Phải trả ngay khi đặt chỗ (tiền cọc). */
  payNow: number;
  /** Trả thêm khi nhận kho (tiền thuê kỳ đầu) — khoản khách hay bỏ sót. */
  payAtCheckIn: number;
  /** Tổng chuẩn bị trước khi dùng kho = cọc + tiền thuê kỳ đầu. */
  totalBeforeUse: number;
  unit: string;
}

type QuoteLike = Pick<PriceQuote, 'depositAmount' | 'firstPeriodRent' | 'rentalPeriod'>;

/** `quotes`: một báo giá, hoặc nhiều dòng trong giỏ (cùng chu kỳ). `graceDays`: ân hạn của chính sách, nếu biết. */
export function buildPaymentSchedule(quotes: readonly QuoteLike[], graceDays?: number): PaymentSchedule {
  const unit = PERIOD_UNIT[quotes[0]?.rentalPeriod ?? 'MONTH'];
  const payNow = quotes.reduce((s, q) => s + q.depositAmount, 0);
  const payAtCheckIn = quotes.reduce((s, q) => s + q.firstPeriodRent, 0);
  return {
    unit, payNow, payAtCheckIn, totalBeforeUse: payNow + payAtCheckIn,
    steps: [
      {
        key: 'DEPOSIT', when: 'Hôm nay — khi đặt chỗ', title: 'Tiền cọc', amount: payNow,
        note: 'Giữ đến khi trả kho, hoàn lại sau khi trừ phí hư hại và công nợ (nếu có). Không trừ vào tiền thuê.',
      },
      {
        key: 'FIRST_RENT', when: 'Khi nhận kho', title: `Tiền thuê ${unit} đầu`, amount: payAtCheckIn,
        note: 'Khoản riêng, trả THÊM ngoài tiền cọc — thanh toán tại quầy khi nhân viên bàn giao kho (tiền mặt, thẻ, VNPay hoặc chuyển khoản).',
      },
      {
        key: 'NEXT_PERIODS', when: `Các ${unit} sau`, title: `Tiền thuê mỗi ${unit}`, amount: payAtCheckIn,
        note: `Hoá đơn xuất vào đầu mỗi kỳ${graceDays !== undefined ? `, trả trong vòng ${graceDays} ngày — quá hạn bị tính phí trễ` : ''}.`,
      },
    ],
  };
}

/** Câu khách tick xác nhận trước khi đặt chỗ. */
export const paymentAckText = (s: Pick<PaymentSchedule, 'payNow' | 'payAtCheckIn' | 'unit'>) =>
  `Tôi hiểu rằng hôm nay chỉ thanh toán tiền cọc ${vnd(s.payNow)}; tiền thuê ${s.unit} đầu ${vnd(s.payAtCheckIn)} sẽ thanh toán THÊM khi nhận kho (ngoài khoản cọc).`;

/** Dòng tóm tắt dưới lịch thanh toán. */
export const paymentTotalText = (s: Pick<PaymentSchedule, 'payNow' | 'payAtCheckIn' | 'totalBeforeUse'>) =>
  `Tổng cần chuẩn bị trước khi dùng kho: ${vnd(s.totalBeforeUse)} (${vnd(s.payNow)} hôm nay + ${vnd(s.payAtCheckIn)} khi nhận kho).`;
