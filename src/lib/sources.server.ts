import crypto from "node:crypto";
import { processRawEvents } from "./ai.server";
import { getOpportunityProfileValue } from "./opportunity-profile.server";

type SupabaseLike = {
  from: (table: string) => any;
};

export type SourcePlatform = "hackernews" | "g2" | "capterra";

export type SourceConfig = {
  pollIntervalMinutes?: number;
  itemsPerSync?: number;
  /** Hacker News search queries */
  queries?: string[];
  /** Review page URLs for G2 / Capterra */
  urls?: string[];
  checkpoint?: { lastTimestamp?: number | null };
};

export const SOURCE_META: Record<
  SourcePlatform,
  { name: string; description: string; kind: "api" | "scrape"; defaults: SourceConfig }
> = {
  hackernews: {
    name: "Hacker News",
    description: "Search stories and comments via the public Algolia HN API. No API key required.",
    kind: "api",
    defaults: {
      pollIntervalMinutes: 30,
      itemsPerSync: 30,
      queries: ["alternative to", "i wish there was a tool", "manual process"],
      checkpoint: { lastTimestamp: null },
    },
  },
  g2: {
    name: "G2",
    description: "Scrape G2 review pages (via Firecrawl) and split them into review-sized events.",
    kind: "scrape",
    defaults: {
      pollIntervalMinutes: 720,
      itemsPerSync: 25,
      urls: [],
    },
  },
  capterra: {
    name: "Capterra",
    description: "Scrape Capterra review pages (via Firecrawl) and split them into review-sized events.",
    kind: "scrape",
    defaults: {
      pollIntervalMinutes: 720,
      itemsPerSync: 25,
      urls: [],
    },
  },
};

export const SOURCE_PLATFORMS = Object.keys(SOURCE_META) as SourcePlatform[];

export function isSourcePlatform(value: string): value is SourcePlatform {
  return (SOURCE_PLATFORMS as string[]).includes(value);
}

