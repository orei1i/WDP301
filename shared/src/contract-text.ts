import type { AccessMethod, RentalPeriod } from './enums';
import type { BusinessPolicy, PriceQuote } from './entities';
import { fmtDate, vnd } from './format';
import { ACCESS_METHOD, PERIOD_UNIT, periodLabel } from './labels';
import { TERMS_VERSION } from './legal';
import { abandonDaysOf, earlyTerminationOf } from './policy-defaults';
import { surchargeLines } from './surcharge';

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
  quote: Pick<PriceQuote, 'rate' | 'surchargeAmount' | 'discountAmount' | 'firstPeriodRent' | 'depositAmount' | 'policyVersion'>
    & Partial<Pick<PriceQuote, 'appliedRuleCodes' | 'depositPeriods' | 'firstPeriodAtBooking'>>;
  depositPaid: boolean;
  /** Phiên bản Điều khoản khách đã ký (signature.termsVersion). Bỏ trống = phiên bản hiện hành (hợp đồng chưa ký). */
  termsVersion?: string | null;
  policy: Pick<BusinessPolicy, 'gracePeriodDays' | 'lockoutAfterDays' | 'cancellation'>
    & Partial<Pick<BusinessPolicy, 'earlyTermination' | 'abandonAfterLockedOutDays' | 'surcharges'>>;
}

export interface ContractClause { title: string; paragraphs: string[]; bullets: string[] }

/** Căn cứ giao kết, điều khoản ký điện tử và "xác nhận thuê kho, giới hạn trách nhiệm" có từ Điều khoản v1.2 — hợp đồng đã ký bản cũ không hiện điều khoản khách chưa từng thấy. */
const ACK_CLAUSE_SINCE = '1.2';
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

