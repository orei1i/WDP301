import type { Role, UserStatus } from '@ssm/shared';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { firebaseAuth } from '../../shared/config/firebase';
import { UserModel, type UserHydrated } from '../../shared/db/models';
import { Conflict, NotFound, Unprocessable } from '../../shared/core/errors';
import { audit } from '../audit/audit.service';

/**
 * Called by web/mobile right after Firebase sign-in (email/password or Google).
 * 1) profile already linked → return it
 * 2) profile pre-created by admin/seed with the same *verified* email → link uid
 * 3) otherwise → self-signup as CUSTOMER
 */
export async function syncProfile(token: DecodedIdToken, input: {
  fullName?: string; phone?: string;
  consent?: { termsVersion: string; privacyVersion: string; method: 'SIGNUP_FORM' | 'GOOGLE' };
}) {
  const linked = await UserModel.findOne({ firebaseUid: token.uid });
  if (linked) {
    linked.lastLoginAt = new Date();
    // email/password signups start PENDING_VERIFICATION; activate once Firebase reports the email verified
    if (linked.status === 'PENDING_VERIFICATION' && token.email_verified) linked.status = 'ACTIVE';
    await linked.save();
    return { user: linked, created: false };
  }
  const email = token.email?.toLowerCase();
  if (!email) throw Unprocessable('Tài khoản Firebase không có email');

  const existing = await UserModel.findOne({ email });
  if (existing) {
    if (existing.firebaseUid && existing.firebaseUid !== token.uid) throw Conflict('Email đã gắn với một tài khoản đăng nhập khác');
    if (!token.email_verified) throw Unprocessable('Vui lòng xác minh email trước khi liên kết tài khoản', 'EMAIL_NOT_VERIFIED');
    existing.firebaseUid = token.uid;
    existing.lastLoginAt = new Date();
    if (existing.status === 'PENDING_VERIFICATION') existing.status = 'ACTIVE';
    await existing.save();
    await audit({ action: 'auth.link', entityType: 'User', entityId: existing._id, reason: token.firebase.sign_in_provider });
    return { user: existing, created: false };
  }

  const user = await UserModel.create({
    firebaseUid: token.uid, email, fullName: input.fullName?.trim() || (token.name as string | undefined) || email.split('@')[0],
    phone: input.phone ?? null, role: 'CUSTOMER', facilityIds: [],
    consent: input.consent ? { ...input.consent, acceptedAt: new Date() } : null,
    // Google accounts arrive verified; email/password signups must verify before booking
    status: token.email_verified ? 'ACTIVE' : 'PENDING_VERIFICATION', lastLoginAt: new Date(),
  });
  await audit({ action: 'auth.signup', entityType: 'User', entityId: user._id, reason: token.firebase.sign_in_provider });
  return { user, created: true };
}

export async function createStaffUser(input: { fullName: string; email: string; role: Role; facilityIds: string[]; status: UserStatus }) {
  const email = input.email.toLowerCase();
  if (await UserModel.exists({ email })) throw Conflict('Email đã tồn tại');
  const fb = await firebaseAuth.getUserByEmail(email).catch(() => null)
    ?? await firebaseAuth.createUser({ email, displayName: input.fullName, emailVerified: false, disabled: input.status === 'SUSPENDED' });
  const user = await UserModel.create({ firebaseUid: fb.uid, email, fullName: input.fullName, role: input.role, facilityIds: input.facilityIds, status: input.status });
  const resetLink = await firebaseAuth.generatePasswordResetLink(email).catch(() => null);
  await audit({ action: 'user.create', entityType: 'User', entityId: user._id, changes: { after: { role: input.role, facilityIds: input.facilityIds } } });
  return { user, resetLink }; // send resetLink by email in production; returned here for the admin UI
}

export async function updateUser(admin: UserHydrated, id: string, patch: { fullName?: string; role?: Role; facilityIds?: string[]; status?: UserStatus }) {
  const u = await UserModel.findById(id);
  if (!u) throw NotFound('người dùng');
  if (String(u._id) === String(admin._id) && patch.role && patch.role !== 'ADMIN') throw Unprocessable('Không thể tự hạ quyền quản trị của chính mình');
  const before = { role: u.role, facilityIds: u.facilityIds.map(String), status: u.status };
  if (patch.fullName) u.fullName = patch.fullName;
  if (patch.role) u.role = patch.role;
  if (patch.facilityIds) u.set('facilityIds', patch.role === 'STAFF' || patch.role === 'FACILITY_MANAGER' || (!patch.role && (u.role === 'STAFF' || u.role === 'FACILITY_MANAGER')) ? patch.facilityIds : []);
  else if (patch.role && patch.role !== 'STAFF' && patch.role !== 'FACILITY_MANAGER') u.set('facilityIds', []);
  if (patch.status) u.status = patch.status;
  const privilegeChanged = u.isModified('role') || u.isModified('facilityIds') || u.isModified('status');
  await u.save();

  if (u.firebaseUid && privilegeChanged) {
    // Kill every existing session: verifyIdToken(checkRevoked) rejects older tokens from now on.
    await firebaseAuth.revokeRefreshTokens(u.firebaseUid);
    if (patch.status) await firebaseAuth.updateUser(u.firebaseUid, { disabled: patch.status === 'SUSPENDED' });
  }
  await audit({ action: 'user.update', entityType: 'User', entityId: u._id, changes: { before, after: { role: u.role, facilityIds: u.facilityIds.map(String), status: u.status } } });
  return u;
}
