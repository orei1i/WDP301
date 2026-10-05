/**
 * Quy tắc nhập liệu cho CRUD chi nhánh / loại kho / ô kho — MỘT nguồn cho BE (zod) lẫn form trên web,
 * để báo lỗi tại chỗ ngay khi gõ và server vẫn chặn đúng cùng một luật.
 */

export const RATE_MIN = 1_000;
export const RATE_MAX = 1_000_000_000;

/** Giá phải tăng dần theo chu kỳ: ngày ≤ tuần ≤ tháng (chỉ so các giá có mặt). */
export const RATES_ORDER_MESSAGE = 'Giá phải tăng dần theo chu kỳ: giá ngày ≤ giá tuần ≤ giá tháng';
export function ratesOrdered(r: { DAY?: number; WEEK?: number; MONTH?: number }): boolean {
  const seq = [r.DAY, r.WEEK, r.MONTH].filter((v): v is number => typeof v === 'number');
  return seq.every((v, i) => i === 0 || seq[i - 1] <= v);
}

/** Mã ô kho: chữ/số/dấu gạch ngang, bắt đầu bằng chữ hoặc số, tối đa 20 ký tự (VD M2-09). */
export const UNIT_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
export const UNIT_NUMBER_MESSAGE = 'Mã ô chỉ gồm chữ, số và dấu "-", tối đa 20 ký tự (VD M2-09)';

export const FACILITY_CODE_RE = /^[A-Za-z0-9-]{3,20}$/;
export const FACILITY_CODE_MESSAGE = 'Mã chi nhánh 3–20 ký tự, chỉ gồm chữ, số và dấu "-" (VD HCM-GV-01)';

/** Số điện thoại: chữ số kèm +, khoảng trắng, "-", ".", "()" — tổng 8–15 chữ số. */
export const PHONE_MESSAGE = 'Số điện thoại chỉ gồm chữ số (8–15 số), có thể kèm +, khoảng trắng, "-"';
export function isValidPhone(v: string): boolean {
  if (!/^\+?[0-9 .()-]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '').length;
  return digits >= 8 && digits <= 15;
}

export const COORDS_PAIR_MESSAGE = 'Nhập đủ cả kinh độ và vĩ độ, hoặc để trống cả hai';
export const inLng = (n: number) => n >= -180 && n <= 180;
export const inLat = (n: number) => n >= -90 && n <= 90;
