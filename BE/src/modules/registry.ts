import type { Router } from 'express';
import { authRouter } from './auth.routes';
import { bootstrapRouter } from './bootstrap.routes';
import { facilitiesRouter, unitsRouter } from './facilities.routes';
import { reservationsRouter } from './reservations.routes';
import { contractsRouter, inspectionsRouter } from './contracts.routes';
import { paymentsRouter } from './payments.routes';
import { ticketsRouter } from './tickets.routes';
import { auditRouter, policiesRouter, reportsRouter, usersRouter } from './admin.routes';

/**
 * Bảng gắn router duy nhất. app.ts mount từ đây, openapi.ts đi qua đây để sinh spec
 * → thêm router mới ở đây là Swagger có ngay, không phải khai báo lần hai.
 */
export interface Mount { prefix: string; router: Router }

export const API_MOUNTS: Mount[] = [
  { prefix: '/auth', router: authRouter },
  { prefix: '/bootstrap', router: bootstrapRouter },
  { prefix: '/facilities', router: facilitiesRouter },
  { prefix: '/units', router: unitsRouter },
  { prefix: '/reservations', router: reservationsRouter },
  { prefix: '/contracts', router: contractsRouter },
  { prefix: '/inspections', router: inspectionsRouter },
  { prefix: '/payments', router: paymentsRouter },
  { prefix: '/tickets', router: ticketsRouter },
  { prefix: '/policies', router: policiesRouter },
  { prefix: '/users', router: usersRouter },
  { prefix: '/audit', router: auditRouter },
  { prefix: '/reports', router: reportsRouter },
];
