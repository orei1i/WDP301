import { Schema, model } from 'mongoose';
import { enumValues, UnitCategory, type UnitType } from '@ssm/shared';
import { baseOptions, enumOf, money, refReq, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, softDeletePlugin } from '../plugins';

export type UnitTypeDoc = UnitType<OID, Date>;
const dim = { type: Number, required: true, min: 0.3, max: 30 };
const mult = (d: number) => ({ type: Number, required: true, default: d, min: 0.1, max: 5 });

const schema = new Schema<UnitTypeDoc>({
  facilityId: { ...refReq('Facility'), immutable: true },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: enumOf(enumValues(UnitCategory)),
  description: { type: String, maxlength: 2000 },
  dimensions: { type: new Schema({ widthM: dim, depthM: dim, heightM: dim }, subOptions), required: true },
  areaM2: { type: Number, required: true, min: 0 },
  features: {
    type: new Schema({
      climateControlled: { type: Boolean, default: false }, driveUp: { type: Boolean, default: false },
      indoor: { type: Boolean, default: true }, powerOutlet: { type: Boolean, default: false },
    }, subOptions),
    default: () => ({}),
  },
  pricing: {
    type: new Schema({
      baseMonthlyRate: money(),
      tierMultipliers: { type: new Schema({ ECONOMY: mult(0.9), STANDARD: mult(1), PREMIUM: mult(1.15) }, subOptions), default: () => ({}) },
    }, subOptions),
    required: true,
  },
  depositOverride: { ...money(false), default: null },
  minRentalMonths: { type: Number, default: 1, min: 1, max: 60 },
  imageUrls: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  inventoryVersion: { type: Number, default: 0, min: 0 },
}, { ...baseOptions, collection: 'unitTypes' });

schema.plugin(actorStampPlugin);
schema.plugin(softDeletePlugin);

schema.pre('validate', function () {
  const { widthM, depthM } = this.dimensions ?? {};
  if (widthM && depthM) this.areaM2 = Math.round(widthM * depthM * 100) / 100;
});

schema.index({ facilityId: 1, code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
schema.index({ facilityId: 1, isActive: 1, category: 1, 'pricing.baseMonthlyRate': 1 });
schema.index({ isActive: 1, category: 1, 'pricing.baseMonthlyRate': 1 });

export const UnitTypeModel = model<UnitTypeDoc>('UnitType', schema);
