import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { AccessMethod, CONTRACT_MACHINE, ContractStatus, DepositStatus, enumValues, OPEN_CONTRACT_STATUSES, type RentalContract } from '@ssm/shared';
import { baseOptions, enumOf, humanCode, maxLen, money, refOpt, refReq, statusHistorySchema, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, appendOnlyPlugin } from '../plugins';
import { applyTransition, type TransitionCtx } from '../../domain/apply-transition';

export type RentalContractDoc = RentalContract<OID, Date>;
interface Methods { transitionTo(to: ContractStatus, ctx: TransitionCtx): void }
export type RentalContractModelType = Model<RentalContractDoc, {}, Methods>;
export type RentalContractHydrated = HydratedDocument<RentalContractDoc, Methods>;

const schema = new Schema<RentalContractDoc, RentalContractModelType, Methods>({
  contractNumber: { type: String, required: true, immutable: true },
  facilityId: { ...refReq('Facility'), immutable: true },
  customerId: { ...refReq('User'), immutable: true },
  // CỐ Ý không immutable: đổi ô kho cùng loại (contract.service → swapUnit) ghi lại trường này.
  // Mọi lần đổi đều để dấu vết ở unitSwaps[] bên dưới — không có đường nào đổi ô mà không ghi lịch sử.
  unitId: refReq('StorageUnit'),
  unitTypeId: { ...refReq('UnitType'), immutable: true }, // chỉ đổi ô trong cùng loại → giá hợp đồng không đổi
  reservationId: { ...refReq('Reservation'), immutable: true },
  status: enumOf(enumValues(ContractStatus), 'ACTIVE'),
  startDate: { type: Date, required: true, immutable: true },
  endDate: { type: Date, required: true },
  autoRenew: { type: Boolean, default: false },
  billing: {
    type: new Schema({
      currency: { type: String, enum: ['VND', 'USD'], required: true },
      monthlyRate: money(),
      billingDay: { type: Number, required: true, min: 1, max: 28 },
      nextBillingDate: { type: Date, required: true },
      paidThrough: { type: Date, required: true },
    }, subOptions),
    required: true,
  },
  deposit: {
    type: new Schema({
      amount: money(), status: enumOf(enumValues(DepositStatus), 'HELD'),
      paymentId: refOpt('PaymentTransaction'), refundedAmount: money(false),
    }, subOptions),
    required: true,
  },
  balance: { type: new Schema({ outstanding: money(false), lastPaymentAt: { type: Date, default: null } }, subOptions), default: () => ({}) },
  delinquency: {
    type: new Schema({
      since: { type: Date, required: true }, daysOverdue: { type: Number, required: true, min: 0 },
      lateFeesAccrued: money(false), lockedOutAt: { type: Date, default: null },
    }, subOptions),
    default: null,
  },
  access: {
    type: new Schema({
      method: enumOf(enumValues(AccessMethod)),
      keyTag: { type: String, default: null },
      credentialHash: { type: String, default: null, select: false },
      issuedAt: { type: Date, default: null }, issuedBy: refOpt('User'),
      suspendedAt: { type: Date, default: null }, revokedAt: { type: Date, default: null },
    }, subOptions),
    required: true,
  },
  terms: {
    type: new Schema({
      policyId: refReq('BusinessPolicy'), policyVersion: { type: Number, required: true },
      gracePeriodDays: { type: Number, required: true, min: 0 }, lockoutAfterDays: { type: Number, required: true, min: 0 },
      signedAt: { type: Date, required: true }, signatureRef: String,
    }, subOptions),
    required: true, immutable: true,
  },
  renewals: {
    type: [new Schema({
      previousEndDate: { type: Date, required: true }, newEndDate: { type: Date, required: true },
      months: { type: Number, required: true, min: 1 }, paymentId: refOpt('PaymentTransaction'), at: { type: Date, default: Date.now },
    }, subOptions)],
    default: [], validate: maxLen(120),
  },
  unitSwaps: {
    type: [new Schema({
      fromUnitId: refReq('StorageUnit'), toUnitId: refReq('StorageUnit'),
      reason: { type: String, required: true, maxlength: 500 },
      fee: money(false), paymentId: refOpt('PaymentTransaction'),
      at: { type: Date, default: Date.now }, by: refOpt('User'),
    }, subOptions)],
    default: [], validate: maxLen(20),
  },
  moveOut: {
    type: new Schema({
      requestedAt: { type: Date, required: true }, scheduledFor: { type: Date, default: null },
      completedAt: { type: Date, default: null }, inspectionId: refOpt('InspectionLog'),
    }, subOptions),
    default: null,
  },
  closedAt: { type: Date, default: null },
  statusHistory: { type: [statusHistorySchema(enumValues(ContractStatus))], default: [], validate: maxLen(100) },
}, { ...baseOptions, collection: 'rentalContracts', optimisticConcurrency: true });

schema.plugin(actorStampPlugin);
schema.plugin(appendOnlyPlugin, { allowUpdates: true });

schema.method('transitionTo', function (to: ContractStatus, ctx: TransitionCtx) {
  applyTransition('RentalContract', this, CONTRACT_MACHINE, to, ctx);
});

schema.pre('validate', function () {
  if (this.isNew && !this.contractNumber) this.contractNumber = humanCode('CTR');
  if (this.endDate <= this.startDate) this.invalidate('endDate', 'must be after startDate');
  const s = this.status;
  if ((s === 'DELINQUENT' || s === 'LOCKED_OUT') && !this.delinquency) this.invalidate('delinquency', `required when ${s}`);
  if (s === 'LOCKED_OUT' && !this.delinquency?.lockedOutAt) this.invalidate('delinquency.lockedOutAt', 'required when LOCKED_OUT');
  if (s === 'MOVE_OUT_PENDING' && !this.moveOut) this.invalidate('moveOut', 'required when MOVE_OUT_PENDING');
  if (s === 'CLOSED' && !this.closedAt) this.invalidate('closedAt', 'required when CLOSED');
  if (this.deposit.refundedAmount > this.deposit.amount) this.invalidate('deposit.refundedAmount', 'exceeds deposit');
});

schema.index({ contractNumber: 1 }, { unique: true });
schema.index({ reservationId: 1 }, { unique: true });
schema.index({ unitId: 1 }, { unique: true, partialFilterExpression: { status: { $in: [...OPEN_CONTRACT_STATUSES] } } });
schema.index({ facilityId: 1, status: 1, 'billing.nextBillingDate': 1 });
schema.index({ facilityId: 1, status: 1, endDate: 1 });
schema.index({ customerId: 1, status: 1 });
schema.index({ status: 1, 'billing.paidThrough': 1 });

export const RentalContractModel = model<RentalContractDoc, RentalContractModelType>('RentalContract', schema);
