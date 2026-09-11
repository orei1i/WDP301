import type { TicketCategory, TicketKind, TicketPriority, TicketStatus } from '@ssm/shared';
import { RentalContractModel, ReservationModel, TicketModel, UserModel, type UserHydrated } from '../db/models';
import { Forbidden, NotFound, Unprocessable } from '../core/errors';
import { assertCanAccess, assertFacility } from '../middlewares/scope';
import { audit } from './audit.service';

export async function createTicket(user: UserHydrated, input: {
  facilityId: string; kind: TicketKind; category: TicketCategory; priority: TicketPriority; subject: string; description?: string;
  unitId?: string | null; contractId?: string | null; assigneeId?: string | null; dueAt?: string | null;
}) {
  if (input.kind === 'OPS_TASK' && user.role !== 'FACILITY_MANAGER') throw Forbidden('Chỉ Quản lý chi nhánh được giao việc nội bộ');
  if (user.role === 'CUSTOMER') {
    const related = await RentalContractModel.exists({ customerId: user._id, facilityId: input.facilityId })
      ?? await ReservationModel.exists({ customerId: user._id, facilityId: input.facilityId });
    if (!related) throw Forbidden('Bạn chỉ gửi yêu cầu tới chi nhánh đang thuê hoặc đã đặt', 'OWNERSHIP');
    if (input.contractId) {
      const c = await RentalContractModel.findById(input.contractId);
      if (!c || String(c.customerId) !== String(user._id)) throw Forbidden('Hợp đồng không thuộc về bạn', 'OWNERSHIP');
    }
  } else {
    await assertFacility(user, input.facilityId, 'ticket.create');
  }
  if (input.assigneeId) await assertAssignee(input.assigneeId, input.facilityId);

  const now = new Date();
  const status: TicketStatus = input.assigneeId ? 'ASSIGNED' : 'OPEN';
  const t = await TicketModel.create({
    kind: input.kind, facilityId: input.facilityId, reporterId: user._id, contractId: input.contractId ?? null, unitId: input.unitId ?? null,
    category: input.category, priority: input.priority, status, subject: input.subject, description: input.description ?? '',
    assigneeId: input.assigneeId ?? null, dueAt: input.dueAt ? new Date(input.dueAt) : null,
    messages: input.description?.trim() ? [{ authorId: user._id, body: input.description.trim(), internal: false, at: now }] : [],
    statusHistory: [{ from: null, to: status, at: now, by: user._id }],
  });
  await audit({ action: 'ticket.create', entityType: 'SupportTicket', entityId: t._id, facilityId: t.facilityId });
  return t;
}

async function assertAssignee(assigneeId: string, facilityId: unknown) {
  const staff = await UserModel.findById(assigneeId);
  if (!staff || !['STAFF', 'FACILITY_MANAGER'].includes(staff.role) || !staff.facilityIds.some((f) => String(f) === String(facilityId)))
    throw Unprocessable('Nhân viên không thuộc chi nhánh này');
}

const load = async (id: string) => {
  const t = await TicketModel.findById(id);
  if (!t) throw NotFound('yêu cầu');
  return t;
};

export async function assignTicket(user: UserHydrated, id: string, assigneeId: string) {
  const t = await load(id);
  await assertFacility(user, t.facilityId, 'ticket.assign');
  await assertAssignee(assigneeId, t.facilityId);
  t.set('assigneeId', assigneeId);
  if (t.status === 'OPEN') t.transitionTo('ASSIGNED', { actor: user.role, by: user._id });
  await t.save();
  await audit({ action: 'ticket.assign', entityType: 'SupportTicket', entityId: t._id, facilityId: t.facilityId, changes: { after: { assigneeId } } });
  return t;
}

export async function setTicketStatus(user: UserHydrated, id: string, to: TicketStatus) {
  const t = await load(id);
  await assertCanAccess(user, t, 'ticket.status');
  t.transitionTo(to, { actor: user.role, by: user._id });
  await t.save();
  await audit({ action: 'ticket.status', entityType: 'SupportTicket', entityId: t._id, facilityId: t.facilityId, changes: { after: { status: to } } });
  return t;
}

export async function addTicketMessage(user: UserHydrated, id: string, body: string, internal: boolean) {
  const t = await load(id);
  await assertCanAccess(user, t, 'ticket.message');
  if (t.status === 'CLOSED') throw Unprocessable('Yêu cầu đã đóng');
  t.messages.push({ authorId: user._id, body, internal: user.role === 'CUSTOMER' ? false : internal, at: new Date() });
  await t.save();
  return t;
}

/** Customers never see internal staff notes. */
export const redactForCustomer = <T extends { messages: { internal: boolean }[] }>(t: T, isCustomer: boolean) =>
  isCustomer ? { ...t, messages: t.messages.filter((m) => !m.internal) } : t;
