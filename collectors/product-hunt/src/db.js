import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './logger.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let cachedCollector = null;

export async function ensureCollector() {
  if (cachedCollector) return cachedCollector;

  if (config.collectorId) {
    const { data, error } = await supabase
      .from('collectors')
      .select('*')
      .eq('id', config.collectorId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Collector ${config.collectorId} not found`);
    cachedCollector = data;
    return data;
  }

  const { data: existing, error: findErr } = await supabase
    .from('collectors')
    .select('*')
    .eq('platform', config.collectorPlatform)
    .eq('name', config.collectorName)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    cachedCollector = existing;
    return existing;
  }

  const { data: created, error: insErr } = await supabase
    .from('collectors')
    .insert({
      name: config.collectorName,
      platform: config.collectorPlatform,
      enabled: true,
      status: 'idle',
      config: { poll_interval_seconds: config.pollIntervalSeconds },
      schedule: `*/${Math.max(1, Math.floor(config.pollIntervalSeconds / 60))} * * * *`,
    })
    .select()
    .single();
  if (insErr) throw insErr;
  cachedCollector = created;
  logger.info({ collectorId: created.id }, 'Provisioned new collector row');
  return created;
}

export async function log(level, message, metadata = {}) {
  const collector = await ensureCollector().catch(() => null);
  logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
    { ...metadata },
    message,
  );
  if (!collector) return;
  const { error } = await supabase.from('collector_logs').insert({
    collector_id: collector.id,
    level,
    message,
    metadata,
  });
  if (error) logger.error({ err: error }, 'Failed to persist collector log');
}

export async function updateCollectorStatus(patch) {
  const collector = await ensureCollector();
  const { error } = await supabase
    .from('collectors')
    .update(patch)
    .eq('id', collector.id);
  if (error) logger.error({ err: error }, 'Failed to update collector status');
}

export async function incrementEventsCollected(n) {
  if (!n) return;
  const collector = await ensureCollector();
  const { data, error } = await supabase
    .from('collectors')
    .select('events_collected')
    .eq('id', collector.id)
    .single();
  if (error) return;
  await supabase
    .from('collectors')
    .update({ events_collected: (Number(data.events_collected) || 0) + n })
    .eq('id', collector.id);
}

export async function insertRawEvents(events) {
  if (!events.length) return { inserted: 0 };
  // Use upsert on dedupe_hash to prevent duplicates.
  const { data, error } = await supabase
    .from('raw_events')
    .upsert(events, { onConflict: 'dedupe_hash', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return { inserted: data?.length || 0 };
}

export async function getLastCheckpoint() {
  const collector = await ensureCollector();
  return collector.config?.checkpoint || {};
}

export async function saveCheckpoint(checkpoint) {
  const collector = await ensureCollector();
  const nextConfig = { ...(collector.config || {}), checkpoint };
  const { error } = await supabase
    .from('collectors')
    .update({ config: nextConfig })
    .eq('id', collector.id);
  if (error) throw error;
  cachedCollector = { ...collector, config: nextConfig };
}
