import type {
  AccessMethod, AuditResult, CancellationReason, ClaimStatus, ClaimType, ContractStatus, DepositStatus, FacilityStatus,
  InspectionOutcome, InspectionStatus, InspectionType, ItemCondition, PaymentMethod, PaymentStatus, PaymentType, PriceTier,
  ReservationStatus, Role, TicketCategory, TicketKind, TicketPriority, TicketStatus, UnitCategory, UnitStatus, UserStatus,
} from './enums';

/**
 * Generic over id/date so ONE definition serves both sides:
 *   client: Reservation            (I = string,          D = string ISO)
 *   server: Reservation<ObjectId, Date>
 * All money = integer in the facility currency's minor unit (VND has none -> plain đồng).
 */
export type ID = string;
export type CurrencyCode = 'VND' | 'USD';

export interface BaseEntity<I = ID, D = string> {
  _id: I;
  createdAt: D;
  updatedAt: D;
  createdBy?: I | null;
  updatedBy?: I | null;
}
export interface SoftDeletable<I = ID, D = string> {
  isDeleted: boolean;
  deletedAt?: D | null;
  deletedBy?: I | null;
}
export interface StatusChange<S extends string, I = ID, D = string> {
  from: S | null;
  to: S;
  at: D;
  by?: I | null;
  reason?: string;
}

// ---------- User ----------
export interface User<I = ID, D = string> extends BaseEntity<I, D>, SoftDeletable<I, D> {
  /** Firebase Auth uid (email/password or Google). null = profile not yet linked to a login. */
  firebaseUid?: string | null;
  email: string;
  phone?: string | null;
  fullName: string;
  role: Role;
  /** Required (>=1) for STAFF / FACILITY_MANAGER; must be empty for every other role. */
  facilityIds: I[];
  status: UserStatus;
  /** Bump to invalidate every issued refresh token (logout-all, role change, suspension). */
  tokenVersion: number;
  lastLoginAt?: D | null;
  /** Chấp thuận Điều khoản + Chính sách bảo mật tại thời điểm tạo tài khoản. null với tài khoản tạo trước tính năng này. */
  consent?: {
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: D;
    method: 'SIGNUP_FORM' | 'GOOGLE';
  } | null;
  customerProfile?: {
    idType?: 'CCCD' | 'PASSPORT';
    idNumberLast4?: string;               // never store the full national ID
    address?: string;
    emergencyContact?: { name: string; phone: string };
  } | null;
}

// ---------- Facility ----------
export interface Facility<I = ID, D = string> extends BaseEntity<I, D>, SoftDeletable<I, D> {
  code: string;                           // "HCM-Q7-01"
  name: string;
  status: FacilityStatus;
  address: { line1: string; ward?: string; district: string; city: string; country: string };
  location: { type: 'Point'; coordinates: [lng: number, lat: number] };
  timezone: string;                       // IANA, e.g. "Asia/Ho_Chi_Minh"
  currency: CurrencyCode;
  operatingHours: { dayOfWeek: number; open: string; close: string }[]; // 0=Sun, "HH:mm"
  accessHours?: { open: string; close: string } | null;
  contact: { phone: string; email?: string };
  amenities: string[];
  imageUrls: string[];
  /** Facility-specific policy; null -> active GLOBAL policy applies. */
  policyId?: I | null;
}

// ---------- UnitType (per facility) ----------
export interface UnitType<I = ID, D = string> extends BaseEntity<I, D>, SoftDeletable<I, D> {
  facilityId: I;
  code: string;                           // "M-3x3"; shared code across branches enables chain-wide BI
  name: string;
  category: UnitCategory;
  description?: string;
  dimensions: { widthM: number; depthM: number; heightM: number };
  areaM2: number;                         // derived
  features: { climateControlled: boolean; driveUp: boolean; indoor: boolean; powerOutlet: boolean };
  pricing: { baseMonthlyRate: number; tierMultipliers: Record<PriceTier, number> };
  depositOverride?: number | null;
  minRentalMonths: number;
  imageUrls: string[];
  isActive: boolean;
  /** Concurrency token. Every reservation/allocation txn for this type increments it -> concurrent txns write-conflict. */
  inventoryVersion: number;
}

// ---------- StorageUnit (physical unit) ----------
export interface StorageUnit<I = ID, D = string> extends BaseEntity<I, D>, SoftDeletable<I, D> {
  facilityId: I;
  unitTypeId: I;
  unitNumber: string;                     // "B2-117"
  location: { building?: string; floor: number; zone?: string; aisle?: string };
  status: UnitStatus;
  statusChangedAt: D;
  statusReason?: string | null;
  priceTier: PriceTier;
  monthlyRateOverride?: number | null;
  currentReservationId?: I | null;
  currentContractId?: I | null;
  /** Lockout is an overlay on OCCUPIED, not a separate unit status. */
  overlockActive: boolean;
  lock: { type: 'PADLOCK' | 'SMART_LOCK'; deviceId?: string | null };
  notes?: string;
}

