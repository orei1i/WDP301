import type { RequestHandler } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import type { RouteSchemas } from './tags';
import { SCHEMAS_TAG, tag } from './tags';

/** Zod schema gắn ở đây vừa để kiểm tra dữ liệu, vừa là nguồn sinh OpenAPI (xem modules/openapi.ts). */
export const validate = (s: RouteSchemas): RequestHandler => tag<RequestHandler>((req, _res, next) => {
  if (s.params) req.valid.params = s.params.parse(req.params);
  if (s.query) req.valid.query = s.query.parse(req.query);
  if (s.body) req.valid.body = s.body.parse(req.body ?? {});
  next();
}, SCHEMAS_TAG, s);

export const zId = z.string().refine((v) => Types.ObjectId.isValid(v), 'ObjectId không hợp lệ').describe('ObjectId (24 ký tự hex)');
export const idParams = z.object({ id: zId });
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Ngày dạng YYYY-MM-DD').describe('YYYY-MM-DD');
export const zMoney = z.number().int().min(0).describe('Số nguyên VND');
export const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });
