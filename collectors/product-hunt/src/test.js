import { config } from './config.js';
import { withRetry } from './retry.js';
import { normalizePost } from './normalize.js';
import { ensureCollector, supabase, log } from './db.js';
import { logger } from './logger.js';

const ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';

// Fetch exactly ONE post via a minimal query. Returns raw GraphQL data.
const TEST_QUERY = `
  query TestOne {
    posts(first: 1, order: NEWEST) {
      edges {
        node {
          id name tagline description slug url website
          votesCount commentsCount createdAt featuredAt
          user { id name username headline }
          makers { id name username headline }
          topics(first: 10) { edges { node { id name slug } } }
          media { url type }
          thumbnail { url }
        }
      }
    }
  }
`;

async function fetchOne() {
  return withRetry(async () => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.productHuntToken}`,
        'User-Agent': 'signal-collector-producthunt/1.0 (test)',
      },
      body: JSON.stringify({ query: TEST_QUERY }),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch { throw new Error(`Non-JSON response from Product Hunt (${res.status}): ${text.slice(0, 300)}`); }
    if (!res.ok) {
      const err = new Error(`Product Hunt API ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    if (json.errors?.length) {
      throw new Error(`Product Hunt GraphQL error: ${JSON.stringify(json.errors).slice(0, 400)}`);
    }
    return json;
  }, { label: 'ph-test-one' });
}

/**
 * Fetch ONE real Product Hunt item, normalize, insert into raw_events.
 * Does NOT touch the AI pipeline. Returns detailed diagnostics.
 */
export async function runTest() {
  const startedAt = new Date().toISOString();
  const steps = [];
  const record = (step, status, detail = {}) => {
    const entry = { step, status, at: new Date().toISOString(), ...detail };
    steps.push(entry);
    logger[status === 'error' ? 'error' : 'info']({ step, ...detail }, `test: ${step} ${status}`);
    return entry;
  };

  await log('info', 'Test mode invoked', { startedAt });

  let collector;
  try {
    collector = await ensureCollector();
    record('ensure_collector', 'ok', { collector_id: collector.id });
  } catch (err) {
    record('ensure_collector', 'error', { error: err.message });
    await log('error', 'Test: ensureCollector failed', { error: err.message });
    return { ok: false, error: 'ensure_collector_failed', message: err.message, steps };
  }

  let rawResponse;
  try {
    rawResponse = await fetchOne();
    const count = rawResponse?.data?.posts?.edges?.length || 0;
    record('fetch', 'ok', { edges: count });
    await log('info', 'Test: fetched Product Hunt item', { edges: count });
  } catch (err) {
    record('fetch', 'error', { error: err.message, status: err.status ?? null });
    await log('error', 'Test: fetch failed', { error: err.message, status: err.status ?? null });
    return { ok: false, error: 'fetch_failed', message: err.message, status: err.status ?? null, steps };
  }

  const node = rawResponse?.data?.posts?.edges?.[0]?.node;
  if (!node) {
    record('extract', 'error', { error: 'No post returned' });
    await log('warn', 'Test: no post returned from API');
    return { ok: false, error: 'no_post', message: 'Product Hunt returned zero posts', rawResponse, steps };
  }

  let normalized;
  try {
    normalized = normalizePost(collector.id, node);
    record('normalize', 'ok', { external_id: normalized.external_id, dedupe_hash: normalized.dedupe_hash });
  } catch (err) {
    record('normalize', 'error', { error: err.message });
    await log('error', 'Test: normalize failed', { error: err.message });
    return { ok: false, error: 'normalize_failed', message: err.message, rawResponse, steps };
  }

  let insert;
  try {
    const { data, error } = await supabase
      .from('raw_events')
      .upsert(normalized, { onConflict: 'dedupe_hash', ignoreDuplicates: false })
      .select('id, created_at, dedupe_hash, external_id')
      .single();
    if (error) throw error;
    insert = { id: data.id, created_at: data.created_at, dedupe_hash: data.dedupe_hash, external_id: data.external_id };
    record('insert', 'ok', { id: data.id });
    await log('info', 'Test: raw_events row upserted', { id: data.id, external_id: data.external_id });
  } catch (err) {
    record('insert', 'error', { error: err.message, code: err.code ?? null, details: err.details ?? null });
    await log('error', 'Test: insert failed', { error: err.message, code: err.code ?? null });
    return {
      ok: false, error: 'insert_failed', message: err.message,
      code: err.code ?? null, details: err.details ?? null,
      normalized, rawResponse, steps,
    };
  }

  const finishedAt = new Date().toISOString();
  await log('info', 'Test mode completed', { finishedAt, insertedId: insert.id });

  // Fetch the collector_logs written by THIS test run.
  let logs = [];
  try {
    const { data } = await supabase
      .from('collector_logs')
      .select('id, level, message, metadata, created_at')
      .eq('collector_id', collector.id)
      .gte('created_at', startedAt)
      .order('created_at', { ascending: true });
    logs = data || [];
  } catch (err) {
    logger.warn({ err }, 'Test: failed to fetch collector_logs');
  }

  return {
    ok: true,
    startedAt,
    finishedAt,
    collector: { id: collector.id, name: collector.name, platform: collector.platform },
    rawResponse,
    normalized,
    insert,
    steps,
    logs,
    aiPipelineTriggered: false,
  };
}
