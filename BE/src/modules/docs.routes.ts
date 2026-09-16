import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';

/**
 * Trang tài liệu API (GET /api) + bản JSON máy đọc được (GET /api/docs.json).
 * Cố ý không dùng thêm thư viện nào: bảng route bên dưới là nguồn duy nhất, trang HTML
 * chỉ render lại nó ở phía trình duyệt. Khi thêm endpoint mới → thêm 1 dòng ở đây.
 */

type Role = 'CUSTOMER' | 'STAFF' | 'FACILITY_MANAGER' | 'OPS_MANAGER' | 'ADMIN';
type Auth = 'PUBLIC' | 'ANY' | Role[];

interface Field { name: string; type: string; required?: boolean; note?: string }
interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  auth: Auth;
  summary: string;
  query?: Field[];
  body?: Field[];
  notes?: string[];
}
interface Group { name: string; blurb: string; routes: Route[] }

const R = {
  CUS: ['CUSTOMER'] as Role[],
  STAFF: ['STAFF', 'FACILITY_MANAGER'] as Role[],
  FM: ['FACILITY_MANAGER'] as Role[],
  OPS: ['OPS_MANAGER'] as Role[],
  ADMIN: ['ADMIN'] as Role[],
};

export const API_GROUPS: Group[] = [
  {
    name: 'Xác thực',
    blurb: 'Đăng nhập bằng Firebase ở client, gửi ID token qua header Authorization. Vai trò và phạm vi chi nhánh luôn lấy từ MongoDB, không bao giờ tin client.',
    routes: [
      {
        method: 'POST', path: '/auth/sync', auth: 'PUBLIC', summary: 'Tạo hoặc liên kết hồ sơ trong MongoDB sau mỗi lần đăng nhập Firebase (email/password hoặc Google).',
        body: [
          { name: 'fullName', type: 'string ≤120', note: 'dùng khi Firebase chưa có displayName' },
          { name: 'phone', type: 'string /^\\+?\\d{9,15}$/' },
        ],
        notes: [
          'Chỉ cần Firebase ID token hợp lệ, chưa cần hồ sơ trong DB.',
          'Trả 201 nếu vừa tạo mới, 200 nếu đã có. Gọi ngay sau onAuthStateChanged rồi mới gọi /bootstrap.',
        ],
      },
      { method: 'GET', path: '/auth/me', auth: 'ANY', summary: 'Hồ sơ người dùng hiện tại (role, facilityIds, status).' },
    ],
  },
  {
    name: 'Bootstrap',
    blurb: 'Một lần gọi, một ảnh chụp dữ liệu đã lọc theo quyền — Webapp dùng nó để dựng toàn bộ dashboard.',
    routes: [
      {
        method: 'GET', path: '/bootstrap', auth: 'ANY',
        summary: 'Snapshot theo vai trò: { me, users, facilities, unitTypes, units, reservations, contracts, payments, inspections, tickets, policies, audit }.',
        notes: [
          'CUSTOMER → chỉ dữ liệu của chính mình · STAFF/FACILITY_MANAGER → theo facilityIds · OPS_MANAGER → toàn chuỗi · ADMIN → thêm users + audit.',
          'Không bao giờ trả checkIn.qrTokenHash; tin nhắn nội bộ của ticket bị lược bỏ với khách hàng.',
          'Endpoint này chỉ đọc. Mọi thay đổi phải đi qua endpoint riêng để server kiểm tra lại quy tắc.',
        ],
      },
    ],
  },
  {
    name: 'Chi nhánh & bảng giá',
    blurb: 'Hai endpoint /public không cần đăng nhập, phục vụ trang tra cứu kho của khách.',
    routes: [
      { method: 'GET', path: '/facilities/public', auth: 'PUBLIC', summary: 'Danh sách chi nhánh đang hoạt động kèm số ô trống theo loại.' },
      {
        method: 'GET', path: '/facilities/public/:id', auth: 'PUBLIC', summary: 'Chi tiết chi nhánh + tồn kho và báo giá do server tính.',
        query: [
          { name: 'start', type: 'date (YYYY-MM-DD)', note: 'ngày bắt đầu thuê dự kiến' },
          { name: 'months', type: 'int 1..60', note: 'mặc định 1' },
        ],
      },
      { method: 'GET', path: '/facilities', auth: ['STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER', 'ADMIN'], summary: 'Danh sách chi nhánh trong phạm vi của người gọi.' },
      {
        method: 'POST', path: '/facilities', auth: ['OPS_MANAGER', 'ADMIN'], summary: 'Tạo chi nhánh mới.',
        body: [
          { name: 'code', type: 'string [A-Za-z0-9-]{3,20}', required: true },
          { name: 'name', type: 'string 3..150', required: true },
          { name: 'status', type: 'FacilityStatus', required: true },
          { name: 'line1', type: 'string', required: true },
          { name: 'district', type: 'string', required: true },
          { name: 'city', type: 'string' },
          { name: 'phone', type: 'string', required: true },
          { name: 'lng / lat', type: 'number' },
        ],
      },
      { method: 'PATCH', path: '/facilities/:id', auth: ['OPS_MANAGER', 'ADMIN'], summary: 'Cập nhật chi nhánh (không đổi được code).' },
      { method: 'GET', path: '/facilities/:id/unit-types', auth: 'ANY', summary: 'Các loại ô kho của chi nhánh, sắp theo giá tăng dần.', notes: ['Bị chặn nếu chi nhánh nằm ngoài phạm vi của người gọi.'] },
      {
        method: 'PATCH', path: '/facilities/unit-types/:id/price', auth: R.OPS, summary: 'Đổi giá thuê cơ bản theo tháng.',
        body: [{ name: 'rate', type: 'int ≥ 50.000 (VND)', required: true }],
        notes: ['Hợp đồng và đặt chỗ đang tồn tại giữ nguyên giá đã chốt (snapshot).'],
      },
    ],
  },
  {
    name: 'Ô kho',
    blurb: 'Ô kho vật lý. Trạng thái chỉ đổi qua các endpoint này hoặc qua nghiệp vụ (cấp ô, nhận kho, trả kho).',
    routes: [
      {
        method: 'GET', path: '/units', auth: ['STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER'], summary: 'Sơ đồ ô kho của một chi nhánh.',
        query: [
          { name: 'facilityId', type: 'ObjectId', required: true },
          { name: 'status', type: 'UnitStatus' },
          { name: 'unitTypeId', type: 'ObjectId' },
        ],
      },
      {
        method: 'POST', path: '/units', auth: R.FM, summary: 'Thêm ô kho mới.',
        body: [
          { name: 'unitTypeId', type: 'ObjectId', required: true },
          { name: 'unitNumber', type: 'string 1..20', required: true },
          { name: 'floor', type: 'int -5..100', required: true },
          { name: 'priceTier', type: 'STANDARD | PREMIUM | ...', note: 'mặc định STANDARD' },
          { name: 'zone', type: 'string' },
        ],
      },
      {
        method: 'PATCH', path: '/units/:id/status', auth: R.STAFF, summary: 'Đưa ô vào/ra bảo trì.',
        body: [
          { name: 'to', type: "'AVAILABLE' | 'MAINTENANCE'", required: true },
          { name: 'reason', type: 'string ≤500' },
        ],
        notes: ['Không dùng để chiếm ô — ô chỉ chuyển sang RESERVED/OCCUPIED qua luồng đặt chỗ.'],
      },
    ],
  },
  {
    name: 'Đặt chỗ',
    blurb: 'Vòng đời: PENDING → CONFIRMED → ALLOCATED → CHECKED_IN → COMPLETED (hoặc CANCELLED / EXPIRED / NO_SHOW). Chống đặt trùng bằng 3 lớp: $inc inventoryVersion trong transaction, CAS trên ô kho, và partial unique index.',
    routes: [
      {
        method: 'GET', path: '/reservations', auth: 'ANY', summary: 'Danh sách đặt chỗ đã lọc theo quyền.',
        query: [
          { name: 'page / limit', type: 'int' },
          { name: 'facilityId', type: 'ObjectId' },
          { name: 'status', type: 'CSV ReservationStatus', note: 'ví dụ CONFIRMED,ALLOCATED' },
          { name: 'from / to', type: 'date', note: 'lọc theo startDate' },
        ],
      },
      {
        method: 'GET', path: '/reservations/lookup', auth: R.STAFF, summary: 'Tra mã đặt chỗ tại quầy trước khi nhận khách.',
        query: [{ name: 'code', type: 'string ≥6', required: true }],
        notes: ['Tra cứu ngoài phạm vi chi nhánh sẽ bị từ chối và ghi một dòng audit result=DENIED.'],
      },
      { method: 'GET', path: '/reservations/:id', auth: 'ANY', summary: 'Chi tiết một đặt chỗ.' },
      {
        method: 'POST', path: '/reservations', auth: R.CUS, summary: 'Giữ chỗ một loại ô kho và sinh khoản thanh toán tiền cọc.',
        body: [
          { name: 'unitTypeId', type: 'ObjectId', required: true },
          { name: 'startDate', type: 'date', required: true },
          { name: 'months', type: 'int 1..60', required: true },
          { name: 'source', type: "'WEB' | 'MOBILE'", note: 'mặc định WEB' },
          { name: 'idempotencyKey', type: 'string 8..100', note: 'hoặc dùng header Idempotency-Key' },
        ],
        notes: [
          'Trả 201 với đặt chỗ ở trạng thái PENDING + payment DEPOSIT đang chờ.',
          'Giá và chính sách được đóng băng (snapshot) ngay tại đây.',
          'Hết hạn giữ chỗ (reservationHoldMinutes) thì job nền tự chuyển sang EXPIRED.',
          'Hết ô trống → 409 SOLD_OUT.',
        ],
      },
      {
        method: 'POST', path: '/reservations/:id/pay-deposit', auth: R.CUS, summary: 'Thanh toán cọc (cổng thanh toán đang ở chế độ giả lập).',
        body: [{ name: 'method', type: "'VNPAY' | 'MOMO' | 'CARD' | 'BANK_TRANSFER'", required: true }],
        notes: ['Thành công → CONFIRMED và trả qrPayload dạng SSM:<code>:<token> đúng một lần; server chỉ lưu SHA-256 của token.'],
      },
      {
        method: 'POST', path: '/reservations/:id/cancel', auth: 'ANY', summary: 'Hủy đặt chỗ, hoàn cọc theo bậc trong chính sách.',
        body: [
          { name: 'reason', type: 'CancellationReason', note: 'khách hàng luôn bị ép về CUSTOMER_REQUEST' },
          { name: 'note', type: 'string ≤500' },
        ],
      },
      {
        method: 'POST', path: '/reservations/:id/allocate', auth: R.FM, summary: 'Gán một ô kho cụ thể cho đặt chỗ.',
        body: [{ name: 'unitId', type: 'ObjectId', note: 'bỏ trống để hệ thống tự chọn ô phù hợp nhất' }],
        notes: ['Tự chọn theo thứ tự priceTier giảm dần → tầng thấp → số ô nhỏ, và dùng CAS trên status=AVAILABLE.'],
      },
      { method: 'POST', path: '/reservations/:id/unallocate', auth: R.FM, summary: 'Nhả ô đã gán, trả ô về AVAILABLE.' },
      {
        method: 'POST', path: '/reservations/:id/check-in', auth: R.STAFF, summary: 'Nhận khách: tạo hợp đồng thuê, thu tiền thuê kỳ đầu, cấp quyền vào kho.',
        body: [
          { name: 'accessMethod', type: 'AccessMethod', required: true },
          { name: 'keyTag', type: 'string ≤40' },
          { name: 'payMethod', type: 'PaymentMethod (≠ INTERNAL)', required: true },
          { name: 'qrToken', type: 'string', note: 'token quét từ mã QR của khách' },
        ],
        notes: ['Mã PIN chỉ trả về đúng một lần trong response này — không có endpoint nào đọc lại được.'],
      },
    ],
  },
  {
    name: 'Hợp đồng thuê',
    blurb: 'Vòng đời: ACTIVE → (OVERDUE → LOCKED_OUT) → PENDING_MOVE_OUT → CLOSED. Mọi khoản tiền là số nguyên VND.',
    routes: [
      {
        method: 'GET', path: '/contracts', auth: 'ANY', summary: 'Danh sách hợp đồng, ưu tiên hiển thị nợ quá hạn lâu nhất.',
        query: [
          { name: 'page / limit', type: 'int' },
          { name: 'facilityId', type: 'ObjectId' },
          { name: 'status', type: 'CSV ContractStatus' },
          { name: 'overdue', type: "'true' | 'false'", note: "true → chỉ hợp đồng còn dư nợ" },
        ],
      },
      { method: 'GET', path: '/contracts/:id', auth: 'ANY', summary: 'Chi tiết hợp đồng + 50 giao dịch gần nhất.' },
      {
        method: 'POST', path: '/contracts/:id/extend', auth: R.CUS, summary: 'Gia hạn thêm số tháng và thanh toán ngay.',
        body: [{ name: 'months', type: 'int 1..24', required: true }, { name: 'method', type: 'PaymentMethod (≠ INTERNAL)', required: true }],
      },
      {
        method: 'POST', path: '/contracts/:id/pay-balance', auth: ['CUSTOMER', 'STAFF', 'FACILITY_MANAGER'], summary: 'Thanh toán dư nợ hiện tại.',
        body: [{ name: 'method', type: 'PaymentMethod (≠ INTERNAL)', required: true }],
        notes: ['Khoản PENDING → SUCCEEDED. Nếu khoản cũ đã FAILED thì sinh một khoản thu mới để thử lại (bản ghi tài chính chỉ ghi thêm, không sửa).'],
      },
      { method: 'POST', path: '/contracts/:id/lockout', auth: R.FM, summary: 'Khóa ô kho khi quá hạn vượt lockoutAfterDays.' },
      {
        method: 'POST', path: '/contracts/:id/waive-late-fees', auth: ['FACILITY_MANAGER', 'OPS_MANAGER'], summary: 'Miễn phí phạt trễ hạn.',
        body: [{ name: 'reason', type: 'string 5..500', required: true }],
        notes: ['Vượt hạn mức miễn giảm trong chính sách → 422 WAIVER_LIMIT.'],
      },
      {
        method: 'POST', path: '/contracts/:id/move-out', auth: ['CUSTOMER', 'STAFF', 'FACILITY_MANAGER'], summary: 'Đăng ký ngày trả kho.',
        body: [{ name: 'date', type: 'date', required: true }],
      },
      { method: 'POST', path: '/contracts/:id/receive', auth: R.STAFF, summary: 'Xác nhận đã nhận lại ô kho từ khách.' },
      {
        method: 'POST', path: '/contracts/:id/inspection', auth: R.STAFF, summary: 'Biên bản kiểm tra khi trả kho → quyết toán tiền cọc và đóng hợp đồng.',
        body: [
          { name: 'checklist[]', type: '{ item, condition: ItemCondition, note? } ≤100', required: true },
          { name: 'damages[]', type: '{ description, severity: MINOR|MODERATE|SEVERE, cost, photoUrls[] } ≤50', required: true },
          { name: 'notes', type: 'string ≤2000' },
        ],
        notes: ['Kết thúc: hợp đồng CLOSED, đặt chỗ COMPLETED, ô kho về AVAILABLE (hoặc MAINTENANCE nếu có hư hỏng nặng).'],
      },
      {
        method: 'GET', path: '/inspections', auth: ['STAFF', 'FACILITY_MANAGER', 'OPS_MANAGER'], summary: '100 biên bản kiểm tra gần nhất của một chi nhánh.',
        query: [{ name: 'facilityId', type: 'ObjectId', required: true }],
      },
    ],
  },
  {
    name: 'Thanh toán',
    blurb: 'Bản ghi tài chính chỉ ghi thêm (append-only) — không sửa, không xóa. Mọi số tiền là số nguyên VND.',
    routes: [
      {
        method: 'GET', path: '/payments', auth: 'ANY', summary: 'Lịch sử giao dịch trong phạm vi của người gọi.',
        query: [
          { name: 'page / limit', type: 'int' },
          { name: 'facilityId / contractId', type: 'ObjectId' },
          { name: 'status', type: 'CSV PaymentStatus' },
        ],
      },
    ],
  },
  {
    name: 'Yêu cầu hỗ trợ',
    blurb: 'Ticket của khách và việc nội bộ. Tin nhắn internal=true không bao giờ lộ cho khách hàng.',
    routes: [
      {
        method: 'GET', path: '/tickets', auth: 'ANY', summary: 'Danh sách ticket, sắp theo hạn xử lý.',
        query: [
          { name: 'page / limit', type: 'int' },
          { name: 'facilityId', type: 'ObjectId' },
          { name: 'status', type: 'CSV TicketStatus' },
          { name: 'mine', type: "'true' | 'false'", note: 'chỉ ticket được giao cho tôi (không áp dụng cho khách)' },
        ],
      },
      { method: 'GET', path: '/tickets/:id', auth: 'ANY', summary: 'Chi tiết ticket.' },
      {
        method: 'POST', path: '/tickets', auth: 'ANY', summary: 'Tạo ticket mới.',
        body: [
          { name: 'facilityId', type: 'ObjectId', required: true },
          { name: 'category', type: 'TicketCategory', required: true },
          { name: 'subject', type: 'string 5..200', required: true },
          { name: 'kind', type: 'TicketKind', note: 'mặc định CUSTOMER_ISSUE' },
          { name: 'priority', type: 'TicketPriority', note: 'mặc định MEDIUM' },
          { name: 'description', type: 'string ≤5000' },
          { name: 'unitId / contractId / assigneeId', type: 'ObjectId | null' },
          { name: 'dueAt', type: 'date | null' },
        ],
      },
      { method: 'POST', path: '/tickets/:id/assign', auth: R.FM, summary: 'Giao ticket cho nhân viên.', body: [{ name: 'assigneeId', type: 'ObjectId', required: true }] },
      { method: 'POST', path: '/tickets/:id/status', auth: 'ANY', summary: 'Đổi trạng thái ticket theo state machine.', body: [{ name: 'to', type: 'TicketStatus', required: true }] },
      {
        method: 'POST', path: '/tickets/:id/messages', auth: 'ANY', summary: 'Thêm tin nhắn vào ticket.',
        body: [{ name: 'body', type: 'string 1..5000', required: true }, { name: 'internal', type: 'boolean', note: 'mặc định false' }],
      },
    ],
  },
  {
    name: 'Chính sách',
    blurb: 'BusinessPolicy bất biến và có phiên bản: mỗi lần sửa là một version mới, bản cũ giữ nguyên để hợp đồng cũ vẫn tra được.',
    routes: [
      { method: 'GET', path: '/policies/effective/:id', auth: 'ANY', summary: 'Chính sách đang áp dụng cho một chi nhánh (đã trộn GLOBAL + FACILITY).' },
      {
        method: 'GET', path: '/policies', auth: ['OPS_MANAGER', 'ADMIN', 'FACILITY_MANAGER'], summary: 'Lịch sử phiên bản chính sách.',
        query: [{ name: 'facilityId', type: 'ObjectId', note: 'bỏ trống → xem chính sách GLOBAL' }],
      },
      {
        method: 'POST', path: '/policies', auth: R.OPS, summary: 'Xuất bản một phiên bản chính sách mới.',
        body: [
          { name: 'facilityId', type: 'ObjectId | null', required: true, note: 'null = chính sách toàn chuỗi' },
          { name: 'patch.gracePeriodDays', type: 'int 0..60' },
          { name: 'patch.lockoutAfterDays', type: 'int 1..180' },
          { name: 'patch.reservationHoldMinutes', type: 'int 5..1440' },
          { name: 'patch.allocationLeadDays', type: 'int 0..60' },
          { name: 'patch.noShowAfterHours', type: 'int 1..168' },
          { name: 'patch.minRentalMonths / maxRentalMonths', type: 'int' },
          { name: 'patch.deposit', type: "{ mode: 'MONTHS_OF_RENT' | 'FIXED', value }" },
          { name: 'patch.lateFees[]', type: '{ afterDays, kind, value, recurringEveryDays } ≤10' },
          { name: 'patch.cancellation[]', type: '{ minHoursBeforeStart, depositRefundPct } ≤10' },
          { name: 'patch.discounts[]', type: '{ code, kind, value, minMonths, validFrom, validTo, requiresApprovalRole } ≤20' },
        ],
        notes: ['patch là strict: gửi field lạ sẽ bị 400 UNKNOWN_FIELD.'],
      },
    ],
  },
  {
    name: 'Quản trị',
    blurb: 'Chỉ ADMIN. Đổi vai trò hoặc phạm vi chi nhánh sẽ thu hồi refresh token trên Firebase → phiên cũ chết ngay.',
    routes: [
      {
        method: 'GET', path: '/users', auth: R.ADMIN, summary: 'Danh sách người dùng.',
        query: [{ name: 'page / limit', type: 'int' }, { name: 'role', type: 'Role' }, { name: 'q', type: 'string ≤100', note: 'tìm theo tên hoặc email' }],
      },
      {
        method: 'POST', path: '/users', auth: R.ADMIN, summary: 'Tạo tài khoản nội bộ.',
        body: [
          { name: 'fullName', type: 'string 2..120', required: true },
          { name: 'email', type: 'email', required: true },
          { name: 'role', type: 'Role', required: true },
          { name: 'facilityIds', type: 'ObjectId[]', note: 'bắt buộc ≥1 với STAFF và FACILITY_MANAGER' },
          { name: 'status', type: 'UserStatus', note: 'mặc định ACTIVE' },
        ],
      },
      { method: 'PATCH', path: '/users/:id', auth: R.ADMIN, summary: 'Cập nhật tên, vai trò, phạm vi chi nhánh hoặc khóa tài khoản.' },
      {
        method: 'GET', path: '/audit', auth: R.ADMIN, summary: 'Nhật ký kiểm toán (chỉ ghi thêm).',
        query: [
          { name: 'page / limit', type: 'int' },
          { name: 'result', type: "'SUCCESS' | 'DENIED' | 'FAILED'" },
          { name: 'action', type: 'string ≤60', note: 'khớp theo tiền tố, ví dụ reservation.' },
          { name: 'facilityId', type: 'ObjectId' },
        ],
      },
    ],
  },
  {
    name: 'Báo cáo',
    blurb: 'FACILITY_MANAGER chỉ thấy chi nhánh của mình; OPS_MANAGER và ADMIN thấy toàn chuỗi.',
    routes: [
      {
        method: 'GET', path: '/reports/summary', auth: ['FACILITY_MANAGER', 'OPS_MANAGER', 'ADMIN'], summary: 'Tỷ lệ lấp đầy, doanh thu theo tháng và công nợ phải thu.',
        query: [
          { name: 'facilityId', type: 'ObjectId', note: 'bỏ trống → toàn bộ chi nhánh trong phạm vi' },
          { name: 'months', type: 'int 1..24', note: 'mặc định 6' },
        ],
      },
    ],
  },
];

