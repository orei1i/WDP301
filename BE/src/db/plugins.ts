import { Schema, type Aggregate, type MongooseQueryMiddleware, type Query } from 'mongoose';
import { currentActorId } from '../core/request-context';

/** createdBy / updatedBy from the request's AsyncLocalStorage context. */
export function actorStampPlugin(schema: Schema) {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });
  schema.pre('save', function () {
    const actor = currentActorId();
    if (!actor) return;
    if (this.isNew && !this.get('createdBy')) this.set('createdBy', actor);
    this.set('updatedBy', actor);
  });
  schema.pre<Query<unknown, unknown>>(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
    const actor = currentActorId();
    if (actor) this.set({ updatedBy: actor });
  });
}

const SOFT_DELETE_FILTERED: MongooseQueryMiddleware[] = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndReplace', 'countDocuments', 'distinct', 'updateOne', 'updateMany', 'replaceOne',
];

/** Master data only. Opt out per query with .setOptions({ withDeleted: true }). */
export function softDeletePlugin(schema: Schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });

  schema.pre<Query<unknown, unknown>>(SOFT_DELETE_FILTERED, function () {
    if (this.getOptions().withDeleted || 'isDeleted' in this.getFilter()) return;
    this.where({ isDeleted: false });
  });

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    if ((this.options as Record<string, unknown>).withDeleted) return;
    const p = this.pipeline();
    const first = (p[0] ?? {}) as Record<string, unknown>;
    const mustStayFirst = ['$geoNear', '$search', '$searchMeta', '$vectorSearch'].some((k) => k in first);
    p.splice(mustStayFirst ? 1 : 0, 0, { $match: { isDeleted: false } });
  });

  schema.pre<Query<unknown, unknown>>(['deleteOne', 'deleteMany', 'findOneAndDelete'], async function () {
    if (!this.getOptions().hardDelete) throw new Error(`Hard delete disabled on ${this.model.modelName}; use softDelete()`);
  });

  schema.method('softDelete', function (by?: string) {
    this.set({ isDeleted: true, deletedAt: new Date(), deletedBy: by ?? currentActorId() ?? null });
    return this.save();
  });
}

/** Financial/legal records: never deleted. AuditLog: never updated either. */
export function appendOnlyPlugin(schema: Schema, opts: { allowUpdates: boolean }) {
  const blocked: MongooseQueryMiddleware[] = ['deleteOne', 'deleteMany', 'findOneAndDelete'];
  if (!opts.allowUpdates) blocked.push('updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace');

  schema.pre<Query<unknown, unknown>>(blocked, async function () {
    throw new Error(`${this.model.modelName} is append-only (${this.op} rejected)`);
  });
  schema.pre('deleteOne', { document: true, query: false }, async function () {
    throw new Error('Append-only document cannot be deleted');
  });
  if (!opts.allowUpdates) {
    schema.pre('save', async function () {
      if (!this.isNew) throw new Error('Append-only document cannot be modified');
    });
  }
}
