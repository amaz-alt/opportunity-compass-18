type SupabaseLike = {
  from: (table: string) => any;
};

export type OpportunityProfile = {
  target: string;
  minimumScore: number;
  autoProcessLimit: number;
};

export const DEFAULT_OPPORTUNITY_PROFILE: OpportunityProfile = {
  target: "",
  minimumScore: 65,
  autoProcessLimit: 50,
};

export function normalizeOpportunityProfile(value: unknown): OpportunityProfile {
  const source = (value ?? {}) as Partial<OpportunityProfile>;
  return {
    target: typeof source.target === "string" ? source.target : DEFAULT_OPPORTUNITY_PROFILE.target,
    minimumScore: Math.max(0, Math.min(100, Number(source.minimumScore ?? DEFAULT_OPPORTUNITY_PROFILE.minimumScore))),
    autoProcessLimit: Math.max(1, Math.min(50, Number(source.autoProcessLimit ?? DEFAULT_OPPORTUNITY_PROFILE.autoProcessLimit))),
  };
}

export async function getOpportunityProfileValue(supabase: SupabaseLike): Promise<OpportunityProfile> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "opportunity_profile")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeOpportunityProfile(data?.value);
}

export async function upsertOpportunityProfileValue(supabase: SupabaseLike, profile: OpportunityProfile) {
  const next = normalizeOpportunityProfile(profile);
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "opportunity_profile", value: next }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}