function sha256(...parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

export function sourceConfig(platform: SourcePlatform, config: unknown): SourceConfig {
  return { ...SOURCE_META[platform].defaults, ...((config ?? {}) as SourceConfig) };
}

export async function ensureSourceCollector(supabase: SupabaseLike, platform: SourcePlatform) {
  const { data: existing, error: selErr } = await supabase
    .from("collectors").select("*").eq("platform", platform).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("collectors")
    .insert({
      name: SOURCE_META[platform].name,
      platform,
      enabled: false,
      config: SOURCE_META[platform].defaults,
      schedule: null,
      status: "idle",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function logSource(
  supabase: SupabaseLike,
  collectorId: string,
  level: "info" | "warn" | "error",
  message: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("collector_logs").insert({ collector_id: collectorId, level, message, metadata });
}

export function isSourceDue(collector: { enabled: boolean; status?: string | null; last_run_at?: string | null; config?: SourceConfig | null }, platform: SourcePlatform) {
  if (!collector.enabled) return { due: false, reason: "collector disabled" };
  const cfg = sourceConfig(platform, collector.config);
  const intervalMs = Math.max(1, cfg.pollIntervalMinutes ?? 30) * 60_000;
  if (collector.status === "running" && collector.last_run_at && Date.now() - new Date(collector.last_run_at).getTime() < 15 * 60_000) {
    return { due: false, reason: "previous run still marked running" };
  }
  if (!collector.last_run_at) return { due: true, reason: "never run" };
  const elapsed = Date.now() - new Date(collector.last_run_at).getTime();
  return elapsed >= intervalMs ? { due: true, reason: "poll interval elapsed" } : { due: false, reason: "poll interval not reached" };
}

/* ------------------------------------------------------------------ */
/* Hacker News (Algolia public API)                                     */
/* ------------------------------------------------------------------ */

type HnHit = {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  story_id?: number | null;
  comment_text?: string | null;
  story_text?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
  created_at_i?: number | null;
  _tags?: string[];
};

const HN_ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date";

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

async function hnSearch(query: string, hitsPerPage: number, since: number | null): Promise<HnHit[]> {
  const params = new URLSearchParams({
    query,
    tags: "(story,comment)",
    hitsPerPage: String(Math.min(100, Math.max(1, hitsPerPage))),
  });
  if (since) params.set("numericFilters", `created_at_i>${since}`);
  const res = await fetch(`${HN_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "signal-lovable-hn/1.0" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Hacker News API ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { hits?: HnHit[] };
  return json.hits ?? [];
}

function normalizeHnHit(collectorId: string, hit: HnHit) {
  const isComment = Boolean(hit.comment_text);
  const externalId = `${isComment ? "comment" : "story"}:${hit.objectID}`;
  const content = stripHtml(hit.comment_text || hit.story_text || hit.title || hit.story_title || "");
  return {
    collector_id: collectorId,
    platform: "hackernews",
    external_id: externalId,
    source_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    author: hit.author ?? null,
    title: hit.title || (hit.story_title ? `Comment on ${hit.story_title}` : "Hacker News item"),
    content,
    dedupe_hash: sha256("hackernews", externalId),
    metadata: {
      kind: isComment ? "comment" : "story",
      points: hit.points ?? null,
      num_comments: hit.num_comments ?? null,
      story_id: hit.story_id ?? null,
      story_title: hit.story_title ?? null,
      external_url: hit.url ?? null,
      created_at: hit.created_at ?? null,
      tags: hit._tags ?? [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* G2 / Capterra (Firecrawl scrape)                                     */
/* ------------------------------------------------------------------ */

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

async function firecrawlScrape(url: string): Promise<string> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!lovableKey || !firecrawlKey) throw new Error("Firecrawl is not connected (missing FIRECRAWL_API_KEY).");

  const res = await fetch(`${FIRECRAWL_GATEWAY}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": firecrawlKey,
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { markdown?: string; data?: { markdown?: string } };
  const markdown = json.markdown ?? json.data?.markdown;
  if (!markdown) throw new Error(`Firecrawl returned no markdown for ${url}`);
  return markdown;
}

/** Split a scraped review page into review-sized chunks. */
export function splitReviewChunks(markdown: string, max: number): string[] {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length >= 180 && !/^!\[/.test(b));

  const chunks: string[] = [];
  let buffer = "";
  for (const block of blocks) {
    if ((buffer + " " + block).length > 1600 && buffer) {
      chunks.push(buffer.trim());
      buffer = block;
    } else {
      buffer = buffer ? `${buffer}\n\n${block}` : block;
    }
    if (chunks.length >= max) break;
  }
  if (buffer && chunks.length < max) chunks.push(buffer.trim());
  return chunks.slice(0, max);
}

function normalizeReviewChunk(collectorId: string, platform: SourcePlatform, url: string, chunk: string, index: number) {
  const hash = sha256(platform, url, sha256(chunk));
  const product = decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "reviews").replace(/[-_]/g, " ");
  return {
    collector_id: collectorId,
    platform,
    external_id: `review:${hash.slice(0, 24)}`,
    source_url: url,
    author: null,
    title: `${SOURCE_META[platform].name} reviews — ${product}`.slice(0, 180),
    content: chunk,
    dedupe_hash: hash,
    metadata: { kind: "review_chunk", url, chunk_index: index, product },
  };
}

/* ------------------------------------------------------------------ */
/* Sync                                                                 */
/* ------------------------------------------------------------------ */

export type SourceSyncDetails = Record<
  string,
  string | number | boolean | null | string[] | Record<string, number | null>
>;

export type SourceSyncResult = {
  ok: boolean;
  error?: string;
  fetched: number;
  inserted: number;
  details?: SourceSyncDetails;
};

export async function runSourceSync(supabase: SupabaseLike, platform: SourcePlatform): Promise<SourceSyncResult> {
  const collector = await ensureSourceCollector(supabase, platform);
  const cfg = sourceConfig(platform, collector.config);
  const itemsPerSync = Math.max(1, Math.min(100, cfg.itemsPerSync ?? 25));
  const startedAt = new Date().toISOString();

  await supabase.from("collectors").update({ status: "running", last_run_at: startedAt, last_error: null }).eq("id", collector.id);
  await logSource(supabase, collector.id, "info", "Sync started", { platform, itemsPerSync });

  let fetched = 0;
  let inserted = 0;
  const details: SourceSyncDetails = {};

  try {
    let rows: Array<Record<string, unknown>> = [];

    if (platform === "hackernews") {
      const queries = (cfg.queries ?? []).map((q) => q.trim()).filter(Boolean);
      if (queries.length === 0) throw new Error("No search queries configured for Hacker News.");
      const since = cfg.checkpoint?.lastTimestamp ?? null;
      const perQuery = Math.max(1, Math.ceil(itemsPerSync / queries.length));
      let newest = since ?? 0;
      const seen = new Set<string>();
      for (const query of queries) {
        const hits = await hnSearch(query, perQuery, since);
        for (const hit of hits) {
          if (seen.has(hit.objectID)) continue;
          seen.add(hit.objectID);
          const row = normalizeHnHit(collector.id, hit);
          if (!row.content || row.content.length < 40) continue;
          rows.push(row);
          if (hit.created_at_i && hit.created_at_i > newest) newest = hit.created_at_i;
        }
      }
      rows = rows.slice(0, itemsPerSync);
      details.queries = queries;
      details.checkpoint = { lastTimestamp: newest || null };
      cfg.checkpoint = { lastTimestamp: newest || null };
    } else {
      const urls = (cfg.urls ?? []).map((u) => u.trim()).filter(Boolean);
      if (urls.length === 0) throw new Error(`No review URLs configured for ${SOURCE_META[platform].name}.`);
      const perUrl = Math.max(1, Math.ceil(itemsPerSync / urls.length));
      const pages: Record<string, number> = {};
      for (const url of urls) {
        const markdown = await firecrawlScrape(url);
        const chunks = splitReviewChunks(markdown, perUrl);
        pages[url] = chunks.length;
        chunks.forEach((chunk, i) => rows.push(normalizeReviewChunk(collector.id, platform, url, chunk, i)));
      }
      rows = rows.slice(0, itemsPerSync);
      details.pages = pages;
    }

    fetched = rows.length;
    if (rows.length > 0) {
      const { data: upserted, error } = await supabase
        .from("raw_events")
        .upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`raw_events upsert failed: ${error.message}`);
      inserted = upserted?.length ?? 0;
    }

    const finishedAt = new Date().toISOString();
    await supabase
      .from("collectors")
      .update({
        status: "ok",
        last_success_at: finishedAt,
        config: cfg,
        events_collected: (collector.events_collected ?? 0) + inserted,
      })
      .eq("id", collector.id);
    await logSource(supabase, collector.id, "info", "Sync completed", { fetched, inserted, ...details });

    return { ok: true, fetched, inserted, details };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("collectors").update({ status: "error", last_error: message }).eq("id", collector.id);
    await logSource(supabase, collector.id, "error", "Sync failed", { error: message, fetched, inserted });
    return { ok: false, error: message, fetched, inserted, details };
  }
}

export async function testSource(supabase: SupabaseLike, platform: SourcePlatform) {
  const collector = await ensureSourceCollector(supabase, platform);
  const cfg = sourceConfig(platform, collector.config);
  try {
    if (platform === "hackernews") {
      const query = (cfg.queries ?? []).find((q) => q.trim()) ?? "saas";
      const hits = await hnSearch(query, 1, null);
      const hit = hits[0];
      await logSource(supabase, collector.id, "info", "Test connection succeeded", { query, sample: hit?.objectID });
      return {
        ok: true as const,
        sample: hit ? { title: hit.title || hit.story_title || "(comment)", url: `https://news.ycombinator.com/item?id=${hit.objectID}`, author: hit.author ?? null } : null,
      };
    }
    const url = (cfg.urls ?? []).find((u) => u.trim());
    if (!url) throw new Error(`Add at least one ${SOURCE_META[platform].name} review URL first.`);
    const markdown = await firecrawlScrape(url);
    const chunks = splitReviewChunks(markdown, 3);
    await logSource(supabase, collector.id, "info", "Test connection succeeded", { url, chunks: chunks.length });
    return { ok: true as const, sample: { title: `${chunks.length} review blocks found`, url, author: null } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logSource(supabase, collector.id, "error", "Test connection failed", { error: message });
    return { ok: false as const, error: message };
  }
}

/* ------------------------------------------------------------------ */
/* Automation                                                           */
/* ------------------------------------------------------------------ */

export async function runSourceAutomation(
  supabase: SupabaseLike,
  platform: SourcePlatform,
  trigger: "manual" | "scheduled",
) {
  const collector = await ensureSourceCollector(supabase, platform);
  const profile = await getOpportunityProfileValue(supabase, collector.id);
  const due = isSourceDue(collector, platform);

  const { data: runRow, error: runErr } = await supabase
    .from("automation_runs")
    .insert({ collector_id: collector.id, trigger, status: "running", stage: "sync" })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);
  const runId = runRow.id as string;

  try {
    const sync: SourceSyncResult =
      trigger === "scheduled" && !due.due
        ? { ok: true, fetched: 0, inserted: 0 }
        : await runSourceSync(supabase, platform);

    await supabase.from("automation_runs").update({
      stage: "ai",
      events_synced: sync.inserted,
      details: { sync, due, platform },
    }).eq("id", runId);

    const ai = await processRawEvents(supabase, profile.autoProcessLimit, {
      collectorId: collector.id,
      profile,
      onProgress: async (done) => {
        await supabase.from("automation_runs").update({ events_processed: done }).eq("id", runId);
      },
    });

    const status = sync.ok && ai.failed === 0 && !ai.paused ? "succeeded" : "failed";
    await supabase.from("automation_runs").update({
      status,
      stage: "done",
      completed_at: new Date().toISOString(),
      events_processed: ai.processed,
      opportunities_created: ai.opportunities,
      errors: ai.failed + (sync.ok ? 0 : 1) + (ai.paused ? 1 : 0),
      error_message: ai.pauseReason ?? (sync.ok ? null : sync.error ?? null),
      details: { sync, ai, due, platform },
    }).eq("id", runId);

    await logSource(supabase, collector.id, status === "succeeded" ? "info" : "warn", "Automation cycle completed", { runId, sync, ai, due });

    return { ok: sync.ok, runId, sync, ai };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("automation_runs").update({
      status: "failed",
      stage: "error",
      completed_at: new Date().toISOString(),
      error_message: msg,
      errors: 1,
    }).eq("id", runId);
    throw err;
  }
}
