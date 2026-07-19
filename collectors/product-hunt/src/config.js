import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  productHuntToken: required('PRODUCT_HUNT_TOKEN'),

  collectorId: process.env.COLLECTOR_ID || null,
  collectorName: process.env.COLLECTOR_NAME || 'Product Hunt',
  collectorPlatform: process.env.COLLECTOR_PLATFORM || 'producthunt',

  port: parseInt(process.env.PORT || '8080', 10),
  pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '900', 10),
  postsPerRun: parseInt(process.env.POSTS_PER_RUN || '40', 10),
  commentsPerPost: parseInt(process.env.COMMENTS_PER_POST || '50', 10),
  autostart: (process.env.AUTOSTART || 'true').toLowerCase() === 'true',

  maxRetries: parseInt(process.env.MAX_RETRIES || '5', 10),
  retryBaseMs: parseInt(process.env.RETRY_BASE_MS || '1000', 10),
};
