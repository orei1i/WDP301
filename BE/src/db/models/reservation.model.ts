import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { CancellationReason, enumValues, PriceTier, RESERVATION_MACHINE, ReservationStatus, type PriceQuote, type Reservation } from '@ssm/shared';
import { baseOptions, enumOf, humanCode, maxLen, money, refOpt, refReq, statusHistorySchema, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, appendOnlyPlugin } from '../plugins';
import { applyTransition, type TransitionCtx } from '../../domain/apply-transition';
import { addMonthsUTC } from '../../domain/dates';

export type ReservationDoc = Reservation<OID, Date>;
interface Methods { transitionTo(to: ReservationStatus, ctx: TransitionCtx): void }
export type ReservationModelType = Model<ReservationDoc, {}, Methods>;
export type ReservationHydrated = HydratedDocument<ReservationDoc, Methods>;

const quoteSchema = new Schema<PriceQuote<OID>>({
  currency: { type: String, enum: ['VND', 'USD'], required: true },
  priceTier: enumOf(enumValues(PriceTier)),
  monthlyRate: money(), depositAmount: money(), discountAmount: money(), surchargeAmount: money(),
  appliedRuleCodes: { type: [String], default: [] },
  firstPeriodRent: money(), totalDueAtBooking: money(),
  policyId: refReq('BusinessPolicy'),
  policyVersion: { type: Number, required: true, min: 1 },
}, subOptions);

const schema = new Schema<ReservationDoc, ReservationModelType, Methods>({
  code: { type: String, required: true, immutable: true },
  facilityId: { ...refReq('Facility'), immutable: true },
  customerId: { ...refReq('User'), immutable: true },
  unitTypeId: { ...refReq('UnitType'), immutable: true },
  unitId: refOpt('StorageUnit'),
  status: enumOf(enumValues(ReservationStatus), 'PENDING'),
  startDate: { type: Date, required: true },
  durationMonths: { type: Number, required: true, min: 1, max: 60, validate: Number.isInteger },
  endDate: { type: Date, required: true },
  quote: { type: quoteSchema, required: true, immutable: true },
  holdExpiresAt: { type: Date, default: null },
  depositPaymentId: refOpt('PaymentTransaction'),
  allocation: { type: new Schema({ allocatedAt: { type: Date, required: true }, allocatedBy: refOpt('User') }, subOptions), default: null },
  checkIn: {
    type: new Schema({
      qrTokenHash: { type: String, default: null }, // sha256 of the one-time QR token
      qrExpiresAt: { type: Date, default: null },
      checkedInAt: { type: Date, default: null },
      checkedInBy: refOpt('User'),
    }, subOptions),
    default: null,
  },
  cancellation: {
    type: new Schema({
      reason: enumOf(enumValues(CancellationReason)),
      note: { type: String, maxlength: 500 },
      cancelledAt: { type: Date, required: true },
      cancelledBy: refOpt('User'),
      refundAmount: money(),
    }, subOptions),
    default: null,
  },
  contractId: refOpt('RentalContract'),
  source: { type: String, enum: ['WEB', 'MOBILE', 'WALK_IN'], required: true },
  idempotencyKey: { type: String, default: null, maxlength: 100 },
  statusHistory: { type: [statusHistorySchema(enumValues(ReservationStatus))], default: [], validate: maxLen(30) },
}, {
  ...baseOptions, collection: 'reservations', optimisticConcurrency: true,
  toJSON: { versionKey: false, virtuals: true, transform: (_doc, ret) => { if (ret.checkIn) delete ret.checkIn.qrTokenHash; return ret; } },
});

schema.plugin(actorStampPlugin);
schema.plugin(appendOnlyPlugin, { allowUpdates: true });

schema.method('transitionTo', function (to: ReservationStatus, ctx: TransitionCtx) {
  applyTransition('Reservation', this, RESERVATION_MACHINE, to, ctx);
});

schema.pre('validate', function () {
  if (this.isNew && !this.code) this.code = humanCode('RSV');
  if (this.isNew && this.statusHistory.length === 0) this.statusHistory.push({ from: null, to: this.status, at: new Date() });
  if (this.startDate && (this.isModified('startDate') || this.isModified('durationMonths'))) {
    this.endDate = addMonthsUTC(this.startDate, this.durationMonths);
  }
  const s = this.status;
  if (['ALLOCATED', 'CHECKED_IN', 'COMPLETED'].includes(s) && !this.unitId) this.invalidate('unitId', `required when ${s}`);
  if (s === 'PENDING' && !this.holdExpiresAt) this.invalidate('holdExpiresAt', 'required while PENDING');
  if (s !== 'PENDING') this.holdExpiresAt = null;
  if (s === 'CANCELLED' && !this.cancellation) this.invalidate('cancellation', 'required when CANCELLED');
  if (['CHECKED_IN', 'COMPLETED'].includes(s) && !this.contractId) this.invalidate('contractId', `required when ${s}`);
});

schema.index({ code: 1 }, { unique: true });
schema.index({ facilityId: 1, unitTypeId: 1, status: 1, startDate: 1, endDate: 1 });
schema.index({ facilityId: 1, status: 1, startDate: 1 });
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ unitId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['ALLOCATED', 'CHECKED_IN'] } } });
schema.index({ holdExpiresAt: 1 }, { partialFilterExpression: { status: 'PENDING' } });
schema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export const ReservationModel = model<ReservationDoc, ReservationModelType>('Reservation', schema);
