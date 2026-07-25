import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOpportunityProfileValue, upsertOpportunityProfileValue } from "./opportunity-profile.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getOpportunityProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ collectorId: z.string().uuid().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return getOpportunityProfileValue(context.supabase, data?.collectorId);
  });

export const updateOpportunityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    collectorId: z.string().uuid().optional(),
    target: z.string().max(4000),
    keywords: z.array(z.string()).max(40).default([]),
    stages: z.string().max(500).default(""),
    dealSize: z.string().max(500).default(""),
    geography: z.string().max(500).default(""),
    minimumScore: z.number().min(0).max(100),
    autoProcessLimit: z.number().int().min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { collectorId, ...profile } = data;
    return upsertOpportunityProfileValue(context.supabase, profile, collectorId);
  });
