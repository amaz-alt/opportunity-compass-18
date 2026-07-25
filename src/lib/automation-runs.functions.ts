import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("automation_runs")
      .select("id, collector_id, trigger, status, stage, started_at, completed_at, events_synced, events_processed, opportunities_created, errors, error_message, details")
      .order("started_at", { ascending: false })
      .limit(data?.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLatestAutomationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ collectorId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("automation_runs")
      .select("id, collector_id, trigger, status, stage, started_at, completed_at, events_synced, events_processed, opportunities_created, errors, error_message, details")
      .order("started_at", { ascending: false })
      .limit(1);
    if (data?.collectorId) q = q.eq("collector_id", data.collectorId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  });
