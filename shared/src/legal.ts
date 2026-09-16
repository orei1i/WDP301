/**
 * Số phiên bản Điều khoản và Chính sách bảo mật.
 *
 * Đây là thứ được đóng dấu vào bằng chứng đồng ý của khách (`reservation.consent`, `user.consent`),
 * nên Webapp và app mobile BẮT BUỘC phải gửi cùng một giá trị — hai bên lệch phiên bản thì bằng
 * chứng trỏ tới hai văn bản khác nhau. Vì vậy con số nằm ở đây chứ không nằm riêng mỗi bên.
 *
 * Nội dung đầy đủ của hai văn bản vẫn ở Webapp/src/lib/legal.ts (chỉ web hiển thị toàn văn).
 * MỖI LẦN SỬA NỘI DUNG LÀ PHẢI TĂNG PHIÊN BẢN, không có ngoại lệ.
 */
export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';
export const LEGAL_EFFECTIVE = '16/09/2026';