// ---------- Reservation ----------
export interface PriceQuote<I = ID> {
  currency: CurrencyCode;
  priceTier: PriceTier;
  monthlyRate: number;
  depositAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  appliedRuleCodes: string[];
  firstPeriodRent: number;
  totalDueAtBooking: number;
  policyId: I;
  policyVersion: number;
}

export interface Reservation<I = ID, D = string> extends BaseEntity<I, D> {
  code: string;                           // "RSV-260911-7K2Q9M"
  facilityId: I;
  customerId: I;
  unitTypeId: I;
  unitId?: I | null;                      // set on ALLOCATED
  status: ReservationStatus;
  startDate: D;                           // date-only: facility-local calendar day stored as 00:00Z
  durationMonths: number;
  endDate: D;                             // derived: startDate + durationMonths
  quote: PriceQuote<I>;                   // frozen at booking -> later price/policy changes don't affect it
  holdExpiresAt?: D | null;               // PENDING only
  depositPaymentId?: I | null;
  allocation?: { allocatedAt: D; allocatedBy?: I | null } | null;
  checkIn?: { qrTokenHash?: string | null; qrExpiresAt?: D | null; checkedInAt?: D | null; checkedInBy?: I | null } | null;
  cancellation?: { reason: CancellationReason; note?: string; cancelledAt: D; cancelledBy?: I | null; refundAmount: number } | null;
  contractId?: I | null;
  source: 'WEB' | 'MOBILE' | 'WALK_IN';
  idempotencyKey?: string | null;
  /**
   * Bằng chứng khách đã chấp thuận Điều khoản + Chính sách bảo mật tại thời điểm đặt.
   * null với dữ liệu tạo trước khi tính năng này tồn tại; bắt buộc với mọi đặt chỗ mới qua API.
   */
  consent?: {
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: D;
    ip?: string | null;
    userAgent?: string | null;
  } | null;
  statusHistory: StatusChange<ReservationStatus, I, D>[];
}

// ---------- RentalContract ----------
export interface RentalContract<I = ID, D = string> extends BaseEntity<I, D> {
  contractNumber: string;
  facilityId: I;
  customerId: I;
  unitId: I;
  unitTypeId: I;
  reservationId: I;
  status: ContractStatus;
  startDate: D;
  endDate: D;                             // current term end (moves on renewal)
  autoRenew: boolean;
  billing: { currency: CurrencyCode; monthlyRate: number; billingDay: number; nextBillingDate: D; paidThrough: D };
  deposit: { amount: number; status: DepositStatus; paymentId?: I | null; refundedAmount: number };
  balance: { outstanding: number; lastPaymentAt?: D | null };
  delinquency?: { since: D; daysOverdue: number; lateFeesAccrued: number; lockedOutAt?: D | null } | null;
  access: {
    method: AccessMethod;
    keyTag?: string | null;               // physical key label
    credentialHash?: string | null;       // PIN/card: hash or provider ref only, never plaintext
    issuedAt?: D | null; issuedBy?: I | null;
    suspendedAt?: D | null; revokedAt?: D | null;
  };
  terms: { policyId: I; policyVersion: number; gracePeriodDays: number; lockoutAfterDays: number; signedAt: D; signatureRef?: string };
  renewals: { previousEndDate: D; newEndDate: D; months: number; paymentId?: I | null; at: D }[];
  /**
   * Lịch sử đổi ô kho (A1). Chỉ đổi được sang ô CÙNG loại (unitTypeId không đổi), nên
   * billing.monthlyRate và deposit giữ nguyên theo hợp đồng đã ký — đổi ô không phải là định giá lại.
   * Optional: hợp đồng tạo trước tính năng này không có trường này khi đọc bằng lean().
   */
  unitSwaps?: { fromUnitId: I; toUnitId: I; reason: string; fee: number; paymentId?: I | null; at: D; by?: I | null }[];
  moveOut?: { requestedAt: D; scheduledFor?: D | null; completedAt?: D | null; inspectionId?: I | null } | null;
  closedAt?: D | null;
  statusHistory: StatusChange<ContractStatus, I, D>[];
}

// ---------- PaymentTransaction ----------
export interface PaymentTransaction<I = ID, D = string> extends BaseEntity<I, D> {
  facilityId: I;
  customerId: I;
  contractId?: I | null;
  reservationId?: I | null;
  type: PaymentType;
  direction: 'CHARGE' | 'REFUND';         // amount always positive; direction gives the sign
  amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  method: PaymentMethod;
  period?: { start: D; end: D } | null;   // RENT / RENEWAL coverage
  provider?: { name: string; txnRef?: string | null; rawStatus?: string } | null;
  idempotencyKey: string;
  refundOf?: I | null;
  refundedAmount: number;
  waiver?: { approvedBy: I; reason: string } | null;
  recordedBy?: I | null;                  // staff member who took cash
  paidAt?: D | null;
  failureReason?: string | null;
  statusHistory: StatusChange<PaymentStatus, I, D>[];
}