export const ERROR_CODES: { status: number; code: string; meaning: string }[] = [
  { status: 400, code: 'VALIDATION', meaning: 'Body hoặc query không qua được Zod. details chứa lỗi từng field.' },
  { status: 400, code: 'BAD_ID', meaning: 'ObjectId sai định dạng.' },
  { status: 400, code: 'UNKNOWN_FIELD', meaning: 'Gửi field không có trong schema (strict mode).' },
  { status: 401, code: 'UNAUTHENTICATED', meaning: 'Thiếu hoặc sai Bearer token.' },
  { status: 401, code: 'TOKEN_EXPIRED', meaning: 'ID token hết hạn — lấy token mới bằng getIdToken().' },
  { status: 401, code: 'TOKEN_REVOKED', meaning: 'Phiên bị thu hồi (đổi quyền hoặc khóa tài khoản) — bắt đăng nhập lại.' },
  { status: 403, code: 'PROFILE_NOT_LINKED', meaning: 'Firebase hợp lệ nhưng chưa có hồ sơ — gọi POST /api/auth/sync.' },
  { status: 403, code: 'ACCOUNT_SUSPENDED', meaning: 'Tài khoản đang bị tạm khóa.' },
  { status: 403, code: 'FACILITY_SCOPE', meaning: 'Truy cập chi nhánh ngoài phạm vi được giao (có ghi audit DENIED).' },
  { status: 403, code: 'OWNERSHIP', meaning: 'Khách hàng truy cập bản ghi không phải của mình.' },
  { status: 403, code: 'FORBIDDEN', meaning: 'Vai trò không được phép gọi endpoint này.' },
  { status: 404, code: 'NOT_FOUND', meaning: 'Không tìm thấy bản ghi.' },
  { status: 409, code: 'SOLD_OUT', meaning: 'Loại ô kho đã hết trong khoảng thời gian yêu cầu.' },
  { status: 409, code: 'UNIT_NOT_AVAILABLE', meaning: 'Ô kho vừa bị người khác chiếm (CAS thất bại) — thử lại hoặc chọn ô khác.' },
  { status: 409, code: 'INVALID_STATE_TRANSITION', meaning: 'Chuyển trạng thái không hợp lệ. details có { entity, from, to }.' },
  { status: 409, code: 'DUPLICATE', meaning: 'Vi phạm unique index (đặt trùng ô, trùng mã...).' },
  { status: 409, code: 'CONFLICT', meaning: 'Xung đột nghiệp vụ chung.' },
  { status: 422, code: 'BUSINESS_RULE', meaning: 'Vi phạm quy tắc nghiệp vụ (mô tả ở message).' },
  { status: 422, code: 'HOLD_EXPIRED', meaning: 'Hết thời gian giữ chỗ — tạo đặt chỗ mới.' },
  { status: 422, code: 'WAIVER_LIMIT', meaning: 'Vượt hạn mức miễn giảm phí phạt trong chính sách.' },
  { status: 500, code: 'INTERNAL', meaning: 'Lỗi hệ thống. Ngoài production, details có stack trace.' },
];

