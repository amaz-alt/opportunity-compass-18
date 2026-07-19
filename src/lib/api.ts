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

export async function fetchStats() {
  const [collectors, events, jobs, opps] = await Promise.all([
    supabase.from("collectors").select("id, enabled", { count: "exact" }),
    supabase.from("raw_events").select("id, processed", { count: "exact", head: false }).limit(5000),
    supabase.from("ai_jobs").select("id, status", { count: "exact", head: false }).limit(5000),
    supabase.from("opportunities").select("id, score", { count: "exact", head: false }).limit(5000),
  ]);
  const enabledCollectors = (collectors.data ?? []).filter(c => c.enabled).length;
  const unprocessed = (events.data ?? []).filter(e => !e.processed).length;
  const pending = (jobs.data ?? []).filter(j => j.status === "pending").length;
  const processing = (jobs.data ?? []).filter(j => j.status === "processing").length;
  return {
    collectors: collectors.count ?? 0,
    enabledCollectors,
    events: events.count ?? 0,
    unprocessed,
    jobsTotal: jobs.count ?? 0,
    pending,
    processing,
    opportunities: opps.count ?? 0,
  };
}
