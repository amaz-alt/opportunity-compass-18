import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { collector } from './collector.js';
import { config } from './config.js';
import { ensureCollector } from './db.js';
import { runTest } from './test.js';

export function buildServer() {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  // Permissive CORS so the Lovable admin dashboard can call the VPS collector.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'producthunt-collector', uptime: process.uptime() });
  });

  app.get('/status', async (_req, res) => {
    try {
      const c = await ensureCollector();
      res.json({
        collector: {
          id: c.id,
          name: c.name,
          platform: c.platform,
          enabled: c.enabled,
          status: c.status,
          last_run_at: c.last_run_at,
          last_success_at: c.last_success_at,
          last_error: c.last_error,
          events_collected: c.events_collected,
        },
        runtime: collector.getStats(),
        config: {
          pollIntervalSeconds: config.pollIntervalSeconds,
          postsPerRun: config.postsPerRun,
          commentsPerPost: config.commentsPerPost,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/collector/start', async (_req, res) => {
    try {
      const r = await collector.start();
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/collector/stop', async (_req, res) => {
    try {
      const r = await collector.stop();
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use((err, _req, res, _next) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
