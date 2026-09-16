import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { enumValues, FACILITY_SCOPED_ROLES, Role, UserStatus, type User } from '@ssm/shared';
import { baseOptions, enumOf, subOptions, type OID } from '../schema-kit';
import { actorStampPlugin, softDeletePlugin } from '../plugins';

export type UserDoc = User<OID, Date>;
interface Methods { softDelete(by?: string): Promise<unknown> }
export type UserModelType = Model<UserDoc, {}, Methods>;
export type UserHydrated = HydratedDocument<UserDoc, Methods>;

const schema = new Schema<UserDoc, UserModelType, Methods>({
  firebaseUid: { type: String, default: null, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  phone: { type: String, default: null, trim: true, match: /^\+?\d{9,15}$/ },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  role: enumOf(enumValues(Role), 'CUSTOMER'),
  facilityIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Facility' }], default: [] },
  status: enumOf(enumValues(UserStatus), 'PENDING_VERIFICATION'),
  tokenVersion: { type: Number, default: 0, min: 0 },
  lastLoginAt: { type: Date, default: null },
  // Bằng chứng khách chấp thuận Điều khoản + Chính sách bảo mật lúc tạo tài khoản.
  // KHÔNG đặt required: tài khoản có trước tính năng này vẫn phải save() được khi đổi vai trò/trạng thái.
  // Ràng buộc bắt buộc nằm ở tầng API (auth.routes.ts). immutable vì bằng chứng đã ghi thì không sửa.
  consent: {
    type: new Schema({
      termsVersion: { type: String, required: true, maxlength: 20 },
      privacyVersion: { type: String, required: true, maxlength: 20 },
      acceptedAt: { type: Date, required: true },
      method: { type: String, enum: ['SIGNUP_FORM', 'GOOGLE'], required: true },
    }, subOptions),
    default: null,
    immutable: true,
  },
  customerProfile: {
    type: new Schema({
      idType: { type: String, enum: ['CCCD', 'PASSPORT'] },
      idNumberLast4: { type: String, match: /^\w{4}$/ },
      address: { type: String, maxlength: 300 },
      emergencyContact: { type: new Schema({ name: String, phone: String }, subOptions) },
    }, subOptions),
    default: null,
  },
}, { ...baseOptions, collection: 'users' });

schema.plugin(actorStampPlugin);
schema.plugin(softDeletePlugin);

// RBAC invariant: chỉ STAFF / FACILITY_MANAGER có phạm vi chi nhánh.
// FACILITY_MANAGER quản lý ĐÚNG MỘT chi nhánh — một kho một quản lý, không kiêm nhiệm.
schema.pre('validate', function () {
  const scoped = FACILITY_SCOPED_ROLES.includes(this.role);
  if (scoped && this.facilityIds.length === 0) this.invalidate('facilityIds', `${this.role} requires >= 1 facilityId`);
  if (this.role === 'FACILITY_MANAGER' && this.facilityIds.length !== 1) this.invalidate('facilityIds', 'FACILITY_MANAGER phải quản lý đúng 1 chi nhánh');
  if (!scoped && this.facilityIds.length > 0) this.invalidate('facilityIds', `${this.role} must not be facility-scoped`);
  if (this.role !== 'CUSTOMER' && this.customerProfile) this.invalidate('customerProfile', 'customers only');
  if (!this.isNew && (this.isModified('role') || this.isModified('facilityIds') || this.isModified('status'))) this.tokenVersion += 1;
});

schema.index({ firebaseUid: 1 }, { unique: true, partialFilterExpression: { firebaseUid: { $type: 'string' } } });
schema.index({ email: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, phone: { $type: 'string' } } });
schema.index({ role: 1, facilityIds: 1, status: 1 });

export const UserModel = model<UserDoc, UserModelType>('User', schema);
