import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { enumValues, PAYMENT_MACHINE, PaymentMethod, PaymentStatus, PaymentType, type PaymentTransaction } from '@ssm/shared';
import { baseOptions, enumOf, maxLen, money, refOpt, refReq, statusHistorySchema, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, appendOnlyPlugin } from '../plugins';
import { applyTransition, type TransitionCtx } from '../../domain/apply-transition';

export type PaymentDoc = PaymentTransaction<OID, Date>;
interface Methods { transitionTo(to: PaymentStatus, ctx: TransitionCtx): void }
export type PaymentModelType = Model<PaymentDoc, {}, Methods>;
export type PaymentHydrated = HydratedDocument<PaymentDoc, Methods>;

const schema = new Schema<PaymentDoc, PaymentModelType, Methods>({
  facilityId: { ...refReq('Facility'), immutable: true },
  customerId: { ...refReq('User'), immutable: true },
  contractId: { ...refOpt('RentalContract'), immutable: true },
  reservationId: { ...refOpt('Reservation'), immutable: true },
  type: { ...enumOf(enumValues(PaymentType)), immutable: true },
  direction: { type: String, enum: ['CHARGE', 'REFUND'], required: true, immutable: true },
  amount: { ...money(), immutable: true },
  currency: { type: String, enum: ['VND', 'USD'], required: true, immutable: true },
  status: enumOf(enumValues(PaymentStatus), 'PENDING'),
  method: enumOf(enumValues(PaymentMethod)),
  period: { type: new Schema({ start: { type: Date, required: true }, end: { type: Date, required: true } }, subOptions), default: null, immutable: true },
  provider: { type: new Schema({ name: { type: String, required: true }, txnRef: { type: String, default: null }, rawStatus: String }, subOptions), default: null },
  idempotencyKey: { type: String, required: true, immutable: true, maxlength: 100 },
  refundOf: { ...refOpt('PaymentTransaction'), immutable: true },
  refundedAmount: money(false),
  waiver: { type: new Schema({ approvedBy: refReq('User'), reason: { type: String, required: true, maxlength: 500 } }, subOptions), default: null, immutable: true },
  recordedBy: refOpt('User'),
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: null },
  statusHistory: { type: [statusHistorySchema(enumValues(PaymentStatus))], default: [], validate: maxLen(20) },
}, { ...baseOptions, collection: 'paymentTransactions', optimisticConcurrency: true });

schema.plugin(actorStampPlugin);
schema.plugin(appendOnlyPlugin, { allowUpdates: true });

schema.method('transitionTo', function (to: PaymentStatus, ctx: TransitionCtx) {
  applyTransition('PaymentTransaction', this, PAYMENT_MACHINE, to, ctx);
  if (to === 'SUCCEEDED' && !this.paidAt) this.paidAt = new Date();
});

schema.pre('validate', function () {
  const isRefund = this.type === 'REFUND';
  if (isRefund !== (this.direction === 'REFUND')) this.invalidate('direction', 'REFUND type <-> REFUND direction');
  if (isRefund && !this.refundOf) this.invalidate('refundOf', 'refund must reference the original payment');
  if (this.type === 'WAIVER' && !this.waiver) this.invalidate('waiver', 'approval required for waivers');
  if ((this.type === 'RENT' || this.type === 'RENEWAL') && !this.period) this.invalidate('period', 'rent requires a billing period');
  if (this.method === 'CASH' && !this.recordedBy) this.invalidate('recordedBy', 'cash must record the staff member');
  if (this.status === 'SUCCEEDED' && !this.paidAt) this.invalidate('paidAt', 'required when SUCCEEDED');
  if (this.refundedAmount > this.amount) this.invalidate('refundedAmount', 'exceeds amount');
  if (!this.contractId && !this.reservationId) this.invalidate('contractId', 'payment must link a contract or reservation');
});

schema.index({ idempotencyKey: 1 }, { unique: true });
schema.index({ 'provider.name': 1, 'provider.txnRef': 1 }, { unique: true, partialFilterExpression: { 'provider.txnRef': { $type: 'string' } } });
schema.index({ contractId: 1, 'period.start': 1 }, { unique: true, partialFilterExpression: { type: 'RENT', status: { $in: ['PENDING', 'SUCCEEDED'] } } });
schema.index({ facilityId: 1, status: 1, paidAt: -1 });
schema.index({ status: 1, paidAt: -1, facilityId: 1 });
schema.index({ contractId: 1, createdAt: -1 });
schema.index({ reservationId: 1 }, { partialFilterExpression: { reservationId: { $type: 'objectId' } } });
schema.index({ customerId: 1, createdAt: -1 });

export const PaymentModel = model<PaymentDoc, PaymentModelType>('PaymentTransaction', schema);