// ---------- InspectionLog ----------
export interface InspectionLog<I = ID, D = string> extends BaseEntity<I, D> {
  facilityId: I;
  unitId: I;
  contractId?: I | null;
  type: InspectionType;
  status: InspectionStatus;
  inspectorId: I;
  performedAt: D;
  checklist: { item: string; condition: ItemCondition; note?: string }[];
  damages: { description: string; severity: 'MINOR' | 'MODERATE' | 'SEVERE'; cost: number; photoUrls: string[] }[];
  photoUrls: string[];
  outcome?: InspectionOutcome | null;
  totalDamageFee: number;
  depositSettlement?: {
    depositHeld: number; deductions: number; refundAmount: number;
    refundPaymentId?: I | null; damagePaymentId?: I | null; approvedBy?: I | null; approvedAt?: D | null;
  } | null;
  notes?: string;
}

// ---------- SupportTicket (customer issues + internal ops tasks share one queue) ----------
export interface SupportTicket<I = ID, D = string> extends BaseEntity<I, D>, SoftDeletable<I, D> {
  ticketNumber: string;
  kind: TicketKind;
  facilityId: I;
  reporterId: I;
  contractId?: I | null;
  unitId?: I | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  attachmentUrls: string[];
  assigneeId?: I | null;
  dueAt?: D | null;                       // SLA / task deadline
  resolvedAt?: D | null;
  messages: { authorId: I; body: string; internal: boolean; at: D }[];
  statusHistory: StatusChange<TicketStatus, I, D>[];
}

// ---------- DamageClaim (bồi thường hư hỏng / mất mát) ----------
export interface ClaimItem {
  name: string;
  quantity: number;
  /** Giá trị khai báo cho MỘT đơn vị. Tổng dòng = quantity * unitValue. */
  unitValue: number;
  note?: string;
}

export interface DamageClaim<I = ID, D = string> extends BaseEntity<I, D> {
  claimNumber: string;                    // "CLM-260916-3F7K2Q"
  facilityId: I;
  customerId: I;
  contractId: I;
  unitId: I;
  /** Sự cố khách đã báo trước đó, nếu có — nối hồ sơ bồi thường với luồng hỗ trợ. */
  ticketId?: I | null;
  type: ClaimType;
  status: ClaimStatus;
  incidentAt: D;
  description: string;
  items: ClaimItem[];
  /** Tổng khách yêu cầu = sum(quantity * unitValue). Server tự tính, không nhận từ client. */
  claimedAmount: number;
  photoUrls: string[];
  /** Kết quả xét duyệt. Ghi một lần rồi không sửa — mở xem xét lại sẽ ghi đè bản mới kèm statusHistory. */
  review?: {
    reviewedBy: I;
    reviewedAt: D;
    /** <= min(claimedAmount, liabilityCap). 0 khi từ chối. */
    approvedAmount: number;
    /** Hạn mức trách nhiệm theo Điều khoản, chốt tại thời điểm duyệt để sau này đổi chính sách không hồi tố. */
    liabilityCap: number;
    decisionNote: string;
  } | null;
  settlement?: { paymentId: I; paidAt: D; method: PaymentMethod } | null;
  statusHistory: StatusChange<ClaimStatus, I, D>[];
}

// ---------- BusinessPolicy (Ops Manager; versioned, never edited once active) ----------
export interface BusinessPolicy<I = ID, D = string> extends BaseEntity<I, D> {
  scope: 'GLOBAL' | 'FACILITY';
  facilityId?: I | null;
  version: number;
  isActive: boolean;
  effectiveFrom: D;
  deposit: { mode: 'MONTHS_OF_RENT' | 'FIXED'; value: number };
  reservationHoldMinutes: number;
  allocationLeadDays: number;
  noShowAfterHours: number;
  gracePeriodDays: number;
  lockoutAfterDays: number;
  lateFees: { afterDays: number; kind: 'FIXED' | 'PERCENT_OF_RENT'; value: number; recurringEveryDays?: number | null }[];
  cancellation: { minHoursBeforeStart: number; depositRefundPct: number }[];
  minRentalMonths: number;
  maxRentalMonths: number;
  surcharges: { code: string; label: string; kind: 'FIXED' | 'PERCENT'; value: number; categories: UnitCategory[] }[];
  discounts: { code: string; kind: 'FIXED' | 'PERCENT'; value: number; minMonths: number; validFrom?: D | null; validTo?: D | null; requiresApprovalRole?: Role | null }[];
  waiverLimits: { role: Role; maxAmount: number }[];
}

// ---------- AuditLog (append-only) ----------
export interface AuditLog<I = ID, D = string> {
  _id: I;
  at: D;
  actorId?: I | null;
  actorRole?: Role | 'SYSTEM' | 'ANONYMOUS';
  action: string;                         // "reservation.allocate", "auth.login", "contract.override"
  entityType?: string | null;
  entityId?: I | null;
  facilityId?: I | null;
  result: AuditResult;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  reason?: string | null;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}
