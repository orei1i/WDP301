import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { Types } from 'mongoose';

export const validate = (s: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }): RequestHandler => (req, _res, next) => {
  if (s.params) req.valid.params = s.params.parse(req.params);
  if (s.query) req.valid.query = s.query.parse(req.query);
  if (s.body) req.valid.body = s.body.parse(req.body ?? {});
  next();
};

export const zId = z.string().refine((v) => Types.ObjectId.isValid(v), 'ObjectId không hợp lệ');
export const idParams = z.object({ id: zId });
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Ngày dạng YYYY-MM-DD');
export const zMoney = z.number().int().min(0);
export const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });
