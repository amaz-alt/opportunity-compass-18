import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Brain, Database, Radio, Sparkles, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10_000 });
  const { data: recentOpps } = useQuery({
    queryKey: ["recent-opps"],
    queryFn: async () => {
      const { data } = await supabase.from("opportunities").select("*").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const cards = [
    { label: "Active collectors", value: `${stats?.enabledCollectors ?? 0} / ${stats?.collectors ?? 0}`, icon: Radio, hint: "enabled / total" },
    { label: "Raw events", value: stats?.events ?? 0, icon: Database, hint: `${stats?.unprocessed ?? 0} unprocessed` },
    { label: "AI queue", value: (stats?.pending ?? 0) + (stats?.processing ?? 0), icon: Brain, hint: `${stats?.processing ?? 0} processing` },
    { label: "Opportunities", value: stats?.opportunities ?? 0, icon: Sparkles, hint: "AI-extracted" },
  ];

  return (
    <div className="p-8">
      <PageHeader title="Overview" description="Real-time pipeline status across all platforms." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Latest opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            {(recentOpps ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No opportunities yet. Collectors on your VPS will populate this feed.
              </div>
            ) : (
              <div className="space-y-3">
                {recentOpps!.map(o => (
                  <div key={o.id} className="flex items-start gap-3 p-3 rounded-md border border-border bg-card/50">
                    <div className="h-10 w-10 rounded shrink-0 bg-primary/10 border border-primary/30 flex items-center justify-center font-mono text-sm text-primary">
                      {Math.round(Number(o.score))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{o.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{o.summary}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1">
                        {o.platform} · {o.intent}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <PipelineRow label="Fetch → Normalize" hint="Collectors (VPS)" ok />
            <PipelineRow label="Deduplicate → Store" hint="raw_events" ok />
            <PipelineRow label="AI Process" hint="ai_jobs queue" ok={((stats?.pending ?? 0) + (stats?.processing ?? 0)) < 500} />
            <PipelineRow label="Opportunities" hint="dashboard" ok />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PipelineRow({ label, hint, ok }: { label: string; hint: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md border border-border">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {ok ? (
        <span className="h-2 w-2 rounded-full bg-accent" />
      ) : (
        <AlertCircle className="h-4 w-4 text-warning" />
      )}
    </div>
  );
}
