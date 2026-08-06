import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOpportunityProfileValue } from "./opportunity-profile.server";
import {
  SOURCE_META,
  SOURCE_PLATFORMS,
  ensureSourceCollector,
  isSourceDue,
  runSourceAutomation,
  runSourceSync,
  sourceConfig,
  testSource,
  type SourcePlatform,
} from "./sources.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseCtx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: SupabaseCtx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

const platformSchema = z.enum(SOURCE_PLATFORMS as [SourcePlatform, ...SourcePlatform[]]);

export const getSourceIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ platform: platformSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const collector = await ensureSourceCollector(context.supabase, data.platform);
    const config = sourceConfig(data.platform, collector.config);
    return {
      platform: data.platform,
      meta: SOURCE_META[data.platform],
      collector,
      config,
      due: isSourceDue(collector, data.platform),
      ready: data.platform === "hackernews" ? true : Boolean(process.env.FIRECRAWL_API_KEY),
      opportunityProfile: await getOpportunityProfileValue(context.supabase, collector.id),
    };
  });

export const updateSourceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      platform: platformSchema,
      enabled: z.boolean(),
      pollIntervalMinutes: z.number().int().min(1).max(10080),
      itemsPerSync: z.number().int().min(1).max(100),
      queries: z.array(z.string()).max(20).optional(),
      urls: z.array(z.string().url()).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const collector = await ensureSourceCollector(context.supabase, data.platform);
    const prev = sourceConfig(data.platform, collector.config);
    const nextConfig = {
      ...prev,
      pollIntervalMinutes: data.pollIntervalMinutes,
      itemsPerSync: data.itemsPerSync,
      ...(data.queries ? { queries: data.queries.map((q) => q.trim()).filter(Boolean) } : {}),
      ...(data.urls ? { urls: data.urls.map((u) => u.trim()).filter(Boolean) } : {}),
    };
    const { error } = await context.supabase
      .from("collectors")
      .update({ config: nextConfig, enabled: data.enabled })
      .eq("id", collector.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testSourceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ platform: platformSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return testSource(context.supabase, data.platform);
  });

export const runSourceSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ platform: platformSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return runSourceSync(context.supabase, data.platform);
  });

export const runSourceAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ platform: platformSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return runSourceAutomation(context.supabase, data.platform, "manual");
  });
