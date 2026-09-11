import { Schema, model } from 'mongoose';
import { enumValues, InspectionOutcome, InspectionStatus, InspectionType, ItemCondition, type InspectionLog } from '@ssm/shared';
import { baseOptions, enumOf, maxLen, money, refOpt, refReq, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, appendOnlyPlugin } from '../plugins';

export type InspectionDoc = InspectionLog<OID, Date>;

const schema = new Schema<InspectionDoc>({
  facilityId: { ...refReq('Facility'), immutable: true },
  unitId: { ...refReq('StorageUnit'), immutable: true },
  contractId: { ...refOpt('RentalContract'), immutable: true },
  type: { ...enumOf(enumValues(InspectionType)), immutable: true },
  status: enumOf(enumValues(InspectionStatus), 'DRAFT'),
  inspectorId: refReq('User'),
  performedAt: { type: Date, required: true, default: Date.now },
  checklist: {
    type: [new Schema({ item: { type: String, required: true }, condition: enumOf(enumValues(ItemCondition)), note: String }, subOptions)],
    default: [], validate: maxLen(100),
  },
  damages: {
    type: [new Schema({
      description: { type: String, required: true, maxlength: 500 },
      severity: { type: String, enum: ['MINOR', 'MODERATE', 'SEVERE'], required: true },
      cost: money(), photoUrls: { type: [String], default: [] },
    }, subOptions)],
    default: [], validate: maxLen(50),
  },
  photoUrls: { type: [String], default: [], validate: maxLen(50) },
  outcome: { type: String, enum: enumValues(InspectionOutcome), default: null },
  totalDamageFee: money(false),
  depositSettlement: {
    type: new Schema({
      depositHeld: money(), deductions: money(), refundAmount: money(),
      refundPaymentId: refOpt('PaymentTransaction'), damagePaymentId: refOpt('PaymentTransaction'),
      approvedBy: refOpt('User'), approvedAt: { type: Date, default: null },
    }, subOptions),
    default: null,
  },
  notes: { type: String, maxlength: 2000 },
}, { ...baseOptions, collection: 'inspectionLogs', optimisticConcurrency: true });

schema.plugin(actorStampPlugin);
schema.plugin(appendOnlyPlugin, { allowUpdates: true });

schema.pre('validate', function () {
  this.totalDamageFee = this.damages.reduce((sum, d) => sum + d.cost, 0);
  if (this.type === 'MOVE_OUT' && !this.contractId) this.invalidate('contractId', 'MOVE_OUT requires contract');
  if (this.status !== 'DRAFT' && !this.outcome) this.invalidate('outcome', 'required once submitted');
  const ds = this.depositSettlement;
  if (ds && ds.deductions + ds.refundAmount !== ds.depositHeld) this.invalidate('depositSettlement', 'deductions + refund must equal deposit held');
  if (this.type === 'MOVE_OUT' && this.status === 'APPROVED' && !ds?.approvedBy) this.invalidate('depositSettlement', 'approved move-out needs settlement');
});

schema.index({ facilityId: 1, performedAt: -1 });
schema.index({ facilityId: 1, status: 1, performedAt: -1 });
schema.index({ unitId: 1, performedAt: -1 });
schema.index({ contractId: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'MOVE_OUT', contractId: { $type: 'objectId' } } });

export const InspectionModel = model<InspectionDoc>('InspectionLog', schema);
