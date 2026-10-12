import type { AccessMethod, RentalPeriod } from './enums';
import type { BusinessPolicy, PriceQuote } from './entities';
import { fmtDate, vnd } from './format';
import { ACCESS_METHOD, PERIOD_UNIT, periodLabel } from './labels';
import { TERMS_VERSION } from './legal';
import { abandonDaysOf, earlyTerminationOf } from './policy-defaults';
import { surchargeLines } from './surcharge';
import { DEFAULT_CONTRACT_CLAUSES, renderContractTemplate, type ContractTemplateClause, type ContractVariableValues, type RenderedClause } from './contract-template';

/**
 * Nội dung hợp đồng thuê kho — MỘT nguồn duy nhất cho bản xem trên web, trên mobile và file PDF gửi email.
 * Lời văn nằm ở MẪU HỢP ĐỒNG (contract-template.ts — Quản lý vận hành soạn được); file này tính GIÁ TRỊ các biến
 * từ đặt chỗ + chính sách rồi ghép vào mẫu. Chỉ nhận dữ liệu thuần (không đọc DB).
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
  quote: Pick<PriceQuote, 'rate' | 'surchargeAmount' | 'discountAmount' | 'firstPeriodRent' | 'depositAmount' | 'policyVersion'>
    & Partial<Pick<PriceQuote, 'appliedRuleCodes' | 'depositPeriods' | 'firstPeriodAtBooking'>>;
  depositPaid: boolean;
  /** Phiên bản Điều khoản khách đã ký (signature.termsVersion). Bỏ trống = phiên bản hiện hành (hợp đồng chưa ký). */
  termsVersion?: string | null;
  policy: Pick<BusinessPolicy, 'gracePeriodDays' | 'lockoutAfterDays' | 'cancellation'>
    & Partial<Pick<BusinessPolicy, 'earlyTermination' | 'abandonAfterLockedOutDays' | 'surcharges'>>;
}

export type ContractClause = RenderedClause;

/** Các điều có từ Điều khoản v1.2 — hợp đồng đã ký bản cũ (và không có bản lưu nguyên văn) không hiện điều khoản khách chưa từng thấy. */
const ACK_CLAUSE_SINCE = '1.2';
const CLAUSES_SINCE_1_2 = ['can-cu', 'dien-tu', 'xac-nhan'];
const versionGte = (a: string, b: string) => {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
};

const hoursText = (h: number) => (h >= 24 && h % 24 === 0 ? `${h} giờ (${h / 24} ngày)` : `${h} giờ`);

/** Các bậc hoàn tiền khi HỦY ĐẶT CHỖ (trước ngày nhận kho), viết thành khoảng thời gian rõ ràng. */
function cancellationLines(policy: ContractTextInput['policy'], base: string) {
  const tiers = [...policy.cancellation].sort((a, b) => b.minHoursBeforeStart - a.minHoursBeforeStart);
  const lines = tiers.map((t, i) => {
    const upper = tiers[i - 1]?.minHoursBeforeStart;
    const when = t.minHoursBeforeStart > 0
      ? upper === undefined
        ? `Hủy trước ngày nhận kho từ ${hoursText(t.minHoursBeforeStart)} trở lên`
        : `Hủy trước ngày nhận kho từ ${hoursText(t.minHoursBeforeStart)} đến dưới ${hoursText(upper)}`
      : upper === undefined ? 'Hủy bất kỳ lúc nào trước ngày nhận kho' : `Hủy trước ngày nhận kho dưới ${hoursText(upper)}`;
    return `${when}: ${t.depositRefundPct > 0 ? `hoàn ${t.depositRefundPct}%` : 'KHÔNG hoàn'} ${base}.`;
  });
  lines.push(`Không đến nhận kho theo lịch đã đặt và không hủy trước: KHÔNG hoàn ${base}.`);
  return lines;
}

/** Khoảng % kỳ hạn đã dùng của từng bậc hoàn tiền giữ chân khi trả kho sớm, theo thứ tự tăng dần. */
function earlyTerminationLines(policy: ContractTextInput['policy']) {
  const tiers = [...earlyTerminationOf(policy)].sort((a, b) => a.maxElapsedPct - b.maxElapsedPct);
  return tiers.map((t, i) => {
    const prev = tiers[i - 1]?.maxElapsedPct;
    const range = prev === undefined ? `đã dùng đến ${t.maxElapsedPct}% kỳ hạn` : i === tiers.length - 1 ? `đã dùng trên ${prev}% kỳ hạn` : `đã dùng trên ${prev}% đến ${t.maxElapsedPct}% kỳ hạn`;
    return `Trả kho sớm khi ${range}: hoàn ${t.depositRefundPct}% tiền giữ chân.`;
  });
}

