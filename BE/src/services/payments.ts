import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ClientSession, Types } from 'mongoose';
import { OUTBOUND_PAYMENT_TYPES, type PaymentMethod, type PaymentStatus, type PaymentType } from '@ssm/shared';
import { PaymentModel, type PaymentHydrated } from '../db/models';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');
export const sixDigitPin = () => String(100000 + (randomBytes(4).readUInt32BE() % 900000));

type Id = Types.ObjectId | string;
export interface NewPayment {
  facilityId: Id; customerId: Id; contractId?: Id | null; reservationId?: Id | null;
  type: PaymentType; amount: number; status: PaymentStatus; method: PaymentMethod;
  period?: { start: Date; end: Date } | null; refundOf?: Id | null; recordedBy?: Id | null;
  waiver?: { approvedBy: Id; reason: string } | null; idempotencyKey?: string;
}

/** Creates one payment row. With MOCK_PAYMENTS the gateway reference is simulated. */
export async function createPayment(p: NewPayment, session: ClientSession): Promise<PaymentHydrated> {
  const now = new Date();
  const [doc] = await PaymentModel.create([{
    ...p,
    direction: OUTBOUND_PAYMENT_TYPES.includes(p.type) ? 'REFUND' : 'CHARGE',
    currency: 'VND',
    idempotencyKey: p.idempotencyKey ?? `srv-${randomUUID()}`,
    provider: p.method === 'CASH' || p.method === 'INTERNAL' ? null : { name: p.method, txnRef: `${p.method}-${randomToken(9)}`, rawStatus: 'MOCK' },
    paidAt: p.status === 'SUCCEEDED' ? now : null,
    statusHistory: [{ from: null, to: p.status, at: now }],
  }], { session });
  return doc;
}
