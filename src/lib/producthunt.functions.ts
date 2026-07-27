import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensureProductHuntCollector,
  isProductHuntDue,
  PRODUCT_HUNT_DEFAULTS,
  runProductHuntSyncCore,
  runProductHuntAutomation,
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
    const profile = await getOpportunityProfileValue(context.supabase, collector.id);

    const { data: runRow, error: runErr } = await context.supabase
      .from("automation_runs")
      .insert({
        collector_id: collector.id,
        trigger: "manual",
        status: "running",
        stage: "sync",
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = runRow.id as string;

    try {
      const sync = await runProductHuntSyncCore(context.supabase, process.env.PRODUCT_HUNT_TOKEN);
      await context.supabase.from("automation_runs").update({
        stage: "ai",
        events_synced: (sync.postsInserted ?? 0) + (sync.commentsInserted ?? 0),
        details: { sync },
      }).eq("id", runId);

      const ai = await processRawEvents(context.supabase, profile.autoProcessLimit, {
        collectorId: collector.id,
        profile,
        onProgress: async (done) => {
          await context.supabase.from("automation_runs").update({ events_processed: done }).eq("id", runId);
        },
      });

      const status = sync.ok && ai.failed === 0 ? "succeeded" : "failed";
      await context.supabase.from("automation_runs").update({
        status,
        stage: "done",
        completed_at: new Date().toISOString(),
        events_processed: ai.processed,
        opportunities_created: ai.opportunities,
        errors: ai.failed + (sync.ok ? 0 : 1),
        error_message: !sync.ok && "error" in sync ? String((sync as { error?: string }).error ?? "") : null,
        details: { sync, ai },
      }).eq("id", runId);

      await context.supabase.from("collector_logs").insert({
        collector_id: collector.id,
        level: status === "succeeded" ? "info" : "warn",
        message: "Automation cycle completed",
        metadata: { runId, sync, ai },
      });

      return { ok: sync.ok, runId, sync, ai };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await context.supabase.from("automation_runs").update({
        status: "failed",
        stage: "error",
        completed_at: new Date().toISOString(),
        error_message: msg,
        errors: 1,
      }).eq("id", runId);
      throw err;
    }
  });

