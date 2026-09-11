import { existsSync } from 'node:fs';
import { z } from 'zod';

// Node >= 20.12 can load .env natively; no dotenv dependency.
if (existsSync('.env')) process.loadEnvFile('.env');

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  MONGODB_URI: z.string().startsWith('mongodb', 'MONGODB_URI must be a mongodb:// or mongodb+srv:// URI'),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).transform((k) => k.replace(/\\n/g, '\n')),
  AUTH_DEV_BYPASS: bool,
  SEED_PASSWORD: z.string().min(8).default('Demo@12345'),
  MOCK_PAYMENTS: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  AUTH_DEV_BYPASS: parsed.data.AUTH_DEV_BYPASS && parsed.data.NODE_ENV !== 'production',
  isProd: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
};