/**
 * Giá trị mọi biến của mẫu hợp đồng cho một đặt chỗ. Các biến KHỐI (khoản thanh toán, mức hoàn…) là câu do hệ thống
 * soạn vì chứa con số ràng buộc — người soạn mẫu chỉ đặt vị trí, không sửa nội dung.
 */
export function contractVariables(i: ContractTextInput): ContractVariableValues {
  const unit = PERIOD_UNIT[i.rentalPeriod];
  const q = i.quote;
  const prepaid = !!q.firstPeriodAtBooking;
  const holdPeriods = q.depositPeriods ?? 1;
  const total = q.depositAmount + q.firstPeriodRent;
  // Khoản hoàn khi hủy đặt chỗ tính trên TẤT CẢ số tiền đã thanh toán lúc đặt chỗ.
  const refundBase = prepaid ? 'số tiền đã thanh toán khi đặt chỗ (tiền giữ chân và tiền thuê kỳ đầu)' : 'tiền giữ chân';

  const unitBits = [
    i.unitTypeName,
    i.unitNumber ? `ô ${i.unitNumber}${i.floor != null ? ` (tầng ${i.floor}${i.zone ? `, ${i.zone}` : ''})` : ''}` : null,
    i.areaM2 ? `diện tích ${i.areaM2} m²` : null,
    i.accessMethod ? `hình thức khoá: ${ACCESS_METHOD[i.accessMethod]}` : null,
  ].filter(Boolean).join(', ');

  // Phụ phí luôn kèm tên gọi, cách tính và lý do — không ghi trơ trọi "phụ phí".
  const surcharges = surchargeLines({ rate: q.rate, surchargeAmount: q.surchargeAmount, appliedRuleCodes: q.appliedRuleCodes ?? ['CLIMATE'] }, i.policy.surcharges)
    .map((s) => `${s.label}: +${vnd(s.amount)} mỗi ${unit}${s.basis ? ` (${s.basis})` : ''}. ${s.reason}`);

  return {
    values: {
      ben_cho_thue: `KhoAn — ${i.facilityName}${i.facilityAddress ? `, ${i.facilityAddress}` : ''}`,
      ben_thue: i.customerName,
      doi_tuong: unitBits,
      dieu_hoa: i.useAirConditioning ? 'có sử dụng (tính phụ phí điều hòa nhiệt độ nêu tại Điều 4)' : 'không sử dụng (không tính phụ phí)',
      ngay_bat_dau: fmtDate(i.startDate),
      thoi_han: periodLabel(i.rentalPeriod, i.periods),
      ngay_ket_thuc: fmtDate(i.endDate),
      don_vi: unit,
      gia_thue: vnd(q.rate),
      tien_thue_moi_ky: vnd(q.firstPeriodRent),
      tien_giu_chan: vnd(q.depositAmount),
      tien_thue_ky_dau: vnd(q.firstPeriodRent),
      tong_truoc_khi_dung: vnd(total),
      an_han_ngay: String(i.policy.gracePeriodDays),
      khoa_sau_ngay: String(i.policy.lockoutAfterDays),
      bo_lai_sau_ngay: String(abandonDaysOf(i.policy)),
      phien_ban_dieu_khoan: i.termsVersion ?? TERMS_VERSION,
      phien_ban_chinh_sach: String(q.policyVersion),
    },
    blocks: {
      dong_phu_phi: surcharges,
      dong_uu_dai: [
        ...(q.discountAmount > 0 ? [`Ưu đãi thuê dài hạn: −${vnd(q.discountAmount)} mỗi ${unit}.`] : []),
        ...(q.surchargeAmount > 0 || q.discountAmount > 0 ? [`Tiền thuê Bên thuê phải trả mỗi ${unit} (sau phụ phí và ưu đãi): ${vnd(q.firstPeriodRent)}.`] : []),
      ],
      khoan_giu_chan: [
        `Khoản 1 — Tiền giữ chân (còn gọi là tiền cọc): ${vnd(q.depositAmount)}${i.depositPaid ? ' (đã thanh toán)' : ''}, trả khi đặt chỗ${holdPeriods > 1 ? `, bằng ${holdPeriods} ${unit} tiền thuê (kho cỡ lớn)` : ''}. Khoản này giữ ô kho đã chọn cho Bên thuê và bảo đảm việc thực hiện hợp đồng; được giữ đến khi trả kho — không trừ vào tiền thuê — và hoàn lại sau khi trừ chi phí hư hại, công nợ (nếu có), theo mức hoàn nêu tại Điều 5.`,
      ],
      khoan_tien_thue_ky_dau: [
        prepaid
          ? `Khoản 2 — Tiền thuê ${unit} đầu: ${vnd(q.firstPeriodRent)}, thanh toán CÙNG LÚC đặt chỗ (kho cỡ lớn), nên tổng trả khi đặt chỗ là ${vnd(total)}. Bên thuê không phải trả thêm tiền thuê kỳ đầu khi nhận kho.`
          : `Khoản 2 — Tiền thuê ${unit} đầu: ${vnd(q.firstPeriodRent)}, thanh toán THÊM ngoài tiền giữ chân, tại quầy khi nhân viên bàn giao kho.`,
      ],
      muc_hoan_khi_huy: cancellationLines(i.policy, refundBase),
      muc_hoan_tra_som: earlyTerminationLines(i.policy),
    },
  };
}

