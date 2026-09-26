import type {
  AccessMethod, CheckInShift, ClaimStatus, ClaimType, ContractStatus, FacilityStatus, PaymentMethod, PaymentStatus, PaymentType,
  RentalPeriod, ReservationStatus, Role, SwapMethod, SwapRequestStatus, TicketCategory, TicketKind, TicketPriority,
  TicketStatus, UnitCategory, UnitStatus, UserStatus, CancellationReason, InspectionOutcome, DepositStatus,
} from './enums';

export type Tone = 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'teal';
type LabelMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const ROLE: LabelMap<Role> = {
  CUSTOMER: { label: 'Khách hàng', tone: 'gray' },
  STAFF: { label: 'Nhân viên kho', tone: 'blue' },
  FACILITY_MANAGER: { label: 'Quản lý chi nhánh', tone: 'teal' },
  OPS_MANAGER: { label: 'Quản lý vận hành', tone: 'violet' },
  ADMIN: { label: 'Quản trị hệ thống', tone: 'red' },
};

export const UNIT_STATUS: LabelMap<UnitStatus> = {
  AVAILABLE: { label: 'Trống', tone: 'green' },
  RESERVED: { label: 'Đã giữ chỗ', tone: 'blue' },
  OCCUPIED: { label: 'Đang thuê', tone: 'teal' },
  MAINTENANCE: { label: 'Bảo trì', tone: 'amber' },
  PENDING_INSPECTION: { label: 'Chờ kiểm tra', tone: 'violet' },
};

export const RESERVATION_STATUS: LabelMap<ReservationStatus> = {
  PENDING: { label: 'Chờ đặt cọc', tone: 'amber' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'blue' },
  ALLOCATED: { label: 'Đã phân kho', tone: 'violet' },
  CHECKED_IN: { label: 'Đã nhận kho', tone: 'teal' },
  COMPLETED: { label: 'Hoàn tất', tone: 'gray' },
  CANCELLED: { label: 'Đã hủy', tone: 'red' },
};

export const CONTRACT_STATUS: LabelMap<ContractStatus> = {
  ACTIVE: { label: 'Đang hiệu lực', tone: 'green' },
  DELINQUENT: { label: 'Quá hạn thanh toán', tone: 'amber' },
  LOCKED_OUT: { label: 'Đã khóa truy cập', tone: 'red' },
  MOVE_OUT_PENDING: { label: 'Chờ trả kho', tone: 'violet' },
  CLOSED: { label: 'Đã kết thúc', tone: 'gray' },
};

export const DEPOSIT_STATUS: LabelMap<DepositStatus> = {
  HELD: { label: 'Đang giữ', tone: 'blue' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'amber' },
  REFUNDED: { label: 'Đã hoàn', tone: 'green' },
  FORFEITED: { label: 'Không hoàn', tone: 'red' },
};

export const PAYMENT_TYPE: LabelMap<PaymentType> = {
  DEPOSIT: { label: 'Tiền cọc', tone: 'blue' },
  RENT: { label: 'Tiền thuê', tone: 'teal' },
  RENEWAL: { label: 'Gia hạn', tone: 'teal' },
  LATE_FEE: { label: 'Phí trễ hạn', tone: 'amber' },
  DAMAGE_FEE: { label: 'Phí hư hại', tone: 'red' },
  PENALTY: { label: 'Phí phạt', tone: 'red' },
  REFUND: { label: 'Hoàn tiền', tone: 'violet' },
  WAIVER: { label: 'Miễn giảm', tone: 'gray' },
  COMPENSATION: { label: 'Bồi thường', tone: 'violet' },
};

