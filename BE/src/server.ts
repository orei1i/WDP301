import { env } from './config/env';
import { connectMongo, disconnectMongo } from './db/connection';
import { createApp } from './app';
import { startJobs } from './jobs';

async function main() {
  await connectMongo();
  const stopJobs = startJobs();
  const server = createApp().listen(env.PORT, () => {
    console.log(`🚀 API http://localhost:${env.PORT}/api  (env=${env.NODE_ENV})`);
    if (env.AUTH_DEV_BYPASS) console.warn('⚠  AUTH_DEV_BYPASS is ON — header x-dev-user accepted. Never enable outside local dev.');
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    stopJobs();
    server.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => { console.error(e); process.exit(1); });