/** Tài khoản do npm run seed tạo — chỉ dùng cho DB demo. */
const DEMO_ACCOUNTS = [
  { email: 'khach.demo@khoan.dev', role: 'CUSTOMER' },
  { email: 'nhanvien.q7@khoan.dev', role: 'STAFF' },
  { email: 'quanly.q7@khoan.dev', role: 'FACILITY_MANAGER' },
  { email: 'quanly.td@khoan.dev', role: 'FACILITY_MANAGER' },
  { email: 'quanly.tb@khoan.dev', role: 'FACILITY_MANAGER' },
  { email: 'vanhanh@khoan.dev', role: 'OPS_MANAGER' },
  { email: 'admin@khoan.dev', role: 'ADMIN' },
];

const docsPayload = (baseUrl: string) => ({
  name: 'Self-Storage Management API',
  version: 1,
  baseUrl,
  auth: {
    scheme: 'Bearer <Firebase ID token>',
    header: 'Authorization: Bearer eyJhbGciOi...',
    flow: ['Đăng nhập Firebase ở client', 'POST /auth/sync một lần', 'GET /bootstrap để dựng màn hình', 'Gọi các endpoint nghiệp vụ'],
    devBypass: 'Khi AUTH_DEV_BYPASS=true (chỉ ở môi trường dev), có thể thay token bằng header x-dev-user: <email>. Bị bỏ qua hoàn toàn khi NODE_ENV=production.',
  },
  conventions: [
    'Mọi số tiền là số nguyên VND (không có phần thập phân).',
    'Ngày dạng YYYY-MM-DD được lưu theo ngày địa phương của chi nhánh lúc 00:00Z.',
    'Danh sách trả { items, total, page, limit }; query page bắt đầu từ 1.',
    'Lỗi luôn có dạng { error: { code, message, details? } } với message tiếng Việt.',
    'POST /reservations nhận header Idempotency-Key để chống bấm hai lần.',
  ],
  groups: API_GROUPS,
  errors: ERROR_CODES,
  // Trình duyệt gọi thẳng Firebase để lấy token — server không bao giờ nhìn thấy mật khẩu.
  login: {
    enabled: Boolean(env.FIREBASE_WEB_API_KEY),
    apiKey: env.FIREBASE_WEB_API_KEY ?? null,
    demoPassword: env.DOC_DEMO_PASSWORD ?? null,
    accounts: DEMO_ACCOUNTS,
  },
});

