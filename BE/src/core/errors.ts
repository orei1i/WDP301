import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { InvalidTransitionError } from '@ssm/shared';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

export const BadRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const Unauthorized = (msg = 'Chưa đăng nhập hoặc phiên đã hết hạn') => new AppError(401, 'UNAUTHENTICATED', msg);
export const Forbidden = (msg = 'Không có quyền thực hiện thao tác này', code = 'FORBIDDEN') => new AppError(403, code, msg);
export const NotFound = (what: string) => new AppError(404, 'NOT_FOUND', `Không tìm thấy ${what}`);
export const Conflict = (msg: string, code = 'CONFLICT') => new AppError(409, code, msg);
export const Unprocessable = (msg: string, code = 'BUSINESS_RULE') => new AppError(422, code, msg);

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: { code: string; message: string; details?: unknown } = { code: 'INTERNAL', message: 'Lỗi hệ thống' };

  if (err instanceof AppError) {
    status = err.status; body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof InvalidTransitionError) {
    status = 409; body = { code: err.code, message: err.message, details: { entity: err.entity, from: err.from, to: err.to } };
  } else if (err instanceof ZodError) {
    status = 400; body = { code: 'VALIDATION', message: 'Dữ liệu không hợp lệ', details: err.flatten() };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422; body = { code: 'VALIDATION', message: 'Dữ liệu không hợp lệ', details: Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])) };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400; body = { code: 'BAD_ID', message: `Giá trị không hợp lệ cho ${err.path}` };
  } else if (err instanceof mongoose.Error.StrictModeError) {
    status = 400; body = { code: 'UNKNOWN_FIELD', message: err.message };
  } else if (typeof err === 'object' && err && 'code' in err && (err as { code: unknown }).code === 11000) {
    status = 409; body = { code: 'DUPLICATE', message: 'Dữ liệu bị trùng', details: (err as { keyValue?: unknown }).keyValue };
  }

  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (status >= 500 && !env.isProd) body.details = String(err?.stack ?? err);
  res.status(status).json({ error: body });
};
