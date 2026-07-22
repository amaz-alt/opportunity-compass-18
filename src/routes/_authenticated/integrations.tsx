import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  getProductHuntIntegration,
  updateProductHuntSettings,
  testProductHuntConnection,
  runProductHuntSync,
  runProductHuntAutomationNow,
} from "@/lib/producthunt.functions";
import { updateOpportunityProfile } from "@/lib/opportunity-profile.functions";
import { CheckCircle2, XCircle, Loader2, PlayCircle, Plug, RefreshCw, KeyRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/integrations")({ component: IntegrationsPage });

function IntegrationsPage() {
  const qc = useQueryClient();
  const getIntegration = useServerFn(getProductHuntIntegration);
  const updateSettings = useServerFn(updateProductHuntSettings);
  const testConn = useServerFn(testProductHuntConnection);
  const runSync = useServerFn(runProductHuntSync);
  const runAutomation = useServerFn(runProductHuntAutomationNow);
  const saveProfile = useServerFn(updateOpportunityProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["ph-integration"],
    queryFn: () => getIntegration(),
    refetchInterval: 15_000,
  });

  const [pollIntervalMinutes, setPoll] = useState(30);
  const [postsPerSync, setPosts] = useState(20);
  const [commentsPerPost, setComments] = useState(25);
  const [enabled, setEnabled] = useState(false);
  const [target, setTarget] = useState("");
  const [minimumScore, setMinimumScore] = useState(65);
  const [autoProcessLimit, setAutoProcessLimit] = useState(50);

  useEffect(() => {
    if (!data) return;
    setPoll(data.config.pollIntervalMinutes ?? 30);
    setPosts(data.config.postsPerSync ?? 20);
    setComments(data.config.commentsPerPost ?? 25);
    setEnabled(Boolean(data.collector.enabled));
    setTarget(data.opportunityProfile.target ?? "");
    setMinimumScore(data.opportunityProfile.minimumScore ?? 65);
    setAutoProcessLimit(data.opportunityProfile.autoProcessLimit ?? 50);
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateSettings({ data: { pollIntervalMinutes, postsPerSync, commentsPerPost, enabled } }),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["ph-integration"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; sample?: { name: string; slug: string; url: string; votesCount: number; createdAt: string } | null } | null>(null);
  const test = useMutation({
    mutationFn: () => testConn(),
    onSuccess: (res) => { setTestResult(res); res.ok ? toast.success("Connection OK") : toast.error(res.error ?? "Failed"); },
    onError: (e: Error) => { setTestResult({ ok: false, error: e.message }); toast.error(e.message); },
  });

  const [syncResult, setSyncResult] = useState<Awaited<ReturnType<typeof runProductHuntSync>> | null>(null);
  const sync = useMutation({
    mutationFn: () => runSync(),
    onSuccess: (res) => {
      setSyncResult(res);
      if (res.ok) toast.success(`Synced: ${res.postsInserted} posts, ${res.commentsInserted} comments`);
      else toast.error(res.error ?? "Sync failed");
      qc.invalidateQueries({ queryKey: ["ph-integration"] });
      qc.invalidateQueries({ queryKey: ["ph-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profile = useMutation({
    mutationFn: () => saveProfile({ data: { target, minimumScore, autoProcessLimit } }),
    onSuccess: () => { toast.success("Opportunity brief saved"); qc.invalidateQueries({ queryKey: ["ph-integration"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const automation = useMutation({
    mutationFn: () => runAutomation(),
    onSuccess: (res) => {
      toast.success(`Full cycle: ${res.sync.postsInserted + res.sync.commentsInserted} raw events, ${res.ai.opportunities} opportunities`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: logs } = useQuery({
    queryKey: ["ph-logs", data?.collector.id],
    enabled: Boolean(data?.collector.id),
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("collector_logs")
        .select("id, level, message, metadata, created_at")
        .eq("collector_id", data!.collector.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return rows;
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <PageHeader
        title="Integrations"
        description="Native platform integrations that run inside Lovable — no external VPS needed."
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Plug className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Product Hunt</CardTitle>
              <CardDescription>Fetch launches, makers, comments, topics and votes via Product Hunt GraphQL v2.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data?.tokenPresent ? "secondary" : "destructive"} className="gap-1">
              <KeyRound className="h-3 w-3" /> {data?.tokenPresent ? "Token configured" : "Token missing"}
            </Badge>
            <Badge variant={data?.collector.enabled ? "default" : "outline"}>
              {data?.collector.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

          {!data?.tokenPresent && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="font-medium text-destructive">PRODUCT_HUNT_TOKEN not set</div>
              <div className="text-muted-foreground">Add your Product Hunt developer token as the server secret <code>PRODUCT_HUNT_TOKEN</code> in Lovable Cloud settings.</div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="poll">Poll interval (minutes)</Label>
              <Input id="poll" type="number" min={1} max={1440} value={pollIntervalMinutes} onChange={(e) => setPoll(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="posts">Posts per sync</Label>
              <Input id="posts" type="number" min={1} max={100} value={postsPerSync} onChange={(e) => setPosts(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comments">Comments per post</Label>
              <Input id="comments" type="number" min={0} max={100} value={commentsPerPost} onChange={(e) => setComments(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Marks the collector active in the framework. Sync still runs on demand via "Run Sync Now".</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="rounded-md border border-border p-4 space-y-4">
            <div>
              <div className="text-sm font-medium">Opportunity brief</div>
              <div className="text-xs text-muted-foreground">AI only saves opportunities that match this target and meet the score threshold.</div>
            </div>
            <Textarea
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              rows={5}
              placeholder="Example: Find B2B SaaS ideas for small agencies: painful manual workflows, expensive tools people complain about, buying intent, integration gaps, or underserved niches."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="min-score">Minimum opportunity score</Label>
                <Input id="min-score" type="number" min={0} max={100} value={minimumScore} onChange={(e) => setMinimumScore(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auto-limit">Events processed per cycle</Label>
                <Input id="auto-limit" type="number" min={1} max={50} value={autoProcessLimit} onChange={(e) => setAutoProcessLimit(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => profile.mutate()} disabled={profile.isPending}>
                {profile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save opportunity brief
              </Button>
              <Button onClick={() => automation.mutate()} disabled={automation.isPending || !data?.tokenPresent}>
                {automation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run full cycle now
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save settings
            </Button>
            <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending || !data?.tokenPresent}>
              {test.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
            <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending || !data?.tokenPresent}>
              {sync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run Sync Now
            </Button>
          </div>

          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Status" value={data.collector.status} />
              <Stat label="Events collected" value={data.collector.events_collected.toLocaleString()} />
              <Stat label="Last run" value={data.collector.last_run_at ? formatDistanceToNow(new Date(data.collector.last_run_at), { addSuffix: true }) : "never"} />
              <Stat label="Last success" value={data.collector.last_success_at ? formatDistanceToNow(new Date(data.collector.last_success_at), { addSuffix: true }) : "never"} />
            </div>
          )}

          {testResult && (
            <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                {testResult.ok ? "Connection successful" : "Connection failed"}
              </div>
              {testResult.sample && (
                <div className="mt-2 text-muted-foreground">
                  Sample launch: <span className="font-medium text-foreground">{testResult.sample.name}</span> · {testResult.sample.votesCount} votes ·{" "}
                  <a href={testResult.sample.url} target="_blank" rel="noreferrer" className="underline">{testResult.sample.slug}</a>
                </div>
              )}
              {testResult.error && <div className="mt-1 text-destructive break-all">{testResult.error}</div>}
            </div>
          )}

          {syncResult && (
            <div className={`rounded-md border p-3 text-sm ${syncResult.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}`}>
              <div className="flex items-center gap-2 font-medium">
                {syncResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                {syncResult.ok ? "Sync completed" : "Sync failed"}
              </div>
              <div className="mt-1 text-muted-foreground text-xs font-mono">
                posts: {syncResult.postsInserted}/{syncResult.postsFetched} · comments: {syncResult.commentsInserted}/{syncResult.commentsFetched}
              </div>
              {"error" in syncResult && syncResult.error && <div className="mt-1 text-destructive break-all">{syncResult.error}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Latest entries from <code>collector_logs</code> for Product Hunt.</CardDescription>
        </CardHeader>
        <CardContent>
          {(logs ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No logs yet.</div>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {logs!.map((l) => (
                <div key={l.id} className="flex gap-2 items-start border-b border-border/50 pb-1">
                  <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                  <Badge variant={l.level === "error" ? "destructive" : l.level === "warn" ? "secondary" : "outline"} className="shrink-0">{l.level}</Badge>
                  <div className="flex-1">
                    <div>{l.message}</div>
                    {l.metadata != null && Object.keys(l.metadata as object).length > 0 && (
                      <pre className="text-muted-foreground mt-1 whitespace-pre-wrap break-all">{JSON.stringify(l.metadata, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