/** Dựng các điều khoản của một hợp đồng từ mẫu (`clauses`, mặc định = mẫu chuẩn của hệ thống). */
export function buildContractClauses(i: ContractTextInput, clauses: readonly ContractTemplateClause[] = DEFAULT_CONTRACT_CLAUSES): ContractClause[] {
  const legacy = !!i.termsVersion && !versionGte(i.termsVersion, ACK_CLAUSE_SINCE);
  return renderContractTemplate(clauses, contractVariables(i), legacy ? CLAUSES_SINCE_1_2 : []);
}

const SAMPLE_POLICY: ContractTextInput['policy'] = {
  gracePeriodDays: 5, lockoutAfterDays: 15, abandonAfterLockedOutDays: 30,
  cancellation: [{ minHoursBeforeStart: 72, depositRefundPct: 100 }, { minHoursBeforeStart: 24, depositRefundPct: 50 }, { minHoursBeforeStart: 0, depositRefundPct: 0 }],
  surcharges: [{ code: 'CLIMATE', label: 'Kho điều hòa nhiệt độ', kind: 'PERCENT', value: 10, categories: ['SMALL', 'MEDIUM', 'LARGE', 'XL'] }],
};

/** Hai hợp đồng mẫu để XEM TRƯỚC khi soạn mẫu: kho thường (có điều hòa + ưu đãi) và kho cỡ lớn (trả tiền thuê kỳ đầu lúc đặt). */
export const SAMPLE_CONTRACT_INPUTS: Record<'STANDARD' | 'LARGE', ContractTextInput> = {
  STANDARD: {
    code: 'RSV-MẪU', facilityName: 'KhoAn Quận 7', facilityAddress: '88 Nguyễn Thị Thập, Quận 7', customerName: 'Nguyễn Văn A',
    unitTypeName: 'Phòng S', unitNumber: 'S1-08', floor: 1, zone: 'Khu Thẻ khoá', areaM2: 3, accessMethod: 'RFID_CARD', useAirConditioning: true,
    rentalPeriod: 'MONTH', periods: 3, startDate: '2026-11-01T00:00:00.000Z', endDate: '2027-02-01T00:00:00.000Z',
    quote: { rate: 990_000, surchargeAmount: 99_000, discountAmount: 108_900, firstPeriodRent: 980_100, depositAmount: 1_089_000, policyVersion: 3, appliedRuleCodes: ['CLIMATE', 'DAI_HAN_3'], depositPeriods: 1, firstPeriodAtBooking: false },
    depositPaid: false, policy: SAMPLE_POLICY,
  },
  LARGE: {
    code: 'RSV-MẪU', facilityName: 'KhoAn Quận 7', facilityAddress: '88 Nguyễn Thị Thập, Quận 7', customerName: 'Nguyễn Văn A',
    unitTypeName: 'Phòng L', unitNumber: 'L2-13', floor: 2, zone: 'Khu Mật khẩu', areaM2: 12, accessMethod: 'PIN', useAirConditioning: false,
    rentalPeriod: 'MONTH', periods: 1, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-01T00:00:00.000Z',
    quote: { rate: 3_200_000, surchargeAmount: 0, discountAmount: 0, firstPeriodRent: 3_200_000, depositAmount: 6_400_000, policyVersion: 3, appliedRuleCodes: [], depositPeriods: 2, firstPeriodAtBooking: true },
    depositPaid: false, policy: SAMPLE_POLICY,
  },
};
