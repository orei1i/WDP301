import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { errorHandler, NotFound } from './core/errors';
import { contextMiddleware } from './middlewares/context';
import { docsRouter } from './modules/docs.routes';
import { buildOpenApi } from './modules/openapi';
import { API_MOUNTS } from './modules/registry';

/** Swagger UI nạp asset cùng origin nhưng có inline script/style → nới CSP đúng cho nhánh /api/docs. */
const swaggerCsp: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  next();
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: false, exposedHeaders: ['x-request-id'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(contextMiddleware);

  app.get('/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  const api = express.Router();

  // --- tài liệu: trang tóm tắt tiếng Việt, spec OpenAPI, và Swagger UI có "Try it out"
  api.use(docsRouter);                       // GET /api · GET /api/docs.json
  api.get('/openapi.json', (req, res) => {   // sinh lại mỗi request → luôn khớp code đang chạy
    res.json(buildOpenApi(`${req.protocol}://${req.get('host') ?? 'localhost'}/api`));
  });
  api.use('/docs', swaggerCsp, swaggerUi.serve, swaggerUi.setup(null, {
    explorer: true,
    customSiteTitle: 'Self-Storage API',
    swaggerOptions: { url: '/api/openapi.json', persistAuthorization: true, docExpansion: 'none', tryItOutEnabled: true },
  }));

  // --- nghiệp vụ (cùng bảng mà openapi.ts đọc để sinh spec)
  for (const m of API_MOUNTS) api.use(m.prefix, m.router);
  app.use('/api', api);

  app.use((req) => { throw NotFound(`route ${req.method} ${req.path}`); });
  app.use(errorHandler);
  return app;
}