export const CLAIM_STATUS: LabelMap<ClaimStatus> = {
  SUBMITTED: { label: 'Chờ tiếp nhận', tone: 'blue' },
  UNDER_REVIEW: { label: 'Đang xác minh', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt, chờ chi', tone: 'violet' },
  REJECTED: { label: 'Từ chối', tone: 'red' },
  PAID: { label: 'Đã bồi thường', tone: 'green' },
  WITHDRAWN: { label: 'Khách đã rút', tone: 'gray' },
};

export const CLAIM_TYPE: Record<ClaimType, string> = { DAMAGE: 'Hư hỏng', LOSS: 'Mất mát' };

export const PAYMENT_STATUS: LabelMap<PaymentStatus> = {
  PENDING: { label: 'Chờ thanh toán', tone: 'amber' },
  SUCCEEDED: { label: 'Thành công', tone: 'green' },
  FAILED: { label: 'Thất bại', tone: 'red' },
  CANCELLED: { label: 'Đã hủy', tone: 'gray' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'violet' },
  REFUNDED: { label: 'Đã hoàn', tone: 'violet' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  CARD: 'Thẻ ngân hàng', BANK_TRANSFER: 'Chuyển khoản', VNPAY: 'VNPay', MOMO: 'MoMo', CASH: 'Tiền mặt', INTERNAL: 'Nội bộ',
};

export const TICKET_STATUS: LabelMap<TicketStatus> = {
  OPEN: { label: 'Mới', tone: 'blue' },
  ASSIGNED: { label: 'Đã giao', tone: 'violet' },
  IN_PROGRESS: { label: 'Đang xử lý', tone: 'amber' },
  RESOLVED: { label: 'Đã xử lý', tone: 'green' },
  CLOSED: { label: 'Đã đóng', tone: 'gray' },
};

export const TICKET_PRIORITY: LabelMap<TicketPriority> = {
  LOW: { label: 'Thấp', tone: 'gray' },
  MEDIUM: { label: 'Trung bình', tone: 'blue' },
  HIGH: { label: 'Cao', tone: 'amber' },
  URGENT: { label: 'Khẩn cấp', tone: 'red' },
};

export const TICKET_CATEGORY: Record<TicketCategory, string> = {
  ACCESS: 'Ra vào / khóa', DAMAGE: 'Hư hỏng', PEST: 'Côn trùng', BILLING: 'Thanh toán',
  MAINTENANCE: 'Bảo trì', SECURITY: 'An ninh', CLEANING: 'Vệ sinh', OTHER: 'Khác',
};

export const TICKET_KIND: Record<TicketKind, string> = { CUSTOMER_ISSUE: 'Yêu cầu khách hàng', OPS_TASK: 'Công việc nội bộ' };

export const UNIT_CATEGORY: Record<UnitCategory, string> = {
  LOCKER: 'Tủ locker', SMALL: 'Nhỏ', MEDIUM: 'Vừa', LARGE: 'Lớn', XL: 'Rất lớn',
};

export const ACCESS_METHOD: Record<AccessMethod, string> = { PHYSICAL_KEY: 'Chìa khoá', PIN: 'Mật khẩu', RFID_CARD: 'Thẻ khoá' };

/** Nhãn chu kỳ thuê. RENTAL_PERIOD cho tiêu đề ("Tháng"), PERIOD_UNIT để ghép số ("3 tháng", "5 ngày"). */
export const RENTAL_PERIOD: Record<RentalPeriod, string> = { DAY: 'Ngày', WEEK: 'Tuần', MONTH: 'Tháng' };
export const PERIOD_UNIT: Record<RentalPeriod, string> = { DAY: 'ngày', WEEK: 'tuần', MONTH: 'tháng' };
export const periodLabel = (period: RentalPeriod, n: number) => `${n} ${PERIOD_UNIT[period]}`;

export const SWAP_METHOD: Record<SwapMethod, string> = { SELF: 'Tự chuyển', DELIVERY: 'Thuê người chuyển' };

export const SWAP_REQUEST_STATUS: LabelMap<SwapRequestStatus> = {
  SUBMITTED: { label: 'Chờ duyệt', tone: 'amber' },
  APPROVED: { label: 'Đã duyệt · chờ chuyển', tone: 'blue' },
  REJECTED: { label: 'Từ chối', tone: 'red' },
  DONE: { label: 'Đã đổi ô', tone: 'green' },
  EXPIRED: { label: 'Hết hạn chuyển', tone: 'gray' },
  CANCELLED: { label: 'Khách đã rút', tone: 'gray' },
};

export const FACILITY_STATUS: LabelMap<FacilityStatus> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'green' },
  INACTIVE: { label: 'Tạm ngưng', tone: 'gray' },
  UNDER_CONSTRUCTION: { label: 'Đang xây dựng', tone: 'amber' },
};

export const USER_STATUS: LabelMap<UserStatus> = {
  PENDING_VERIFICATION: { label: 'Chờ xác minh', tone: 'amber' },
  ACTIVE: { label: 'Hoạt động', tone: 'green' },
  SUSPENDED: { label: 'Tạm khóa', tone: 'red' },
};

export const CANCELLATION_REASON: Record<CancellationReason, string> = {
  CUSTOMER_REQUEST: 'Khách yêu cầu', HOLD_EXPIRED: 'Hết thời gian giữ chỗ', PAYMENT_FAILED: 'Thanh toán thất bại',
  NO_SHOW: 'Không đến nhận kho', FACILITY_UNAVAILABLE: 'Chi nhánh không đáp ứng', ADMIN_OVERRIDE: 'Quản trị hủy',
};

/** Ca giờ nhận kho khách chọn lúc đặt, cũng dùng làm ca làm việc cố định của nhân viên (STAFF.shift). */
export const CHECK_IN_SHIFT: LabelMap<CheckInShift> = {
  SHIFT_1: { label: 'Ca 1 · 09:00–10:30', tone: 'blue' },
  SHIFT_2: { label: 'Ca 2 · 10:30–12:00', tone: 'blue' },
  SHIFT_3: { label: 'Ca 3 · 14:00–15:30', tone: 'blue' },
  SHIFT_4: { label: 'Ca 4 · 15:30–17:00', tone: 'blue' },
  UNKNOWN: { label: 'Chưa rõ giờ', tone: 'gray' },
};

export const INSPECTION_OUTCOME: LabelMap<InspectionOutcome> = {
  PASS: { label: 'Đạt', tone: 'green' },
  PASS_WITH_DAMAGE: { label: 'Đạt, có hư hại', tone: 'amber' },
  MAINTENANCE_REQUIRED: { label: 'Cần bảo trì', tone: 'red' },
};
