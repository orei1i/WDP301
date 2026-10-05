/**
 * Số phiên bản Điều khoản và Chính sách bảo mật.
 *
 * Đây là thứ được đóng dấu vào bằng chứng đồng ý của khách (`reservation.consent`, `user.consent`),
 * nên Webapp và app mobile BẮT BUỘC phải gửi cùng một giá trị — hai bên lệch phiên bản thì bằng
 * chứng trỏ tới hai văn bản khác nhau. Vì vậy con số nằm ở đây chứ không nằm riêng mỗi bên.
 *
 * Nội dung đầy đủ của hai văn bản vẫn ở Webapp/src/features/legal/legal-content.ts (chỉ web hiển thị toàn văn).
 * MỖI LẦN SỬA NỘI DUNG LÀ PHẢI TĂNG PHIÊN BẢN, không có ngoại lệ.
 */
// 1.1 (05/10/2026): Điều 3 nêu rõ hai khoản thanh toán trước khi dùng kho (cọc khi đặt chỗ + tiền thuê kỳ đầu khi nhận kho).
export const TERMS_VERSION = '1.1';
export const PRIVACY_VERSION = '1.0';
/** Ngày áp dụng Điều khoản (bản TERMS_VERSION). */
export const TERMS_EFFECTIVE = '05/10/2026';
/** Ngày áp dụng Chính sách bảo mật (bản PRIVACY_VERSION). */
export const LEGAL_EFFECTIVE = '16/09/2026';
