const values = <T extends Record<string, string>>(o: T) => Object.values(o) as T[keyof T][];
export { values as enumValues };

export const Role = { CUSTOMER: 'CUSTOMER', STAFF: 'STAFF', FACILITY_MANAGER: 'FACILITY_MANAGER', OPS_MANAGER: 'OPS_MANAGER', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const FACILITY_SCOPED_ROLES: readonly Role[] = [Role.STAFF, Role.FACILITY_MANAGER];

export const UserStatus = { PENDING_VERIFICATION: 'PENDING_VERIFICATION', ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const FacilityStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', UNDER_CONSTRUCTION: 'UNDER_CONSTRUCTION' } as const;
export type FacilityStatus = (typeof FacilityStatus)[keyof typeof FacilityStatus];

export const UnitCategory = { LOCKER: 'LOCKER', SMALL: 'SMALL', MEDIUM: 'MEDIUM', LARGE: 'LARGE', XL: 'XL', VEHICLE: 'VEHICLE' } as const;
export type UnitCategory = (typeof UnitCategory)[keyof typeof UnitCategory];

export const PriceTier = { ECONOMY: 'ECONOMY', STANDARD: 'STANDARD', PREMIUM: 'PREMIUM' } as const;
export type PriceTier = (typeof PriceTier)[keyof typeof PriceTier];

export const UnitStatus = { AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', OCCUPIED: 'OCCUPIED', MAINTENANCE: 'MAINTENANCE', PENDING_INSPECTION: 'PENDING_INSPECTION' } as const;
export type UnitStatus = (typeof UnitStatus)[keyof typeof UnitStatus];

export const ReservationStatus = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', ALLOCATED: 'ALLOCATED', CHECKED_IN: 'CHECKED_IN', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' } as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const CancellationReason = { CUSTOMER_REQUEST: 'CUSTOMER_REQUEST', HOLD_EXPIRED: 'HOLD_EXPIRED', PAYMENT_FAILED: 'PAYMENT_FAILED', NO_SHOW: 'NO_SHOW', FACILITY_UNAVAILABLE: 'FACILITY_UNAVAILABLE', ADMIN_OVERRIDE: 'ADMIN_OVERRIDE' } as const;
export type CancellationReason = (typeof CancellationReason)[keyof typeof CancellationReason];

export const ContractStatus = { ACTIVE: 'ACTIVE', DELINQUENT: 'DELINQUENT', LOCKED_OUT: 'LOCKED_OUT', MOVE_OUT_PENDING: 'MOVE_OUT_PENDING', CLOSED: 'CLOSED' } as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];
export const OPEN_CONTRACT_STATUSES: readonly ContractStatus[] = ['ACTIVE', 'DELINQUENT', 'LOCKED_OUT', 'MOVE_OUT_PENDING'];

export const DepositStatus = { HELD: 'HELD', PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED', REFUNDED: 'REFUNDED', FORFEITED: 'FORFEITED' } as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

export const AccessMethod = { PHYSICAL_KEY: 'PHYSICAL_KEY', PIN: 'PIN', RFID_CARD: 'RFID_CARD' } as const;
export type AccessMethod = (typeof AccessMethod)[keyof typeof AccessMethod];

export const PaymentType = { DEPOSIT: 'DEPOSIT', RENT: 'RENT', RENEWAL: 'RENEWAL', LATE_FEE: 'LATE_FEE', DAMAGE_FEE: 'DAMAGE_FEE', PENALTY: 'PENALTY', REFUND: 'REFUND', WAIVER: 'WAIVER', COMPENSATION: 'COMPENSATION' } as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];
/** Tiền đi RA khỏi doanh nghiệp → direction = 'REFUND'. COMPENSATION không có refundOf vì không hoàn lại khoản thu nào. */
export const OUTBOUND_PAYMENT_TYPES: readonly PaymentType[] = ['REFUND', 'COMPENSATION'];

export const PaymentStatus = { PENDING: 'PENDING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', CANCELLED: 'CANCELLED', PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED', REFUNDED: 'REFUNDED' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = { CARD: 'CARD', BANK_TRANSFER: 'BANK_TRANSFER', VNPAY: 'VNPAY', MOMO: 'MOMO', CASH: 'CASH', INTERNAL: 'INTERNAL' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const InspectionType = { MOVE_IN: 'MOVE_IN', MOVE_OUT: 'MOVE_OUT', ROUTINE: 'ROUTINE', MAINTENANCE: 'MAINTENANCE' } as const;
export type InspectionType = (typeof InspectionType)[keyof typeof InspectionType];

export const InspectionOutcome = { PASS: 'PASS', PASS_WITH_DAMAGE: 'PASS_WITH_DAMAGE', MAINTENANCE_REQUIRED: 'MAINTENANCE_REQUIRED' } as const;
export type InspectionOutcome = (typeof InspectionOutcome)[keyof typeof InspectionOutcome];

export const InspectionStatus = { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED' } as const;
export type InspectionStatus = (typeof InspectionStatus)[keyof typeof InspectionStatus];

export const ItemCondition = { OK: 'OK', DAMAGED: 'DAMAGED', MISSING: 'MISSING' } as const;
export type ItemCondition = (typeof ItemCondition)[keyof typeof ItemCondition];

export const TicketKind = { CUSTOMER_ISSUE: 'CUSTOMER_ISSUE', OPS_TASK: 'OPS_TASK' } as const;
export type TicketKind = (typeof TicketKind)[keyof typeof TicketKind];

export const TicketCategory = { ACCESS: 'ACCESS', DAMAGE: 'DAMAGE', PEST: 'PEST', BILLING: 'BILLING', MAINTENANCE: 'MAINTENANCE', SECURITY: 'SECURITY', CLEANING: 'CLEANING', OTHER: 'OTHER' } as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];

export const TicketPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' } as const;
export type TicketPriority = (typeof TicketPriority)[keyof typeof TicketPriority];

export const TicketStatus = { OPEN: 'OPEN', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED' } as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const AuditResult = { SUCCESS: 'SUCCESS', DENIED: 'DENIED', FAILED: 'FAILED' } as const;
export type AuditResult = (typeof AuditResult)[keyof typeof AuditResult];

// ---------- Bồi thường hư hỏng / mất mát (A2) ----------
export const ClaimType = { DAMAGE: 'DAMAGE', LOSS: 'LOSS' } as const;
export type ClaimType = (typeof ClaimType)[keyof typeof ClaimType];

export const ClaimStatus = {
  SUBMITTED: 'SUBMITTED',       // khách vừa gửi
  UNDER_REVIEW: 'UNDER_REVIEW', // chi nhánh đang xác minh
  APPROVED: 'APPROVED',         // đã duyệt số tiền, chờ chi
  REJECTED: 'REJECTED',
  PAID: 'PAID',                 // đã chi tiền
  WITHDRAWN: 'WITHDRAWN',       // khách tự rút
} as const;
export type ClaimStatus = (typeof ClaimStatus)[keyof typeof ClaimStatus];
export const OPEN_CLAIM_STATUSES: readonly ClaimStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
