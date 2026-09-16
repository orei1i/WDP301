import type {
  ClaimItem, ClaimType, DamageClaim, PaymentMethod, RentalContract, Reservation, StorageUnit,
  SupportTicket, TicketCategory, TicketPriority, TicketStatus,
} from '@ssm/shared';
import { PRIVACY_VERSION, TERMS_VERSION } from '@ssm/shared';
import { api } from './api';

/**
 * Mỗi hành động trên app = đúng một lời gọi REST, y hệt Webapp.
 * Server mới là nơi kiểm quyền, phạm vi chi nhánh và state machine — app không tự suy diễn gì.
 *
 * Chỉ có hành động của KHÁCH HÀNG. App này không dành cho nhân viên: mọi endpoint của
 * STAFF/MANAGER đều bị BE chặn theo vai trò nên có gọi cũng nhận 403.
 */
const day = (iso: string) => iso.slice(0, 10);
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export const actions = {
  // ---- đặt kho
  createReservation: async (p: { unitTypeId: string; startDate: string; months: number }) =>
    api.post<Reservation>('/reservations', {
      unitTypeId: p.unitTypeId,
      startDate: day(p.startDate),
      months: p.months,
      source: 'MOBILE',
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    }, { 'idempotency-key': newKey() }),

  payDeposit: async (p: { reservationId: string; method: PaymentMethod }) =>
    api.post<{ reservation: Reservation; qrPayload: string }>(`/reservations/${p.reservationId}/pay-deposit`, { method: p.method }),

  cancelReservation: async (p: { reservationId: string }) =>
    (await api.post<{ refund: { pct: number; amount: number } }>(`/reservations/${p.reservationId}/cancel`, { reason: 'CUSTOMER_REQUEST' })).refund.amount,

  /**
   * Cấp lại mã QR nhận kho. payDeposit chỉ trả payload đúng một lần rồi server giữ hash,
   * nên mở lại app là phải xin mã mới — mỗi lần gọi cũng vô hiệu hoá mã đã cấp trước đó.
   */
  reissueQr: async (p: { reservationId: string }) =>
    api.post<{ qrPayload: string; code: string; expiresAt: string }>(`/reservations/${p.reservationId}/qr`),

  // ---- hợp đồng đang thuê
  payBalance: async (p: { contractId: string; method: PaymentMethod }) =>
    (await api.post<{ amount: number }>(`/contracts/${p.contractId}/pay-balance`, { method: p.method })).amount,

  extendContract: async (p: { contractId: string; months: number; method: PaymentMethod }) =>
    (await api.post<{ amount: number }>(`/contracts/${p.contractId}/extend`, { months: p.months, method: p.method })).amount,

  requestMoveOut: async (p: { contractId: string; date: string }) => {
    await api.post(`/contracts/${p.contractId}/move-out`, { date: day(p.date) });
  },

  // ---- hỗ trợ
  createTicket: async (p: { facilityId: string; category: TicketCategory; priority: TicketPriority; subject: string; description: string; contractId?: string | null; unitId?: string | null }) =>
    api.post<SupportTicket>('/tickets', { ...p, kind: 'CUSTOMER_ISSUE', description: p.description || undefined }),

  addTicketMessage: async (p: { ticketId: string; body: string }) => {
    await api.post(`/tickets/${p.ticketId}/messages`, { body: p.body, internal: false });
  },

  setTicketStatus: async (p: { ticketId: string; to: TicketStatus }) => {
    await api.post(`/tickets/${p.ticketId}/status`, { to: p.to });
  },

  // ---- bồi thường
  createClaim: async (p: { contractId: string; type: ClaimType; incidentAt: string; description: string; items: ClaimItem[] }) =>
    api.post<DamageClaim>('/claims', p),

  withdrawClaim: async (p: { claimId: string }) => {
    await api.post(`/claims/${p.claimId}/withdraw`, {});
  },
};

export type Actions = typeof actions;
export type ActionName = keyof Actions;
export type Payload<K extends ActionName> = Parameters<Actions[K]>[0];
export type Value<K extends ActionName> = Awaited<ReturnType<Actions[K]>>;

export type { RentalContract, Reservation, StorageUnit };
