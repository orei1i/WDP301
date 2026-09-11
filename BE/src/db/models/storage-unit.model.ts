import { Schema, model, type Model } from 'mongoose';
import { enumValues, PriceTier, UNIT_MACHINE, UnitStatus, type StorageUnit } from '@ssm/shared';
import { baseOptions, enumOf, money, refOpt, refReq, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, softDeletePlugin } from '../plugins';
import { applyTransition, type TransitionCtx } from '../../domain/apply-transition';

export type StorageUnitDoc = StorageUnit<OID, Date>;
interface Methods { transitionTo(to: UnitStatus, ctx: TransitionCtx): void; softDelete(by?: string): Promise<unknown> }
export type StorageUnitModelType = Model<StorageUnitDoc, {}, Methods>;

const schema = new Schema<StorageUnitDoc, StorageUnitModelType, Methods>({
  facilityId: { ...refReq('Facility'), immutable: true },
  unitTypeId: refReq('UnitType'),
  unitNumber: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  location: {
    type: new Schema({ building: String, floor: { type: Number, required: true, min: -5, max: 100 }, zone: String, aisle: String }, subOptions),
    required: true,
  },
  status: enumOf(enumValues(UnitStatus), 'AVAILABLE'),
  statusChangedAt: { type: Date, default: Date.now },
  statusReason: { type: String, default: null, maxlength: 500 },
  priceTier: enumOf(enumValues(PriceTier), 'STANDARD'),
  monthlyRateOverride: { ...money(false), default: null },
  currentReservationId: refOpt('Reservation'),
  currentContractId: refOpt('RentalContract'),
  overlockActive: { type: Boolean, default: false },
  lock: {
    type: new Schema({ type: { type: String, enum: ['PADLOCK', 'SMART_LOCK'], default: 'PADLOCK' }, deviceId: { type: String, default: null } }, subOptions),
    default: () => ({}),
  },
  notes: { type: String, maxlength: 1000 },
}, { ...baseOptions, collection: 'storageUnits', optimisticConcurrency: true });

schema.plugin(actorStampPlugin);
schema.plugin(softDeletePlugin);

schema.method('transitionTo', function (to: UnitStatus, ctx: TransitionCtx) {
  applyTransition('StorageUnit', this, UNIT_MACHINE, to, ctx);
  this.statusReason = ctx.reason ?? null;
});

// Status <-> pointer invariants (checked on save(); CAS updateOne paths set the same fields explicitly)
schema.pre('validate', function () {
  if (this.isModified('status')) this.statusChangedAt = new Date();
  const s = this.status;
  if (s === 'RESERVED' && !this.currentReservationId) this.invalidate('currentReservationId', 'required when RESERVED');
  if ((s === 'OCCUPIED' || s === 'PENDING_INSPECTION') && !this.currentContractId) this.invalidate('currentContractId', `required when ${s}`);
  if (s === 'AVAILABLE' && (this.currentReservationId || this.currentContractId)) this.invalidate('status', 'AVAILABLE unit must not hold reservation/contract');
  if (this.overlockActive && s !== 'OCCUPIED') this.invalidate('overlockActive', 'overlock only valid on OCCUPIED');
});

schema.index({ facilityId: 1, unitNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
schema.index({ facilityId: 1, unitTypeId: 1, status: 1, 'location.floor': 1, unitNumber: 1 });
schema.index({ facilityId: 1, status: 1 });
schema.index({ currentContractId: 1 }, { partialFilterExpression: { currentContractId: { $type: 'objectId' } } });

export const StorageUnitModel = model<StorageUnitDoc, StorageUnitModelType>('StorageUnit', schema);
