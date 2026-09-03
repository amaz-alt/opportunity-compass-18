import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Brain, Database, Radio, Sparkles, AlertCircle, ArrowRight, CircleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10_000 });
  const { data: recentOpps } = useQuery({
    queryKey: ["recent-opps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select("*").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const cards = [
    { label: "Active collectors", value: `${stats?.enabledCollectors ?? 0} / ${stats?.collectors ?? 0}`, icon: Radio, hint: "enabled / total" },
    { label: "Raw events", value: (stats?.events ?? 0).toLocaleString(), icon: Database, hint: `${(stats?.unprocessed ?? 0).toLocaleString()} unprocessed` },
    { label: "AI queue", value: (stats?.unprocessed ?? 0).toLocaleString(), icon: Brain, hint: `${(stats?.processing ?? 0).toLocaleString()} processing` },
    { label: "Opportunities", value: (stats?.opportunities ?? 0).toLocaleString(), icon: Sparkles, hint: "AI-extracted" },
  ];

  return (
    <div className="p-8">
      <PageHeader title="Overview" description="Real-time pipeline status across all platforms." />

      {stats?.aiPaused && (
        <Card className="mb-6 border-destructive/40 bg-destructive/10">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-destructive">AI processing is paused</div>
                <div className="mt-1 text-sm text-muted-foreground">{stats.aiPauseReason ?? "AI evaluation is waiting for workspace access or credits."}</div>
                <div className="mt-1 text-xs text-muted-foreground">Your collectors can continue collecting, but new opportunities will not be created until this is resumed.</div>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/integrations">Open integrations <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Latest opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            {(recentOpps ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {stats?.aiPaused ? "AI evaluation is paused, so no new opportunities are being created." : "No opportunities have been created yet. Check Integrations, then run a full cycle."}
              </div>
            ) : (
              <div className="space-y-3">
                {(recentOpps ?? []).map(o => (
                  <div key={o.id} className="flex items-start gap-3 rounded-md border border-border bg-card/50 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-sm text-primary">
                      {Math.round(Number(o.score))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{o.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.summary}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{o.platform} · {o.intent}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <PipelineRow label="Fetch → Normalize" hint="Collectors" ok={(stats?.events ?? 0) > 0} />
            <PipelineRow label="Deduplicate → Store" hint="raw_events" ok={(stats?.events ?? 0) > 0} />
            <PipelineRow label="AI Process" hint={stats?.aiPaused ? "paused" : "ai_jobs queue"} ok={!stats?.aiPaused && (stats?.failed ?? 0) === 0} />
            <PipelineRow label="Opportunities" hint={`${(stats?.opportunities ?? 0).toLocaleString()} created`} ok={(stats?.opportunities ?? 0) > 0} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PipelineRow({ label, hint, ok }: { label: string; hint: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-2">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {ok ? <span className="h-2 w-2 rounded-full bg-accent" /> : <AlertCircle className="h-4 w-4 text-warning" />}
    </div>
  );
}
