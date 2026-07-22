import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processRawEvents } from "./ai.server";
import { getOpportunityProfileValue } from "./opportunity-profile.server";
import {
  ensureProductHuntCollector,
  isProductHuntDue,
  PRODUCT_HUNT_DEFAULTS,
  runProductHuntSyncCore,
  testProductHuntToken,
  type ProductHuntConfig,
} from "./producthunt.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseCtx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: SupabaseCtx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function ensureCollector({ supabase }: SupabaseCtx) {
  const { data: existing, error: selErr } = await supabase
    .from("collectors").select("*").eq("platform", PLATFORM).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;
  const { data, error } = await supabase.from("collectors").insert({
    name: COLLECTOR_NAME, platform: PLATFORM, enabled: false,
    config: DEFAULTS, schedule: null, status: "idle",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function log(supabase: SupabaseCtx["supabase"], collectorId: string, level: "info"|"warn"|"error", message: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("collector_logs").insert({ collector_id: collectorId, level, message, metadata });
}

export const getProductHuntIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const collector = await ensureProductHuntCollector(context.supabase);
    const tokenPresent = Boolean(process.env.PRODUCT_HUNT_TOKEN);
    const opportunityProfile = await getOpportunityProfileValue(context.supabase);
    return {
      collector,
      tokenPresent,
      due: isProductHuntDue(collector),
      opportunityProfile,
      config: { ...PRODUCT_HUNT_DEFAULTS, ...(collector.config as ProductHuntConfig) },
    };
  });

export const updateProductHuntSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pollIntervalMinutes: z.number().int().min(1).max(1440),
    postsPerSync: z.number().int().min(1).max(100),
    commentsPerPost: z.number().int().min(0).max(100),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const collector = await ensureProductHuntCollector(context.supabase);
    const prev = (collector.config as ProductHuntConfig) ?? {};
    const nextConfig: ProductHuntConfig = {
      ...prev,
      pollIntervalMinutes: data.pollIntervalMinutes,
      postsPerSync: data.postsPerSync,
      commentsPerPost: data.commentsPerPost,
    };
    const { error } = await context.supabase.from("collectors").update({
      config: nextConfig, enabled: data.enabled,
    }).eq("id", collector.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testProductHuntConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return testProductHuntToken(context.supabase, process.env.PRODUCT_HUNT_TOKEN);
  });

export const runProductHuntSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return runProductHuntSyncCore(context.supabase, process.env.PRODUCT_HUNT_TOKEN);
  });

export const runProductHuntAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const collector = await ensureProductHuntCollector(context.supabase);
    const sync = await runProductHuntSyncCore(context.supabase, process.env.PRODUCT_HUNT_TOKEN);
    const profile = await getOpportunityProfileValue(context.supabase);
    const ai = await processRawEvents(context.supabase, profile.autoProcessLimit);
    await context.supabase.from("collector_logs").insert({
      collector_id: collector.id,
      level: sync.ok && ai.failed === 0 ? "info" : "warn",
      message: "Automation cycle completed",
      metadata: { sync, ai },
    });
    return { ok: sync.ok, sync, ai };
  });
