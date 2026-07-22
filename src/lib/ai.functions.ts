import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

type RawEvent = {
  id: string; platform: string; title: string | null; content: string;
  author: string | null; source_url: string | null;
  metadata: Record<string, unknown> | null;
};

const OpportunitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_opportunity: { type: "boolean", description: "true only if this signals a real user pain, unmet need, feature request, complaint, or buying intent worth acting on." },
    title: { type: "string", description: "Short, specific opportunity title (max 90 chars)." },
    summary: { type: "string", description: "1-2 sentence summary of the signal and why it matters." },
    intent: { type: "string", enum: ["pain_point", "feature_request", "buying_intent", "complaint", "praise", "question", "discussion", "launch", "other"] },
    score: { type: "number", description: "0-100 confidence/relevance score." },
    recommended_action: { type: "string", description: "Concrete next action (outreach, build, monitor, ignore)." },
    tags: { type: "array", items: { type: "string" }, description: "3-6 lowercase topic tags." },
  },
  required: ["is_opportunity", "title", "summary", "intent", "score", "recommended_action", "tags"],
} as const;

const SYSTEM_PROMPT = `You are an AI Opportunity Intelligence analyst. You read signals from platforms like Product Hunt, Reddit, Discord, GitHub, etc. and decide whether each item represents an actionable opportunity: a real user pain, unmet need, feature request, buying intent, or actionable insight. Be strict — most launches/announcements/generic praise are NOT opportunities; set is_opportunity=false for those. Only return is_opportunity=true when there is a concrete signal a founder or PM could act on.`;

async function classify(event: RawEvent) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const userContent = [
    `Platform: ${event.platform}`,
    event.title ? `Title: ${event.title}` : null,
    event.author ? `Author: ${event.author}` : null,
    event.source_url ? `URL: ${event.source_url}` : null,
    `Content:\n${event.content?.slice(0, 4000) ?? ""}`,
  ].filter(Boolean).join("\n");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "opportunity", strict: true, schema: OpportunitySchema },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw);
  return parsed as {
    is_opportunity: boolean; title: string; summary: string; intent: string;
    score: number; recommended_action: string; tags: string[];
  };
}

export const processAiQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: events, error: selErr } = await supabase
      .from("raw_events")
      .select("id, platform, title, content, author, source_url, metadata")
      .eq("processed", false)
      .order("collected_at", { ascending: true })
      .limit(data.limit);
    if (selErr) throw new Error(selErr.message);

    const results = { processed: 0, opportunities: 0, skipped: 0, failed: 0 };

    for (const ev of (events ?? []) as RawEvent[]) {
      const { data: job } = await supabase
        .from("ai_jobs")
        .insert({ raw_event_id: ev.id, status: "processing", model: MODEL, started_at: new Date().toISOString(), attempts: 1 })
        .select("id").single();

      try {
        const result = await classify(ev);

        if (result.is_opportunity) {
          const { error: oppErr } = await supabase.from("opportunities").insert({
            raw_event_id: ev.id,
            title: result.title.slice(0, 200),
            summary: result.summary,
            intent: result.intent,
            score: Math.max(0, Math.min(100, result.score)),
            recommended_action: result.recommended_action,
            tags: result.tags,
            platform: ev.platform,
            source_url: ev.source_url,
            status: "new",
          });
          if (oppErr) throw new Error(`opportunity insert: ${oppErr.message}`);
          results.opportunities++;
        } else {
          results.skipped++;
        }

        await supabase.from("raw_events").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", ev.id);
        if (job?.id) {
          await supabase.from("ai_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
        }
        results.processed++;
      } catch (err) {
        results.failed++;
        const msg = err instanceof Error ? err.message : String(err);
        if (job?.id) {
          await supabase.from("ai_jobs").update({ status: "failed", error: msg, completed_at: new Date().toISOString() }).eq("id", job.id);
        }
      }
    }

    return results;
  });
