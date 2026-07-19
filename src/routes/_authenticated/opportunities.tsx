import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { Opportunity } from "@/lib/api";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/opportunities")({ component: OppsPage });

function OppsPage() {
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);

  const { data: opps } = useQuery({
    queryKey: ["opportunities", intent, minScore],
    queryFn: async () => {
      let query = supabase.from("opportunities").select("*").order("score", { ascending: false }).order("created_at", { ascending: false }).limit(300);
      if (intent !== "all") query = query.eq("intent", intent);
      if (minScore > 0) query = query.gte("score", minScore);
      const { data, error } = await query;
      if (error) throw error;
      return data as Opportunity[];
    },
    refetchInterval: 15_000,
  });

  const intents = Array.from(new Set((opps ?? []).map(o => o.intent))).slice(0, 8);
  const filtered = (opps ?? []).filter(o => !q || o.title.toLowerCase().includes(q.toLowerCase()) || o.summary.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-8">
      <PageHeader title="Opportunities" description="AI-extracted opportunities with intent, score, and recommended action." />
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
        <select value={intent} onChange={e => setIntent(e.target.value)} className="rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All intents</option>
          {intents.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <Input type="number" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} placeholder="Min score" className="w-32" />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border"><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No opportunities yet. The AI pipeline populates this once raw events are processed.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(o => (
            <Card key={o.id} className="border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-md bg-primary/10 border border-primary/40 flex items-center justify-center">
                    <div className="text-lg font-semibold font-mono text-primary">{Math.round(Number(o.score))}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug">{o.title}</h3>
                      {o.source_url && (
                        <a href={o.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{o.summary}</p>
                    {o.recommended_action && (
                      <div className="mt-3 p-2 rounded bg-accent/10 border border-accent/30">
                        <div className="text-[10px] uppercase tracking-wider text-accent font-medium">Recommended action</div>
                        <div className="text-xs mt-0.5">{o.recommended_action}</div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <Badge variant="secondary" className="text-[10px]">{o.intent}</Badge>
                      {o.platform && <Badge variant="outline" className="text-[10px]">{o.platform}</Badge>}
                      {o.tags.slice(0, 3).map(t => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
