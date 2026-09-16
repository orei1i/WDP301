import { Router } from 'express';
import { z } from 'zod';
import { authenticate, verifyFirebase } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { syncProfile } from '../services/user.service';

export const authRouter = Router();

/** Call once after every Firebase sign-in (email/password or Google). Creates or links the Mongo profile. */
authRouter.post('/sync', verifyFirebase, validate({ body: z.object({
  fullName: z.string().max(120).optional(),
  phone: z.string().regex(/^\+?\d{9,15}$/).optional(),
  // Chỉ có ý nghĩa ở lần đồng bộ đầu tiên (lúc tạo hồ sơ). Thời điểm do server đóng dấu.
  consent: z.object({
    termsVersion: z.string().min(1).max(20),
    privacyVersion: z.string().min(1).max(20),
    method: z.enum(['SIGNUP_FORM', 'GOOGLE']),
  }).optional(),
}) }), async (req, res) => {
  const { user, created } = await syncProfile(req.firebase!, req.valid.body);
  res.status(created ? 201 : 200).json({ user });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.auth!.user });
});
