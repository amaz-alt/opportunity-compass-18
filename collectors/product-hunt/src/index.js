import { config } from './config.js';
import { logger } from './logger.js';
import { buildServer } from './server.js';
import { collector } from './collector.js';
import { ensureCollector, log } from './db.js';

async function main() {
  const app = buildServer();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  try {
    const c = await ensureCollector();
    logger.info({ id: c.id, name: c.name, enabled: c.enabled }, 'Collector row ready');
    await log('info', 'Service booted', { pid: process.pid });
    if (config.autostart && c.enabled) await collector.start();
  } catch (err) {
    logger.error({ err }, 'Failed to initialize collector');
  }

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    try { await collector.stop(); } catch (e) { logger.error({ err: e }, 'stop error'); }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
  process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'));
}

main();
