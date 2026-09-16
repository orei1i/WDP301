/**
 * Nội dung Điều khoản thuê kho và Chính sách bảo mật, kèm số phiên bản.
 *
 * Phiên bản là thứ được lưu vào bằng chứng đồng ý của khách (`reservation.consent`).
 * Sửa nội dung mà không tăng phiên bản = bằng chứng cũ trỏ tới văn bản đã khác → vô giá trị.
 * Vậy nên: MỖI LẦN SỬA NỘI DUNG LÀ PHẢI TĂNG PHIÊN BẢN, không có ngoại lệ.
 */

// Số phiên bản nằm ở @ssm/shared để app mobile gửi đúng cùng giá trị khi lấy chấp thuận của khách.
export { TERMS_VERSION, PRIVACY_VERSION, LEGAL_EFFECTIVE } from '@ssm/shared';

export interface LegalSection { heading: string; body: string[]; table?: { head: string[]; rows: string[][] } }

export const TERMS: LegalSection[] = [
  {
    heading: 'Điều 1. Bản chất dịch vụ',
    body: [
      'KhoAn cho thuê không gian lưu trữ tự quản. Đây là hợp đồng thuê không gian, không phải hợp đồng gửi giữ tài sản.',
      'KhoAn không giữ chìa khóa dự phòng, không kiểm đếm, không định giá và không quản lý tài sản bên trong ô kho. Khách hàng tự khóa, tự quản lý và tự chịu rủi ro đối với tài sản của mình.',
      'Khách hàng cam kết là chủ sở hữu hợp pháp hoặc được chủ sở hữu ủy quyền đối với toàn bộ tài sản gửi vào.',
    ],
  },
  {
    heading: 'Điều 2. Điều kiện khách hàng',
    body: [
      'Từ đủ 18 tuổi, có năng lực hành vi dân sự đầy đủ.',
      'Cung cấp thông tin định danh chính xác: họ tên, số điện thoại, email, giấy tờ tùy thân.',
      'Thông tin sai lệch là căn cứ để KhoAn đơn phương chấm dứt hợp đồng và không hoàn tiền cọc.',
    ],
  },
  {
    heading: 'Điều 3. Thời hạn, giá và thanh toán',
    body: [
      'Thời hạn thuê tối thiểu và tối đa theo chính sách đang áp dụng tại thời điểm ký.',
      'Giá thuê và toàn bộ điều khoản được chốt tại thời điểm xác nhận hợp đồng. KhoAn điều chỉnh bảng giá không làm thay đổi hợp đồng đang có hiệu lực.',
      'Tiền cọc được hoàn khi trả kho, sau khi trừ dư nợ và chi phí khắc phục hư hỏng nếu có.',
      'Thanh toán chậm phát sinh phí trễ hạn theo biểu phí trong chính sách.',
    ],
  },
  {
    heading: 'Điều 4. Hàng hóa bị cấm lưu trữ',
    body: ['Vi phạm điều này, KhoAn được quyền chấm dứt hợp đồng ngay lập tức, thông báo cơ quan chức năng, và khách hàng chịu toàn bộ chi phí xử lý.'],
    table: {
      head: ['Nhóm', 'Ví dụ'],
      rows: [
        ['Vi phạm pháp luật', 'Ma túy, vũ khí, hàng cấm, hàng giả, hàng không rõ nguồn gốc'],
        ['Nguy hiểm', 'Chất dễ cháy nổ, hóa chất độc hại, khí nén, pin lithium hỏng, vật liệu phóng xạ'],
        ['Sinh vật', 'Người, động vật sống, cây trồng'],
        ['Dễ phân hủy', 'Thực phẩm tươi sống, rác thải, chất thải y tế'],
        ['Giá trị cao không khai báo', 'Tiền mặt, kim loại quý, đá quý, chứng khoán, bản gốc giấy tờ pháp lý'],
      ],
    },
  },
  {
    heading: 'Điều 5. Quyền ra vào',
    body: [
      'Khách hàng ra vào trong giờ quy định của chi nhánh, bằng phương thức được cấp: chìa khóa, mã PIN hoặc thẻ từ.',
      'Không chuyển giao phương thức truy cập cho người thứ ba khi chưa đăng ký với KhoAn.',
      'KhoAn được quyền mở ô kho mà không cần sự có mặt của khách hàng trong các trường hợp: (a) tình huống khẩn cấp như cháy, ngập, rò rỉ; (b) có căn cứ hợp lý cho rằng bên trong chứa hàng hóa bị cấm tại Điều 4; (c) có yêu cầu bằng văn bản hoặc quyết định của cơ quan nhà nước có thẩm quyền; (d) khách hàng quá hạn thanh toán vượt ngưỡng tại Điều 7.',
      'Mọi lần mở kho theo khoản trên đều được lập biên bản, chụp ảnh hiện trạng và ghi vào nhật ký hệ thống. KhoAn thông báo cho khách hàng trong vòng 24 giờ, trừ trường hợp cơ quan chức năng yêu cầu giữ bí mật điều tra.',
    ],
  },
  {
    heading: 'Điều 6. Trách nhiệm và giới hạn trách nhiệm',
    body: [
      'KhoAn bảo đảm: kết cấu kho an toàn, hệ thống khóa hoạt động, camera giám sát lối đi 24/7, kiểm soát ra vào.',
      'KhoAn không chịu trách nhiệm đối với: hư hỏng do tính chất tự nhiên của tài sản (ẩm mốc, gỉ sét, côn trùng, hao mòn); thiệt hại do khách hàng đóng gói hoặc sắp xếp không đúng cách; sự kiện bất khả kháng; tài sản thuộc nhóm giá trị cao không khai báo tại Điều 4.',
      'Giới hạn bồi thường: trường hợp KhoAn có lỗi trực tiếp, mức bồi thường tối đa là mười (10) lần tiền thuê một tháng của ô kho đó, hoặc giá trị thiệt hại thực tế được chứng minh — lấy giá trị nhỏ hơn.',
      'Tài sản có giá trị vượt mức trên, khách hàng nên tự mua bảo hiểm. KhoAn không bán và không làm đại lý bảo hiểm.',
    ],
  },
  {
    heading: 'Điều 7. Trễ hạn và xử lý',
    body: [
      'Số tiền thu được từ thanh lý sau khi trừ công nợ và chi phí sẽ được hoàn trả cho khách hàng.',
      'Khách hàng lấy lại quyền ra vào bất cứ lúc nào trước khi thanh lý bằng cách thanh toán toàn bộ dư nợ.',
    ],
    table: {
      head: ['Mốc', 'Xử lý'],
      rows: [
        ['Quá hạn thanh toán', 'Phát sinh phí trễ hạn theo chính sách'],
        ['Hết thời gian ân hạn', 'Hệ thống gửi cảnh báo'],
        ['Vượt ngưỡng khóa kho', 'Khóa quyền ra vào. Tài sản vẫn được giữ nguyên'],
        ['Quá hạn 90 ngày liên tục', 'Gửi thông báo cuối cùng bằng văn bản và email'],
        ['Sau 30 ngày kể từ thông báo cuối', 'KhoAn được quyền mở kho, kiểm kê và thanh lý tài sản để bù đắp công nợ'],
      ],
    },
  },
  {
    heading: 'Điều 8. Đổi ô kho',
    body: [
      'Khách hàng được đổi sang ô kho khác cùng loại, cùng diện tích, khi chi nhánh còn ô trống.',
      'Đổi sang loại kho khác diện tích không phải là đổi ô — đây là chấm dứt hợp đồng cũ và ký hợp đồng mới theo bảng giá hiện hành.',
      'Giá thuê giữ nguyên theo hợp đồng gốc, không tính lại theo bảng giá tại thời điểm đổi.',
    ],
  },
  {
    heading: 'Điều 9. Trả kho',
    body: [
      'Khách hàng đăng ký ngày trả kho trên hệ thống, tối thiểu trước 7 ngày.',
      'Ô kho phải được dọn sạch, không để lại rác hoặc tài sản.',
      'Nhân viên lập biên bản kiểm tra có xác nhận của hai bên.',
      'Tiền cọc được quyết toán trong vòng 7 ngày làm việc kể từ ngày lập biên bản.',
      'Tài sản để lại quá 14 ngày sau ngày trả kho được coi là từ bỏ quyền sở hữu; KhoAn xử lý và tính chi phí cho khách hàng.',
    ],
  },
  {
    heading: 'Điều 10. Chấm dứt hợp đồng',
    body: [
      'Khách hàng chấm dứt trước hạn: hoàn cọc theo bậc thời gian trong chính sách. Tiền thuê đã thanh toán cho kỳ đang sử dụng không được hoàn.',
      'KhoAn chấm dứt ngay lập tức nếu khách hàng vi phạm Điều 4 hoặc cung cấp thông tin gian dối.',
    ],
  },
  {
    heading: 'Điều 11. Giải quyết tranh chấp',
    body: ['Hai bên thương lượng trước. Không đạt được thỏa thuận trong 30 ngày thì đưa ra Tòa án có thẩm quyền tại TP. Hồ Chí Minh. Áp dụng pháp luật Việt Nam.'],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    heading: '1. Dữ liệu thu thập',
    body: ['KhoAn không lưu số giấy tờ đầy đủ, không lưu số thẻ ngân hàng, và không lắp camera bên trong ô kho.'],
    table: {
      head: ['Nhóm', 'Cụ thể', 'Mục đích'],
      rows: [
        ['Định danh', 'Họ tên, email, số điện thoại', 'Lập hợp đồng, liên hệ'],
        ['Giấy tờ', 'Loại giấy tờ và 4 số cuối', 'Xác minh danh tính khi nhận kho'],
        ['Địa chỉ', 'Địa chỉ liên hệ, người liên hệ khẩn cấp', 'Giao dịch, xử lý sự cố'],
        ['Giao dịch', 'Lịch sử đặt chỗ, hợp đồng, thanh toán', 'Thực hiện hợp đồng, kế toán'],
        ['Nhật ký ra vào', 'Thời điểm quét mã, mở kho', 'An ninh, đối chiếu khi tranh chấp'],
        ['Hình ảnh camera', 'Lối đi, khu vực chung', 'An ninh'],
        ['Kỹ thuật', 'Địa chỉ IP, loại trình duyệt', 'Bảo mật, chống gian lận'],
      ],
    },
  },
  {
    heading: '2. Cơ sở xử lý dữ liệu',
    body: [
      'Thực hiện hợp đồng thuê kho đã giao kết với khách hàng.',
      'Tuân thủ nghĩa vụ pháp luật về thuế, kế toán và yêu cầu của cơ quan nhà nước có thẩm quyền.',
      'Lợi ích hợp pháp: bảo đảm an ninh cơ sở và phòng chống gian lận.',
    ],
  },
  {
    heading: '3. Chia sẻ với bên thứ ba',
    body: ['KhoAn không bán, không trao đổi và không cho thuê dữ liệu cá nhân cho mục đích quảng cáo.'],
    table: {
      head: ['Bên nhận', 'Dữ liệu', 'Lý do'],
      rows: [
        ['Cổng thanh toán (VNPay, MoMo)', 'Số tiền, mã đơn hàng', 'Xử lý giao dịch. KhoAn không nhận và không lưu thông tin thẻ'],
        ['Google Firebase', 'Email, định danh đăng nhập', 'Xác thực tài khoản'],
        ['MongoDB Atlas', 'Dữ liệu nghiệp vụ', 'Lưu trữ'],
        ['Cơ quan nhà nước', 'Theo phạm vi yêu cầu', 'Khi có yêu cầu hợp pháp bằng văn bản'],
      ],
    },
  },
  {
    heading: '4. Thời gian lưu trữ',
    body: [],
    table: {
      head: ['Loại dữ liệu', 'Thời hạn'],
      rows: [
        ['Hồ sơ khách hàng', 'Trong thời gian hợp đồng còn hiệu lực'],
        ['Chứng từ tài chính', '10 năm kể từ ngày kết thúc, theo Luật Kế toán'],
        ['Nhật ký ra vào', '12 tháng'],
        ['Hình ảnh camera', '30 ngày, trừ khi cần phục vụ điều tra'],
        ['Nhật ký hệ thống', '24 tháng'],
      ],
    },
  },
  {
    heading: '5. Quyền của khách hàng',
    body: [
      'Theo Nghị định 13/2023/NĐ-CP, khách hàng có quyền: được biết, truy cập, chỉnh sửa, rút lại sự đồng ý, xóa dữ liệu, hạn chế xử lý, phản đối xử lý và khiếu nại.',
      'Gửi yêu cầu qua mục Hỗ trợ trong ứng dụng. KhoAn phản hồi trong vòng 72 giờ.',
      'Ngoại lệ: dữ liệu thuộc chứng từ tài chính và nhật ký kiểm toán không thể xóa trong thời hạn luật định, kể cả khi khách hàng yêu cầu.',
    ],
  },
  {
    heading: '6. Biện pháp bảo mật',
    body: [
      'Mật khẩu do Firebase Authentication quản lý — hệ thống KhoAn không bao giờ nhìn thấy mật khẩu của bạn.',
      'Mã QR và mã PIN chỉ hiển thị một lần; hệ thống chỉ lưu bản băm SHA-256.',
      'Phân quyền theo vai trò: nhân viên chỉ truy cập được dữ liệu của chi nhánh mình phụ trách.',
      'Mọi truy cập bị từ chối đều được ghi vào nhật ký kiểm toán.',
      'Nhật ký kiểm toán chỉ ghi thêm, không sửa và không xóa.',
      'Toàn bộ kết nối được mã hóa TLS.',
    ],
  },
  {
    heading: '7. Thông báo sự cố',
    body: ['Phát hiện lộ lọt dữ liệu, KhoAn thông báo cho khách hàng bị ảnh hưởng và cơ quan có thẩm quyền trong vòng 72 giờ.'],
  },
];
