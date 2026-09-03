import { supabase } from "@/integrations/supabase/client";

export type Collector = {
  id: string;
  name: string;
  platform: string;
  enabled: boolean;
  config: Record<string, unknown>;
  schedule: string | null;
  status: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  events_collected: number;
  created_at: string;
  updated_at: string;
};

export type RawEvent = {
  id: string;
  collector_id: string | null;
  platform: string;
  external_id: string | null;
  source_url: string | null;
  author: string | null;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  dedupe_hash: string;
  collected_at: string;
  processed: boolean;
  processed_at: string | null;
};

export type AiJob = {
  id: string;
  raw_event_id: string;
  status: string;
  model: string | null;
  attempts: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
};

export type Opportunity = {
  id: string;
  raw_event_id: string | null;
  title: string;
  summary: string;
  intent: string;
  score: number;
  recommended_action: string | null;
  tags: string[];
  platform: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
};

export type CollectorLog = {
  id: string;
  collector_id: string | null;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type PauseSetting = { paused?: unknown; reason?: unknown };

export async function fetchStats() {
  const [collectors, events, opportunities, pending, processing, failed, pauseSetting] = await Promise.all([
    supabase.from("collectors").select("id", { count: "exact", head: true }),
    supabase.from("raw_events").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("id", { count: "exact", head: true }),
    supabase.from("raw_events").select("id", { count: "exact", head: true }).eq("processed", false),
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("app_settings").select("value").eq("key", "ai_processing_paused").maybeSingle(),
  ]);

  const { count: enabledCount } = await supabase
    .from("collectors")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  const pause = (pauseSetting.data?.value ?? {}) as PauseSetting;
  return {
    collectors: collectors.count ?? 0,
    enabledCollectors: enabledCount ?? 0,
    events: events.count ?? 0,
    unprocessed: pending.count ?? 0,
    jobsTotal: (processing.count ?? 0) + (failed.count ?? 0),
    pending: pending.count ?? 0,
    processing: processing.count ?? 0,
    failed: failed.count ?? 0,
    opportunities: opportunities.count ?? 0,
    aiPaused: pause.paused === true,
    aiPauseReason: typeof pause.reason === "string" ? pause.reason : null,
  };
}
