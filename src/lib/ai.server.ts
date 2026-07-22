import { getOpportunityProfileValue, type OpportunityProfile } from "./opportunity-profile.server";

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type SupabaseLike = {
  from: (table: string) => any;
};

type RawEvent = {
  id: string;
  platform: string;
  title: string | null;
  content: string;
  author: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
};

const OpportunitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_opportunity: {
      type: "boolean",
      description:
        "true only if this matches the saved opportunity brief and signals a real user pain, unmet need, feature request, buying intent, underserved market, or actionable product/business angle.",
    },
    title: { type: "string", description: "Short, specific opportunity title (max 90 chars)." },
    summary: { type: "string", description: "1-2 sentence summary of the signal and why it matters for the saved brief." },
    intent: { type: "string", enum: ["pain_point", "feature_request", "buying_intent", "complaint", "praise", "question", "discussion", "launch", "other"] },
    score: { type: "number", description: "0-100 relevance score against the saved opportunity brief." },
    recommended_action: { type: "string", description: "Concrete next action: validate, outreach, build, partner, monitor, or ignore." },
    tags: { type: "array", items: { type: "string" }, description: "3-6 lowercase topic tags." },
  },
  required: ["is_opportunity", "title", "summary", "intent", "score", "recommended_action", "tags"],
} as const;

const SYSTEM_PROMPT = `You are an AI Opportunity Intelligence analyst. Your job is not to summarize every launch. Your job is to find opportunities that match the user's saved opportunity brief.

An opportunity means at least one of these is present:
- a concrete user pain, complaint, unmet need, workaround, or requested feature
- a buying-intent signal or clear willingness to pay
- an underserved niche/customer segment
- a competitor weakness or market gap
- a launch/comment that suggests a product, service, content, partnership, or outreach opportunity

Be strict. Generic launches, vague praise, ordinary announcements, and irrelevant products are not opportunities. If the item does not match the saved brief, return is_opportunity=false even if it is interesting.`;

async function classify(event: RawEvent, profile: OpportunityProfile) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const brief = profile.target.trim()
    ? profile.target.trim()
    : "No specific brief has been set. Use a general founder/PM lens: find actionable pains, buying intent, unmet needs, underserved niches, or competitor gaps.";

  const userContent = [
    `Saved opportunity brief:\n${brief}`,
    `Minimum relevance score for saving: ${profile.minimumScore}`,
    `Platform: ${event.platform}`,
    event.title ? `Title: ${event.title}` : null,
    event.author ? `Author: ${event.author}` : null,
    event.source_url ? `URL: ${event.source_url}` : null,
    event.metadata ? `Metadata:\n${JSON.stringify(event.metadata).slice(0, 2500)}` : null,
    `Content:\n${event.content?.slice(0, 5000) ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");

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
  return JSON.parse(raw) as {
    is_opportunity: boolean;
    title: string;
    summary: string;
    intent: string;
    score: number;
    recommended_action: string;
    tags: string[];
  };
}

export async function processRawEvents(supabase: SupabaseLike, limit: number) {
  const profile = await getOpportunityProfileValue(supabase);
  const boundedLimit = Math.max(1, Math.min(50, limit));

  const { data: events, error: selErr } = await supabase
    .from("raw_events")
    .select("id, platform, title, content, author, source_url, metadata")
    .eq("processed", false)
    .order("collected_at", { ascending: true })
    .limit(boundedLimit);
  if (selErr) throw new Error(selErr.message);

  const results = {
    processed: 0,
    opportunities: 0,
    skipped: 0,
    failed: 0,
    minimumScore: profile.minimumScore,
    target: profile.target,
  };

  for (const ev of (events ?? []) as RawEvent[]) {
    const { data: job } = await supabase
      .from("ai_jobs")
      .insert({ raw_event_id: ev.id, status: "processing", model: MODEL, started_at: new Date().toISOString(), attempts: 1 })
      .select("id")
      .single();

    try {
      const result = await classify(ev, profile);
      const score = Math.max(0, Math.min(100, Number(result.score) || 0));
      const shouldSave = result.is_opportunity && score >= profile.minimumScore;

      if (shouldSave) {
        const { error: oppErr } = await supabase.from("opportunities").insert({
          raw_event_id: ev.id,
          title: result.title.slice(0, 200),
          summary: result.summary,
          intent: result.intent,
          score,
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
}

export { MODEL as AI_MODEL };