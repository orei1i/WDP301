import { randomBytes } from 'node:crypto';
import { Schema, type SchemaOptions, type Types } from 'mongoose';

export const { ObjectId } = Schema.Types;
export type OID = Types.ObjectId;

export const baseOptions: SchemaOptions = {
  timestamps: true,
  strict: 'throw', // unknown fields -> error instead of silent drop
  strictQuery: true,
  id: false,
  toJSON: { versionKey: false, virtuals: true },
  toObject: { virtuals: true },
};
export const subOptions: SchemaOptions = { _id: false, strict: 'throw' };

export const refReq = (model: string) => ({ type: ObjectId, ref: model, required: true as const });
export const refOpt = (model: string) => ({ type: ObjectId, ref: model, default: null });

export const money = (required = true) => ({
  type: Number, required, min: 0, ...(required ? {} : { default: 0 }),
  // Mongoose runs custom validators on null (only undefined is skipped) — nullable overrides must pass
  validate: { validator: (v: number | null) => v == null || Number.isInteger(v), message: '{PATH} must be an integer amount (minor units)' },
});

export const enumOf = <T extends string>(vals: readonly T[], def?: T) => ({
  type: String, enum: vals as T[], required: true as const, ...(def ? { default: def } : {}),
});

export const maxLen = (n: number) => ({ validator: (a: unknown[]) => a.length <= n, message: `{PATH} exceeds ${n} items` });

export const statusHistorySchema = (states: readonly string[]) =>
  new Schema({
    from: { type: String, enum: states as string[], default: null },
    to: { type: String, enum: states as string[], required: true },
    at: { type: Date, required: true, default: Date.now },
    by: refOpt('User'),
    reason: String,
  }, subOptions);

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars, no 0/O/1/I
export function humanCode(prefix: string, len = 6): string {
  const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}-${ymd}-${Array.from(randomBytes(len), (b) => ALPHABET[b % 32]).join('')}`;
}
