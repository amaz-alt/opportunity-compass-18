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
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return getOpportunityProfileValue(context.supabase);
  });

export const updateOpportunityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    target: z.string().max(4000),
    minimumScore: z.number().min(0).max(100),
    autoProcessLimit: z.number().int().min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return upsertOpportunityProfileValue(context.supabase, data);
  });