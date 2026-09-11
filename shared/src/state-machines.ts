import type { ContractStatus, PaymentStatus, ReservationStatus, Role, TicketStatus, UnitStatus } from './enums';

/** Who may fire a transition. SYSTEM = webhooks, cron jobs, internal side effects. */
export type Actor = Role | 'SYSTEM';

/** from -> (to -> allowed actors). Missing key = illegal transition. */
export type StateMachine<S extends string> = { readonly [F in S]: Partial<Record<S, readonly Actor[]>> };

const FM = 'FACILITY_MANAGER', ST = 'STAFF', CU = 'CUSTOMER', SYS = 'SYSTEM', OPS = 'OPS_MANAGER';

export const RESERVATION_MACHINE = {
  PENDING:    { CONFIRMED: [SYS], CANCELLED: [CU, FM, SYS] },            // deposit webhook | hold expiry
  CONFIRMED:  { ALLOCATED: [FM, SYS], CANCELLED: [CU, FM, SYS] },        // manual or auto-allocation
  ALLOCATED:  { CHECKED_IN: [ST, FM], CONFIRMED: [FM], CANCELLED: [CU, FM, SYS] }, // ->CONFIRMED = unassign/re-allocate
  CHECKED_IN: { COMPLETED: [SYS] },                                      // fired when the contract closes
  COMPLETED:  {},
  CANCELLED:  {},
} as const satisfies StateMachine<ReservationStatus>;

export const UNIT_MACHINE = {
  AVAILABLE:          { RESERVED: [FM, SYS], MAINTENANCE: [ST, FM] },
  RESERVED:           { AVAILABLE: [FM, SYS], OCCUPIED: [ST, FM] },     // release | check-in
  OCCUPIED:           { PENDING_INSPECTION: [ST, FM, SYS] },            // keys returned / lease ended
  PENDING_INSPECTION: { AVAILABLE: [ST, FM], MAINTENANCE: [ST, FM] },   // inspection pass | damage
  MAINTENANCE:        { AVAILABLE: [ST, FM] },
} as const satisfies StateMachine<UnitStatus>;

export const CONTRACT_MACHINE = {
  ACTIVE:           { DELINQUENT: [SYS], MOVE_OUT_PENDING: [CU, ST, FM] },
  DELINQUENT:       { ACTIVE: [SYS], LOCKED_OUT: [FM, SYS], MOVE_OUT_PENDING: [FM] },
  LOCKED_OUT:       { ACTIVE: [SYS, FM], MOVE_OUT_PENDING: [FM] },       // paid in full -> access restored
  MOVE_OUT_PENDING: { CLOSED: [ST, FM], ACTIVE: [FM] },                  // settled | move-out cancelled
  CLOSED:           {},
} as const satisfies StateMachine<ContractStatus>;

export const PAYMENT_MACHINE = {
  PENDING:            { SUCCEEDED: [SYS, ST], FAILED: [SYS], CANCELLED: [SYS, CU] }, // ST = cash recorded at desk
  SUCCEEDED:          { PARTIALLY_REFUNDED: [SYS, FM, OPS], REFUNDED: [SYS, FM, OPS] },
  PARTIALLY_REFUNDED: { REFUNDED: [SYS, FM, OPS] },
  FAILED: {}, CANCELLED: {}, REFUNDED: {},
} as const satisfies StateMachine<PaymentStatus>;

export const TICKET_MACHINE = {
  OPEN:        { ASSIGNED: [FM], CLOSED: [FM, CU] },
  ASSIGNED:    { IN_PROGRESS: [ST, FM], OPEN: [FM] },
  IN_PROGRESS: { RESOLVED: [ST, FM] },
  RESOLVED:    { CLOSED: [CU, FM, SYS], IN_PROGRESS: [CU, FM] },        // reopen
  CLOSED:      {},
} as const satisfies StateMachine<TicketStatus>;

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(readonly entity: string, readonly from: string, readonly to: string, readonly actor?: Actor) {
    super(`${entity}: ${from} -> ${to} not allowed${actor ? ` for ${actor}` : ''}`);
  }
}

export function canTransition<S extends string>(m: StateMachine<S>, from: S, to: S, actor?: Actor): boolean {
  const actors = m[from][to];
  return !!actors && (actor === undefined || actors.includes(actor));
}

export function assertTransition<S extends string>(entity: string, m: StateMachine<S>, from: S, to: S, actor?: Actor): void {
  if (!canTransition(m, from, to, actor)) throw new InvalidTransitionError(entity, from, to, actor);
}

/** Drives UI buttons on web/mobile: which actions can this actor take right now? */
export function nextStates<S extends string>(m: StateMachine<S>, from: S, actor: Actor): S[] {
  return (Object.keys(m[from]) as S[]).filter((to) => canTransition(m, from, to, actor));
}

export const isTerminal = <S extends string>(m: StateMachine<S>, s: S) => Object.keys(m[s]).length === 0;