export function buildContractClauses(i: ContractTextInput): ContractClause[] {
  const unit = PERIOD_UNIT[i.rentalPeriod];
  const q = i.quote;
  const prepaid = !!q.firstPeriodAtBooking;
  const holdPeriods = q.depositPeriods ?? 1;
  // Khoản hoàn khi hủy đặt chỗ tính trên TẤT CẢ số tiền đã thanh toán lúc đặt chỗ.
  const refundBase = prepaid ? 'số tiền đã thanh toán khi đặt chỗ (tiền giữ chân và tiền thuê kỳ đầu)' : 'tiền giữ chân';
  const showAck = !i.termsVersion || versionGte(i.termsVersion, ACK_CLAUSE_SINCE);

  const unitBits = [
    i.unitTypeName,
    i.unitNumber ? `ô ${i.unitNumber}${i.floor != null ? ` (tầng ${i.floor}${i.zone ? `, ${i.zone}` : ''})` : ''}` : null,
    i.areaM2 ? `diện tích ${i.areaM2} m²` : null,
    i.accessMethod ? `hình thức khoá: ${ACCESS_METHOD[i.accessMethod]}` : null,
  ].filter(Boolean).join(', ');

  // Phụ phí luôn kèm tên gọi, cách tính và lý do — không ghi trơ trọi "phụ phí".
  const surcharges = surchargeLines({ rate: q.rate, surchargeAmount: q.surchargeAmount, appliedRuleCodes: q.appliedRuleCodes ?? ['CLIMATE'] }, i.policy.surcharges)
    .map((s) => `${s.label}: +${vnd(s.amount)} mỗi ${unit}${s.basis ? ` (${s.basis})` : ''}. ${s.reason}`);

  const total = q.depositAmount + q.firstPeriodRent;

  const clauses: ContractClause[] = [];
  const add = (title: string, paragraphs: string[], bullets: string[] = []) => { clauses.push({ title: `Điều ${clauses.filter((c) => c.title.startsWith('Điều')).length + 1}. ${title}`, paragraphs, bullets }); };

  if (showAck) {
    clauses.push({
      title: 'Căn cứ giao kết',
      paragraphs: [
        'Hợp đồng này được giao kết trên cơ sở tự nguyện, bình đẳng của hai bên, căn cứ Bộ luật Dân sự năm 2015 (các quy định về hợp đồng thuê tài sản và về đặt cọc), Luật Giao dịch điện tử năm 2023 và Luật Bảo vệ quyền lợi người tiêu dùng năm 2023.',
      ],
      bullets: [],
    });
  }

  add('Các bên', [
    `Bên cho thuê: KhoAn — ${i.facilityName}${i.facilityAddress ? `, ${i.facilityAddress}` : ''}.`,
    `Bên thuê: ${i.customerName}.`,
  ]);

  add('Đối tượng và mục đích thuê', [
    `${unitBits}. Điều hòa: ${i.useAirConditioning ? 'có sử dụng (tính phụ phí điều hòa nhiệt độ nêu tại Điều 4)' : 'không sử dụng (không tính phụ phí)'}.`,
    'Bên thuê thuê không gian nêu trên để tự lưu trữ tài sản hợp pháp của mình. Đây là hợp đồng thuê không gian lưu trữ, không phải hợp đồng gửi giữ tài sản: Bên cho thuê không kiểm đếm, không định giá và không quản lý tài sản bên trong ô kho.',
  ]);

  add('Thời hạn', [`Từ ngày ${fmtDate(i.startDate)}, thời hạn ${periodLabel(i.rentalPeriod, i.periods)} (dự kiến đến ${fmtDate(i.endDate)}). Hết hạn mà chưa gia hạn hay trả kho, tiền thuê tiếp tục được tính theo giá cũ cho đến khi Bên thuê trả kho.`]);

  add('Giá và thanh toán', [], [
    `Giá thuê mỗi ${unit}: ${vnd(q.rate)}.`,
    ...surcharges,
    ...(q.discountAmount > 0 ? [`Ưu đãi thuê dài hạn: −${vnd(q.discountAmount)} mỗi ${unit}.`] : []),
    ...(q.surchargeAmount > 0 || q.discountAmount > 0 ? [`Tiền thuê Bên thuê phải trả mỗi ${unit} (sau phụ phí và ưu đãi): ${vnd(q.firstPeriodRent)}.`] : []),
    `Trước khi sử dụng kho, Bên thuê thanh toán tổng cộng ${vnd(total)}, gồm HAI khoản riêng biệt dưới đây. Bên thuê xác nhận đã được thông báo rõ cả hai khoản này khi đặt chỗ:`,
    `Khoản 1 — Tiền giữ chân (còn gọi là tiền cọc): ${vnd(q.depositAmount)}${i.depositPaid ? ' (đã thanh toán)' : ''}, trả khi đặt chỗ${holdPeriods > 1 ? `, bằng ${holdPeriods} ${unit} tiền thuê (kho cỡ lớn)` : ''}. Khoản này giữ ô kho đã chọn cho Bên thuê và bảo đảm việc thực hiện hợp đồng; được giữ đến khi trả kho — không trừ vào tiền thuê — và hoàn lại sau khi trừ chi phí hư hại, công nợ (nếu có), theo mức hoàn nêu tại Điều 5.`,
    prepaid
      ? `Khoản 2 — Tiền thuê ${unit} đầu: ${vnd(q.firstPeriodRent)}, thanh toán CÙNG LÚC đặt chỗ (kho cỡ lớn), nên tổng trả khi đặt chỗ là ${vnd(total)}. Bên thuê không phải trả thêm tiền thuê kỳ đầu khi nhận kho.`
      : `Khoản 2 — Tiền thuê ${unit} đầu: ${vnd(q.firstPeriodRent)}, thanh toán THÊM ngoài tiền giữ chân, tại quầy khi nhân viên bàn giao kho.`,
    `Các kỳ sau thanh toán theo từng ${unit} vào đầu mỗi kỳ — không phải trả trước toàn bộ thời hạn. Bên thuê cũng có thể gia hạn và trả trước thêm.`,
    `Quá hạn thanh toán quá ${i.policy.gracePeriodDays} ngày bị tính phí trễ; quá ${i.policy.lockoutAfterDays} ngày bị khoá truy cập.`,
  ]);

  add('Hủy đặt chỗ, chấm dứt trước hạn và hàng bỏ lại', [], [
    ...(showAck ? ['Bên thuê có quyền hủy đặt chỗ hoặc trả kho trước hạn bất cứ lúc nào. Việc hủy, trả kho trước hạn là quyết định của Bên thuê; Bên thuê tự chịu trách nhiệm về quyết định đó và chỉ được hoàn tiền theo các mức dưới đây.'] : []),
    ...cancellationLines(i.policy, refundBase),
    ...earlyTerminationLines(i.policy),
    ...(showAck ? [
      'Tiền thuê của kỳ đang sử dụng không được hoàn khi Bên thuê trả kho trước hạn.',
      'Nếu Bên cho thuê không bàn giao được ô kho đã đặt do lỗi của mình: Bên cho thuê hoàn 100% số tiền Bên thuê đã thanh toán khi đặt chỗ. Hai bên thoả thuận đây là toàn bộ trách nhiệm của Bên cho thuê trong trường hợp này, thay cho mức phạt cọc quy định tại khoản 2 Điều 328 Bộ luật Dân sự.',
    ] : []),
    `Bị khoá truy cập quá ${abandonDaysOf(i.policy)} ngày mà không đóng tiền hay liên hệ: chi nhánh được kiểm kê, thanh lý đồ trong kho và giữ toàn bộ tiền giữ chân.`,
  ]);

  if (showAck) {
    add('Giao kết bằng phương thức điện tử', [], [
      'Hợp đồng này được lập và ký trực tuyến trên hệ thống KhoAn. Bên thuê ký bằng cách vẽ chữ ký hoặc gõ họ tên trên tài khoản đã đăng nhập của chính mình; nhân viên của Bên cho thuê không ký thay Bên thuê.',
      'Hệ thống ghi nhận họ tên người ký, hình thức ký, thời điểm ký, phiên bản Điều khoản thuê kho và phiên bản chính sách áp dụng. Hai bên thừa nhận các dữ liệu này là chứng cứ về việc giao kết, và hợp đồng điện tử này có giá trị pháp lý như hợp đồng bằng văn bản giấy.',
      'Mọi thao tác thực hiện từ tài khoản của Bên thuê (đặt chỗ, thanh toán, ký, hủy) được coi là do Bên thuê thực hiện. Bên thuê có trách nhiệm bảo mật tài khoản và thông báo ngay cho Bên cho thuê khi nghi ngờ tài khoản bị người khác sử dụng.',
      'Sau khi ký, bản hợp đồng (PDF) được gửi tới email của Bên thuê và luôn tải lại được trong tài khoản. Hợp đồng có hiệu lực từ thời điểm Bên thuê ký.',
    ]);

    add('Xác nhận thuê kho và giới hạn trách nhiệm', [], [
      'Bên thuê (Quý khách) xác định sẽ thuê kho sau khi thanh toán tiền giữ chân (tiền cọc) và ký vào hợp đồng này. Việc thuê kho là quyết định tự nguyện, độc lập của Bên thuê.',
      'Bên thuê xác nhận đã được cung cấp đầy đủ thông tin về loại kho, kích thước, hình ảnh giới thiệu, hình thức khoá, giá, các khoản phải thanh toán và điều kiện hủy, hoàn tiền (Điều 4 và Điều 5) trước khi quyết định; đã có điều kiện đến xem kho trực tiếp tại chi nhánh trong giờ mở cửa; và tự chịu trách nhiệm đánh giá kho có phù hợp với nhu cầu của mình hay không.',
      'Nếu phát sinh bất trắc từ phía Bên thuê, hoặc kho không phù hợp với nhu cầu của Bên thuê, Bên cho thuê KHÔNG chịu trách nhiệm đối với mọi hoạt động của Bên thuê cũng như mọi hậu quả, chi phí, thiệt hại phát sinh từ việc Bên thuê tự quyết định thuê, hủy hoặc chấm dứt hợp đồng — bao gồm chi phí vận chuyển, đóng gói, nhân công, lưu kho nơi khác và mọi khoản Bên thuê đã chi cho bên thứ ba.',
      'Trong các trường hợp nêu trên, quyền lợi DUY NHẤT của Bên thuê đối với khoản đã thanh toán khi đặt chỗ là được hoàn tiền theo đúng mức hoàn ghi tại Điều 5 của hợp đồng này (thực hiện tối đa trong 7 ngày làm việc). Bên cho thuê không bồi thường, đền bù hay hỗ trợ thêm bất kỳ khoản nào khác.',
      'Thiệt hại đối với tài sản trong ô kho do lỗi trực tiếp của Bên cho thuê trong thời gian Bên thuê đang thuê kho được xử lý theo Điều 6 của Điều khoản thuê kho (có giới hạn mức bồi thường). Điều này không loại trừ các quyền mà pháp luật bắt buộc dành cho người tiêu dùng.',
      'Điều 5 và Điều này là toàn bộ thoả thuận của hai bên về việc hủy, hoàn tiền và trách nhiệm trong các trường hợp trên. Mọi lời giới thiệu, quảng cáo hay trao đổi bằng lời khác không làm thay đổi nội dung này.',
    ]);
  }

  add('Điều khoản chung', [`Hai bên thực hiện theo Điều khoản thuê kho (v${i.termsVersion ?? TERMS_VERSION}) và chính sách phiên bản v${q.policyVersion} áp dụng tại thời điểm đặt chỗ.`], showAck ? [
    'Nếu một điều khoản của hợp đồng bị cơ quan có thẩm quyền tuyên vô hiệu, các điều khoản còn lại vẫn giữ nguyên hiệu lực.',
    'Tranh chấp được giải quyết trước hết bằng thương lượng; không thương lượng được thì giải quyết tại Tòa án có thẩm quyền theo pháp luật Việt Nam.',
  ] : []);
  return clauses;
}
