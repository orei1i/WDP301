import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env';
import { errorHandler, NotFound } from './core/errors';
import { contextMiddleware } from './middlewares/context';
import { authRouter } from './modules/auth.routes';
import { facilitiesRouter, unitsRouter } from './modules/facilities.routes';
import { reservationsRouter } from './modules/reservations.routes';
import { contractsRouter, inspectionsRouter } from './modules/contracts.routes';
import { paymentsRouter } from './modules/payments.routes';
import { ticketsRouter } from './modules/tickets.routes';
import { auditRouter, policiesRouter, reportsRouter, usersRouter } from './modules/admin.routes';
import { bootstrapRouter } from './modules/bootstrap.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: false, exposedHeaders: ['x-request-id'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(contextMiddleware);

  app.get('/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/bootstrap', bootstrapRouter);
  api.use('/facilities', facilitiesRouter);
  api.use('/units', unitsRouter);
  api.use('/reservations', reservationsRouter);
  api.use('/contracts', contractsRouter);
  api.use('/inspections', inspectionsRouter);
  api.use('/payments', paymentsRouter);
  api.use('/tickets', ticketsRouter);
  api.use('/policies', policiesRouter);
  api.use('/users', usersRouter);
  api.use('/audit', auditRouter);
  api.use('/reports', reportsRouter);
  app.use('/api', api);

  app.use((req) => { throw NotFound(`route ${req.method} ${req.path}`); });
  app.use(errorHandler);
  return app;
}