const PAGE = (json: string, nonce: string) => `<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API · Self-Storage Management</title>
<style nonce="${nonce}">
  :root{--bg:#f7f8fa;--card:#fff;--ink:#16181d;--muted:#6b7280;--line:#e5e7eb;--blue:#2a78d6;--orange:#eb6834;--green:#1baf7a;--code:#f3f4f6}
  @media (prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#161a21;--ink:#e7e9ee;--muted:#9aa3b2;--line:#252b35;--code:#1c222b}}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.6 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}
  a{color:var(--blue)}
  .wrap{display:flex;min-height:100vh;align-items:flex-start}
  aside{position:sticky;top:0;width:250px;flex:none;height:100vh;overflow:auto;padding:20px 12px 40px;border-right:1px solid var(--line)}
  aside h1{font-size:15px;margin:0 8px 4px}
  aside p{margin:0 8px 14px;color:var(--muted);font-size:12px}
  aside a{display:block;padding:6px 8px;border-radius:7px;text-decoration:none;color:var(--ink);font-size:13px}
  aside a:hover{background:var(--code)}
  main{flex:1;min-width:0;padding:26px 30px 80px;max-width:1000px}
  .search{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink);margin-bottom:14px;font-size:13px}
  .panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:18px}
  h2{font-size:19px;margin:30px 0 6px;scroll-margin-top:16px}
  h2:first-child{margin-top:0}
  .blurb{color:var(--muted);margin:0 0 14px}
  .route{border:1px solid var(--line);border-radius:11px;background:var(--card);padding:13px 15px;margin-bottom:9px}
  .head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .m{font:600 11px/1 ui-monospace,monospace;padding:5px 8px;border-radius:6px;color:#fff;letter-spacing:.4px}
  .GET{background:var(--blue)}.POST{background:var(--green)}.PATCH{background:var(--orange)}.PUT{background:var(--orange)}.DELETE{background:#d33}
  .p{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}
  .roles{margin-left:auto;display:flex;gap:5px;flex-wrap:wrap}
  .chip{font-size:11px;padding:3px 8px;border-radius:20px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
  .chip.pub{border-color:var(--green);color:var(--green)}
  .chip.any{border-color:var(--blue);color:var(--blue)}
  .sum{margin:8px 0 0;color:var(--ink)}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:600}
  td.k{font-family:ui-monospace,monospace;white-space:nowrap}
  td.t{font-family:ui-monospace,monospace;color:var(--muted)}
  .req{color:var(--orange);font-weight:700}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:12px 0 0}
  ul.notes{margin:6px 0 0;padding-left:18px;color:var(--muted)}
  code{background:var(--code);padding:2px 6px;border-radius:5px;font-family:ui-monospace,monospace;font-size:12.5px}
  pre{background:var(--code);padding:11px 13px;border-radius:9px;overflow:auto;font-size:12.5px;margin:8px 0 0}
  .hide{display:none}
  .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
  .f{flex:1 1 200px;min-width:0;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:13px}
  .btn{padding:9px 15px;border:0;border-radius:8px;background:var(--blue);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
  .btn:disabled{opacity:.5;cursor:default}
  .btn.alt{background:var(--green)}
  .pill{padding:4px 10px;margin:3px 4px 0 0;border:1px solid var(--line);border-radius:20px;background:var(--card);color:var(--ink);font-size:11.5px;cursor:pointer}
  .pill:hover{border-color:var(--blue);color:var(--blue)}
  .tok{margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--code);font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all;max-height:96px;overflow:auto}
  .who{margin-top:8px;font-size:13px}
  .err{color:var(--orange);margin-top:8px;font-size:13px}
  .mt{margin-top:10px}
  .btn.ghost{background:var(--muted)}
  @media (max-width:860px){aside{display:none}main{padding:18px 14px 60px}}
</style></head><body>
<div class="wrap">
  <aside><h1>API Reference</h1><p id="base"></p><nav id="nav"></nav></aside>
  <main>
    <input class="search" id="q" placeholder="Lọc nhanh: gõ đường dẫn, vai trò hoặc từ khóa…" autocomplete="off">
    <div class="panel" id="intro"></div>
    <div class="panel" id="auth"></div>
    <div id="body"></div>
    <h2 id="errors">Mã lỗi</h2>
    <p class="blurb">Mọi lỗi đều trả về <code>{ "error": { "code", "message", "details?" } }</code>.</p>
    <div class="panel"><table id="errtable"><thead><tr><th>HTTP</th><th>Code</th><th>Ý nghĩa</th></tr></thead><tbody></tbody></table></div>
  </main>
</div>
<script id="doc" type="application/json" nonce="${nonce}">${json}</script>
<script nonce="${nonce}">
const D = JSON.parse(document.getElementById('doc').textContent);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const slug = s => s.replace(/\u0111/g,'d').replace(/\u0110/g,'D').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();

document.getElementById('base').textContent = D.baseUrl;
document.getElementById('intro').innerHTML =
  '<p class="label">Xác thực</p><p>' + esc(D.auth.scheme) + '</p>' +
  '<pre>' + esc(D.auth.header) + '</pre>' +
  '<ul class="notes">' + D.auth.flow.map((f,i) => '<li>' + (i+1) + '. ' + esc(f) + '</li>').join('') + '</ul>' +
  '<p class="label">Dev bypass</p><p class="blurb">' + esc(D.auth.devBypass) + '</p>' +
  '<p class="label">Quy ước</p><ul class="notes">' + D.conventions.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
  '<p class="label">Thử API trực tiếp</p><p><a href="/api/docs"><strong>Swagger UI</strong> — có nút Try it out</a></p>' +
  '<p class="label">Máy đọc</p><p><a href="/api/openapi.json">OpenAPI 3.0</a> · <a href="/api/docs.json">bản JSON gọn</a> · <a href="/health">GET /health</a></p>';

// ---------------------------------------------------------------- ô lấy token
// Trình duyệt gọi THẲNG Firebase; server này không bao giờ nhận mật khẩu.
const TKEY = 'ssm_api_token';
const A = document.getElementById('auth');
const load = () => { try { return JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { return null; } };
const alive = t => t && t.token && t.exp > Date.now();
const mins = t => Math.max(0, Math.round((t.exp - Date.now()) / 60000));

if (!D.login.enabled) {
  A.innerHTML = '<p class="label">Lấy token để thử API</p>' +
    '<p class="blurb">Chưa bật. Đặt biến môi trường <code>FIREBASE_WEB_API_KEY</code> cho server ' +
    '(Firebase Console → Project settings → General → Your apps → Web app → <code>apiKey</code>) rồi khởi động lại. ' +
    'Key này vốn public — nó đã nằm trong bundle trình duyệt của Webapp.</p>';
} else {
  const accts = D.login.accounts.map(a =>
    '<button class="pill" data-em="' + esc(a.email) + '" title="' + esc(a.email) + '">' + esc(a.role) + '</button>').join('');
  A.innerHTML =
    '<p class="label">Lấy token để thử API</p>' +
    '<div class="row">' +
      '<input id="em" class="f" placeholder="email" autocomplete="username">' +
      '<input id="pw" class="f" type="password" placeholder="mật khẩu" autocomplete="current-password">' +
      '<button id="go" class="btn">Đăng nhập</button>' +
    '</div>' +
    '<p class="blurb mt">Tài khoản demo — bấm để điền' +
      (D.login.demoPassword ? ' cả mật khẩu' : ' email') + ':<br>' + accts + '</p>' +
    '<div id="out"></div>';

  const em = document.getElementById('em');
  const pw = document.getElementById('pw');
  const go = document.getElementById('go');
  const out = document.getElementById('out');

  A.querySelectorAll('.pill').forEach(b => b.addEventListener('click', () => {
    em.value = b.dataset.em;
    if (D.login.demoPassword) pw.value = D.login.demoPassword;
    (D.login.demoPassword ? go : pw).focus();
  }));

  let timer = null;
  function show(t, who) {
    if (timer) clearInterval(timer);
    out.innerHTML =
      '<div class="who" id="who"></div>' +
      '<div class="tok" id="tk"></div>' +
      '<div class="row">' +
        '<button class="btn" id="cp">Sao chép token</button>' +
        '<button class="btn alt" id="sw">Mở Swagger đã đăng nhập</button>' +
        '<button class="btn ghost" id="out2">Xóa token</button>' +
      '</div>';
    document.getElementById('tk').textContent = t.token;
    const whoEl = document.getElementById('who');
    const tick = () => { whoEl.innerHTML = who + ' · còn <strong>' + mins(t) + ' phút</strong>'; };
    tick(); timer = setInterval(tick, 30000);

    document.getElementById('cp').addEventListener('click', function () {
      navigator.clipboard.writeText(t.token).then(() => { this.textContent = 'Đã sao chép ✓'; setTimeout(() => { this.textContent = 'Sao chép token'; }, 1500); });
    });
    document.getElementById('sw').addEventListener('click', () => { location.href = '/api/docs'; });
    document.getElementById('out2').addEventListener('click', () => {
      localStorage.removeItem(TKEY); if (timer) clearInterval(timer); out.innerHTML = '';
    });
  }

  async function whoami(token) {
    try {
      const r = await fetch(D.baseUrl + '/auth/me', { headers: { authorization: 'Bearer ' + token } });
      const j = await r.json();
      if (r.ok && j.user) return '✅ ' + esc(j.user.fullName || j.user.email || '') + ' — <strong>' + esc(j.user.role) + '</strong>';
      return '⚠️ Firebase OK nhưng API trả ' + r.status + ' ' + esc((j.error && j.error.code) || '');
    } catch (e) { return '⚠️ Không gọi được /auth/me'; }
  }

  async function login() {
    out.innerHTML = ''; go.disabled = true; go.textContent = 'Đang đăng nhập…';
    try {
      const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(D.login.apiKey), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: em.value.trim(), password: pw.value, returnSecureToken: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'ĐĂNG NHẬP THẤT BẠI');
      const t = { token: j.idToken, exp: Date.now() + Number(j.expiresIn || 3600) * 1000, email: em.value.trim() };
      localStorage.setItem(TKEY, JSON.stringify(t));
      show(t, await whoami(t.token));
    } catch (e) {
      const m = { EMAIL_NOT_FOUND: 'Email không tồn tại', INVALID_PASSWORD: 'Sai mật khẩu', INVALID_LOGIN_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
        USER_DISABLED: 'Tài khoản bị khóa', TOO_MANY_ATTEMPTS_TRY_LATER: 'Thử quá nhiều lần, đợi ít phút' };
      out.innerHTML = '<div class="err">' + esc(m[e.message] || e.message) + '</div>';
    } finally { go.disabled = false; go.textContent = 'Đăng nhập'; }
  }

  go.addEventListener('click', login);
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  const saved = load();
  if (alive(saved)) { em.value = saved.email || ''; whoami(saved.token).then(w => show(saved, w)); }
}

const roleHtml = a => a === 'PUBLIC' ? '<span class="chip pub">công khai</span>'
  : a === 'ANY' ? '<span class="chip any">mọi vai trò đã đăng nhập</span>'
  : a.map(r => '<span class="chip">' + esc(r) + '</span>').join('');

const fieldTable = (title, rows) => !rows || !rows.length ? '' :
  '<p class="label">' + title + '</p><table><thead><tr><th>Tên</th><th>Kiểu</th><th>Ghi chú</th></tr></thead><tbody>' +
  rows.map(f => '<tr><td class="k">' + esc(f.name) + (f.required ? ' <span class="req">*</span>' : '') +
    '</td><td class="t">' + esc(f.type) + '</td><td>' + esc(f.note || '') + '</td></tr>').join('') + '</tbody></table>';

document.getElementById('body').innerHTML = D.groups.map(g =>
  '<section data-group><h2 id="' + slug(g.name) + '">' + esc(g.name) + '</h2><p class="blurb">' + esc(g.blurb) + '</p>' +
  g.routes.map(r => '<article class="route" data-text="' + esc((r.method + ' ' + r.path + ' ' + r.summary + ' ' + (Array.isArray(r.auth) ? r.auth.join(' ') : r.auth)).toLowerCase()) + '">' +
    '<div class="head"><span class="m ' + r.method + '">' + r.method + '</span>' +
    '<span class="p">' + esc(D.baseUrl.replace(/^https?:\\/\\/[^/]+/, '')) + esc(r.path) + '</span>' +
    '<span class="roles">' + roleHtml(r.auth) + '</span></div>' +
    '<p class="sum">' + esc(r.summary) + '</p>' +
    fieldTable('Query', r.query) + fieldTable('Body', r.body) +
    (r.notes ? '<ul class="notes">' + r.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
    '</article>').join('') + '</section>').join('');

document.getElementById('nav').innerHTML = D.groups.map(g =>
  '<a href="#' + slug(g.name) + '">' + esc(g.name) + '</a>').join('') + '<a href="#errors">Mã lỗi</a>';

document.querySelector('#errtable tbody').innerHTML = D.errors.map(e =>
  '<tr><td class="k">' + e.status + '</td><td class="k">' + esc(e.code) + '</td><td>' + esc(e.meaning) + '</td></tr>').join('');

document.getElementById('q').addEventListener('input', ev => {
  const q = ev.target.value.trim().toLowerCase();
  document.querySelectorAll('#body section').forEach(sec => {
    let any = false;
    sec.querySelectorAll('.route').forEach(r => {
      const hit = !q || r.dataset.text.includes(q);
      r.classList.toggle('hide', !hit);
      any = any || hit;
    });
    sec.classList.toggle('hide', !any);
  });
});
</script></body></html>`;

export const docsRouter = Router();

const baseUrl = (req: { protocol: string; get(h: string): string | undefined }) => `${req.protocol}://${req.get('host') ?? 'localhost'}/api`;

docsRouter.get('/docs.json', (req, res) => {
  res.json(docsPayload(baseUrl(req)));
});

docsRouter.get('/', (req, res) => {
  // JSON nhúng trong <script>: chặn "</script>" và U+2028/2029 để không vỡ trang
  const json = JSON.stringify(docsPayload(baseUrl(req)))
    .replace(/</g, '\\u003c').replace(/\\u2028/g, '\\u2028').replace(/\\u2029/g, '\\u2029');
  // helmet đặt CSP mặc định chặn inline script → nới đúng cho trang này bằng nonce, không dùng 'unsafe-inline'
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self' https://identitytoolkit.googleapis.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  res.type('html').send(PAGE(json, nonce));
});
