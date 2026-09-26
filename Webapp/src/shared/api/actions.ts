'use client';

import type {
  BusinessPolicy, CancellationReason, CheckInShift, ClaimItem, ClaimType, DamageClaim, Facility, InspectionLog,
  PaymentMethod, RentalContract, RentalPeriod, Reservation, Role, StorageUnit, SupportTicket, SwapMethod,
  TicketCategory, TicketKind, TicketPriority, TicketStatus, UnitStatus, UnitSwapRequest, User,
} from '@ssm/shared';
import { api } from '@/shared/api/client';

/**
 * Every UI action → one REST call. The server enforces roles, facility scope and state machines;
 * the store refreshes its snapshot afterwards, so pages never patch local state by hand.
 */
const day = (iso: string) => iso.slice(0, 10);
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export interface BookingLine {
  unitTypeId: string; unitId: string; startDate: string; rentalPeriod: RentalPeriod; periods: number;
  /** Ca giờ khách dự kiến đến nhận kho — chọn ngay lúc đặt; 'UNKNOWN' = "Chưa rõ giờ". */
  preferredCheckInShift: CheckInShift;
}

export const actions = {
  // Khách bắt buộc chọn ô cụ thể (unitId) trên sơ đồ và chu kỳ thuê (rentalPeriod) lúc đặt.
  createReservation: async (p: BookingLine & { source?: Reservation['source']; consent: { termsVersion: string; privacyVersion: string } }) =>
    api.post<Reservation>('/reservations', {
      unitTypeId: p.unitTypeId, unitId: p.unitId, startDate: day(p.startDate), rentalPeriod: p.rentalPeriod, periods: p.periods,
      preferredCheckInShift: p.preferredCheckInShift,
      source: p.source === 'MOBILE' ? 'MOBILE' : 'WEB', consent: p.consent,
    }, { 'idempotency-key': newKey() }),

  /** Đặt nhiều kho một lần (giỏ hàng) — cùng một lần chấp thuận điều khoản cho toàn giỏ. */
  createReservationsBatch: async (p: { items: BookingLine[]; consent: { termsVersion: string; privacyVersion: string } }) =>
    (await api.post<{ items: Reservation[] }>('/reservations/batch', p, { 'idempotency-key': newKey() })).items,

  payDeposit: async (p: { reservationId: string; method: PaymentMethod }) =>
    api.post<{ reservation: Reservation; qrPayload: string }>(`/reservations/${p.reservationId}/pay-deposit`, { method: p.method }),

  cancelReservation: async (p: { reservationId: string; reason: CancellationReason; note?: string }) =>
    (await api.post<{ refund: { pct: number; amount: number } }>(`/reservations/${p.reservationId}/cancel`, { reason: p.reason, note: p.note })).refund.amount,

  allocate: async (p: { reservationId: string; unitId?: string }) =>
    (await api.post<{ unit: StorageUnit }>(`/reservations/${p.reservationId}/allocate`, p.unitId ? { unitId: p.unitId } : {})).unit,

  unallocate: async (p: { reservationId: string }) => { await api.post(`/reservations/${p.reservationId}/unallocate`); },

  checkIn: async (p: { reservationId: string; keyTag?: string; payMethod: PaymentMethod }) =>
    api.post<{ contract: RentalContract; unit: StorageUnit; pin?: string }>(`/reservations/${p.reservationId}/check-in`, { keyTag: p.keyTag, payMethod: p.payMethod }),

  requestMoveOut: async (p: { contractId: string; date: string }) => { await api.post(`/contracts/${p.contractId}/move-out`, { date: day(p.date) }); },
  receiveUnit: async (p: { contractId: string }) => { await api.post(`/contracts/${p.contractId}/receive`); },

  submitInspection: async (p: { contractId: string; checklist: InspectionLog['checklist']; damages: InspectionLog['damages']; notes?: string }) =>
    (await api.post<{ inspection: InspectionLog }>(`/contracts/${p.contractId}/inspection`, { checklist: p.checklist, damages: p.damages, notes: p.notes || undefined })).inspection,

  extendContract: async (p: { contractId: string; periods: number; method: PaymentMethod }) =>
    (await api.post<{ amount: number }>(`/contracts/${p.contractId}/extend`, { periods: p.periods, method: p.method })).amount,

  payBalance: async (p: { contractId: string; method: PaymentMethod }) =>
    (await api.post<{ amount: number }>(`/contracts/${p.contractId}/pay-balance`, { method: p.method })).amount,

  lockout: async (p: { contractId: string }) => { await api.post(`/contracts/${p.contractId}/lockout`); },

  /** Đổi ô kho cùng loại. Giá thuê và tiền cọc của hợp đồng không đổi — server từ chối nếu ô mới khác loại. */
  swapUnit: async (p: { contractId: string; toUnitId: string; reason: string; keyTag?: string; fee?: number }) =>
    (await api.post<{ fromUnit: StorageUnit; toUnit: StorageUnit; fee: number }>(`/contracts/${p.contractId}/swap-unit`, {
      toUnitId: p.toUnitId, reason: p.reason, keyTag: p.keyTag || undefined, fee: p.fee || undefined,
    })).toUnit,

  waiveLateFees: async (p: { contractId: string; reason: string }) =>
    (await api.post<{ amount: number }>(`/contracts/${p.contractId}/waive-late-fees`, { reason: p.reason })).amount,

  setUnitStatus: async (p: { unitId: string; to: UnitStatus; reason?: string }) => { await api.patch(`/units/${p.unitId}/status`, { to: p.to, reason: p.reason }); },

  addUnit: async (p: { unitTypeId: string; unitNumber: string; floor: number }) => { await api.post('/units', p); },

  createTicket: async (p: { facilityId: string; kind: TicketKind; category: TicketCategory; priority: TicketPriority; subject: string; description: string; unitId?: string | null; contractId?: string | null; assigneeId?: string | null; dueAt?: string | null }) =>
    api.post<SupportTicket>('/tickets', { ...p, description: p.description || undefined }),

  assignTicket: async (p: { ticketId: string; assigneeId: string }) => { await api.post(`/tickets/${p.ticketId}/assign`, { assigneeId: p.assigneeId }); },
  setTicketStatus: async (p: { ticketId: string; to: TicketStatus }) => { await api.post(`/tickets/${p.ticketId}/status`, { to: p.to }); },
  addTicketMessage: async (p: { ticketId: string; body: string; internal?: boolean }) => { await api.post(`/tickets/${p.ticketId}/messages`, { body: p.body, internal: !!p.internal }); },

  // ---- bồi thường hư hỏng / mất mát
  createClaim: async (p: { contractId: string; type: ClaimType; incidentAt: string; description: string; items: ClaimItem[]; ticketId?: string | null }) =>
    api.post<DamageClaim>('/claims', { ...p, ticketId: p.ticketId || undefined }),

  reviewClaim: async (p: { claimId: string }) => { await api.post(`/claims/${p.claimId}/review`); },

  decideClaim: async (p: { claimId: string; approve: boolean; approvedAmount?: number; note: string }) =>
    api.post<DamageClaim>(`/claims/${p.claimId}/decide`, { approve: p.approve, approvedAmount: p.approve ? p.approvedAmount : undefined, note: p.note }),

  payClaim: async (p: { claimId: string; method: 'BANK_TRANSFER' | 'CASH' }) =>
    (await api.post<{ payment: { amount: number } }>(`/claims/${p.claimId}/pay`, { method: p.method })).payment.amount,

  withdrawClaim: async (p: { claimId: string; reason?: string }) => { await api.post(`/claims/${p.claimId}/withdraw`, { reason: p.reason || undefined }); },

  saveFacility: async (p: Pick<Facility, 'name' | 'code' | 'status'> & { _id?: string; line1: string; district: string; phone: string }) => {
    const body = { name: p.name, status: p.status, line1: p.line1, district: p.district, phone: p.phone };
    if (p._id) await api.patch(`/facilities/${p._id}`, body);
    else await api.post('/facilities', { ...body, code: p.code });
  },

  publishPolicy: async (p: { facilityId: string | null; patch: Partial<BusinessPolicy> }) => api.post<BusinessPolicy>('/policies', p),

  setUnitTypeRates: async (p: { unitTypeId: string; rates: Partial<Record<RentalPeriod, number>> }) => { await api.patch(`/facilities/unit-types/${p.unitTypeId}/price`, { rates: p.rates }); },

  // ---- yêu cầu đổi ô kho (A1b): khách gửi yêu cầu, FM xét duyệt
  requestUnitSwap: async (p: { contractId: string; toUnitId: string; method: SwapMethod; reason: string }) =>
    api.post<UnitSwapRequest>(`/contracts/${p.contractId}/swap-requests`, { toUnitId: p.toUnitId, method: p.method, reason: p.reason }),

  cancelSwapRequest: async (p: { swapRequestId: string }) => { await api.post(`/swap-requests/${p.swapRequestId}/cancel`); },

  decideSwapRequest: async (p: { swapRequestId: string; approve: boolean; facilityFault?: boolean; fee?: number; scheduledFor?: string; rejectReason?: string }) =>
    api.post<UnitSwapRequest>(`/swap-requests/${p.swapRequestId}/decide`, {
      approve: p.approve, facilityFault: p.facilityFault, fee: p.fee, scheduledFor: p.scheduledFor, rejectReason: p.rejectReason,
    }),

  completeSwapRequest: async (p: { swapRequestId: string }) => api.post<{ contract: RentalContract }>(`/swap-requests/${p.swapRequestId}/complete`),

  saveUser: async (p: { _id?: string; fullName: string; email: string; role: Role; facilityIds: string[]; status: User['status']; shift?: CheckInShift | null }) => {
    if (p._id) { await api.patch(`/users/${p._id}`, { fullName: p.fullName, role: p.role, facilityIds: p.facilityIds, status: p.status, shift: p.role === 'STAFF' ? p.shift : null }); return { resetLink: null as string | null }; }
    return api.post<{ resetLink: string | null }>('/users', { fullName: p.fullName, email: p.email, role: p.role, facilityIds: p.facilityIds, status: p.status, shift: p.role === 'STAFF' ? p.shift : undefined });
  },
};

export type Actions = typeof actions;
export type ActionName = keyof Actions;
export type Payload<K extends ActionName> = Parameters<Actions[K]>[0];
export type Value<K extends ActionName> = Awaited<ReturnType<Actions[K]>>;
