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
// 1.2 (12/10/2026): "tiền cọc" gọi là "tiền giữ chân"; kho cỡ lớn giữ chân ≥ 2 kỳ + trả tiền thuê kỳ đầu lúc đặt chỗ;
//                   Điều 11 mới: ký hợp đồng điện tử, xác nhận thuê kho, hủy/hoàn tiền và giới hạn trách nhiệm; Điều 8: phân công nhân viên chuyển đồ khi đổi ô.
// 1.3 (12/10/2026): Điều 1 và Điều 5 — chi nhánh giữ chìa tổng / thẻ tổng; mở kho hộ theo yêu cầu của khách có xác minh và ghi nhật ký;
//                   báo mất thẻ thì thẻ cũ bị khoá ngay.
// 1.4 (12/10/2026): Điều 5 — đăng ký người được uỷ quyền; Điều 10 — thu hồi ưu đãi thuê dài hạn khi trả kho sớm;
//                   Điều 11 — không đến nhận kho thì đặt chỗ tự hủy.
// 1.5 (13/10/2026): Điều 10 — giới hạn mức hoàn tiền giữ chân khi trả kho sớm chỉ áp cho hợp đồng có ưu đãi thuê dài hạn; mốc tính là ngày thực tế bàn giao kho; thuê theo ngày / tuần trả trọn tiền thuê cả thời hạn khi nhận kho, không hoàn kỳ chưa dùng; gia hạn là cam kết mới (giá niêm yết hiện hành, ưu đãi theo số tháng gia hạn, trả theo tháng); hết hạn không gia hạn thì tính giá chưa ưu đãi.
export const TERMS_VERSION = '1.5';
export const PRIVACY_VERSION = '1.0';
/** Ngày áp dụng Điều khoản (bản TERMS_VERSION). */
export const TERMS_EFFECTIVE = '13/10/2026';
/** Ngày áp dụng Chính sách bảo mật (bản PRIVACY_VERSION). */
export const LEGAL_EFFECTIVE = '16/09/2026';
