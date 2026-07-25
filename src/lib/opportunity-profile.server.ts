type SupabaseLike = {
  from: (table: string) => any;
};

export type OpportunityProfile = {
  target: string;
  keywords: string[];
  stages: string;
  dealSize: string;
  geography: string;
  minimumScore: number;
  autoProcessLimit: number;
};

export const DEFAULT_OPPORTUNITY_PROFILE: OpportunityProfile = {
  target: "",
  keywords: [],
  stages: "",
  dealSize: "",
  geography: "",
  minimumScore: 65,
  autoProcessLimit: 50,
};

function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean).slice(0, 40);
  if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 40);
  return [];
}

export function normalizeOpportunityProfile(value: unknown): OpportunityProfile {
  const source = (value ?? {}) as Partial<OpportunityProfile> & Record<string, unknown>;
  return {
    target: typeof source.target === "string" ? source.target : DEFAULT_OPPORTUNITY_PROFILE.target,
    keywords: normalizeKeywords(source.keywords),
    stages: typeof source.stages === "string" ? source.stages : "",
    dealSize: typeof source.dealSize === "string" ? source.dealSize : "",
    geography: typeof source.geography === "string" ? source.geography : "",
    minimumScore: Math.max(0, Math.min(100, Number(source.minimumScore ?? DEFAULT_OPPORTUNITY_PROFILE.minimumScore))),
    autoProcessLimit: Math.max(1, Math.min(50, Number(source.autoProcessLimit ?? DEFAULT_OPPORTUNITY_PROFILE.autoProcessLimit))),
  };
}

function profileKey(collectorId?: string | null) {
  return collectorId ? `opportunity_profile:${collectorId}` : "opportunity_profile";
}

export async function getOpportunityProfileValue(
  supabase: SupabaseLike,
  collectorId?: string | null,
): Promise<OpportunityProfile> {
  if (collectorId) {
    const { data, error } = await supabase
      .from("app_settings").select("value").eq("key", profileKey(collectorId)).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.value) return normalizeOpportunityProfile(data.value);
  }
  const { data, error } = await supabase
    .from("app_settings").select("value").eq("key", "opportunity_profile").maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeOpportunityProfile(data?.value);
}

export async function upsertOpportunityProfileValue(
  supabase: SupabaseLike,
  profile: OpportunityProfile,
  collectorId?: string | null,
) {
  const next = normalizeOpportunityProfile(profile);
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: profileKey(collectorId), value: next }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}
