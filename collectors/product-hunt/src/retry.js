import { config } from './config.js';
import { logger } from './logger.js';

export async function withRetry(fn, { label = 'op', retries = config.maxRetries } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      // Do not retry on auth errors
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      const delay = config.retryBaseMs * 2 ** attempt + Math.random() * 250;
      logger.warn({ label, attempt, delay, err: err.message }, 'Retrying after error');
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}
