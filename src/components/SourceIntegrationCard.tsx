import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Loader2, PlayCircle, Plug, RefreshCw, XCircle, Zap } from "lucide-react";
import {
  getSourceIntegration,
  runSourceAutomationNow,
  runSourceSyncNow,
  testSourceConnection,
  updateSourceSettings,
} from "@/lib/sources.functions";
import { updateOpportunityProfile } from "@/lib/opportunity-profile.functions";

type Platform = "hackernews" | "g2" | "capterra";

export function SourceIntegrationCard({ platform }: { platform: Platform }) {
  const qc = useQueryClient();
  const getIntegration = useServerFn(getSourceIntegration);
  const updateSettings = useServerFn(updateSourceSettings);
  const testConn = useServerFn(testSourceConnection);
  const runSync = useServerFn(runSourceSyncNow);
  const runCycle = useServerFn(runSourceAutomationNow);
  const saveProfile = useServerFn(updateOpportunityProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["source-integration", platform],
    queryFn: () => getIntegration({ data: { platform } }),
    refetchInterval: 20_000,
  });

  const isScrape = platform !== "hackernews";
  const [enabled, setEnabled] = useState(false);
  const [pollIntervalMinutes, setPoll] = useState(30);
  const [itemsPerSync, setItems] = useState(25);
  const [lines, setLines] = useState("");
  const [brief, setBrief] = useState("");

  useEffect(() => {
    if (!data) return;
    setEnabled(Boolean(data.collector.enabled));
    setPoll(data.config.pollIntervalMinutes ?? 30);
    setItems(data.config.itemsPerSync ?? 25);
    setLines(((isScrape ? data.config.urls : data.config.queries) ?? []).join("\n"));
    setBrief(data.opportunityProfile.target ?? "");
  }, [data, isScrape]);

  const parsedLines = lines.split("\n").map((l) => l.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        data: {
          platform,
          enabled,
          pollIntervalMinutes,
          itemsPerSync,
          ...(isScrape ? { urls: parsedLines } : { queries: parsedLines }),
        },
      }),
    onSuccess: () => {
      toast.success(`${data?.meta.name} settings saved`);
      qc.invalidateQueries({ queryKey: ["source-integration", platform] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBrief = useMutation({
    mutationFn: () => {
      const p = data!.opportunityProfile;
      return saveProfile({
        data: {
          collectorId: data!.collector.id,
          target: brief,
          keywords: p.keywords,
          stages: p.stages,
          dealSize: p.dealSize,
          geography: p.geography,
          minimumScore: p.minimumScore,
          autoProcessLimit: p.autoProcessLimit,
        },
      });
    },
    onSuccess: () => {
      toast.success("Brief saved for this source");
      qc.invalidateQueries({ queryKey: ["source-integration", platform] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; sample?: { title: string; url: string; author: string | null } | null } | null>(null);
  const test = useMutation({
    mutationFn: () => testConn({ data: { platform } }),
    onSuccess: (res) => {
      setTestResult(res);
      res.ok ? toast.success("Connection OK") : toast.error(res.error ?? "Failed");
    },
    onError: (e: Error) => { setTestResult({ ok: false, error: e.message }); toast.error(e.message); },
  });

  const sync = useMutation({
    mutationFn: () => runSync({ data: { platform } }),
    onSuccess: (res) => {
      res.ok ? toast.success(`Synced ${res.inserted} new events (${res.fetched} fetched)`) : toast.error(res.error ?? "Sync failed");
      qc.invalidateQueries({ queryKey: ["source-integration", platform] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cycle = useMutation({
    mutationFn: () => runCycle({ data: { platform } }),
    onSuccess: (res) => {
      toast.success(`Full cycle: ${res.sync.inserted} raw events, ${res.ai.opportunities} opportunities`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = save.isPending || test.isPending || sync.isPending || cycle.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{data?.meta.name ?? platform}</CardTitle>
            <CardDescription>{data?.meta.description}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data?.ready ? "secondary" : "destructive"}>
            {data?.ready ? (isScrape ? "Firecrawl ready" : "No key needed") : "Firecrawl missing"}
          </Badge>
          <Badge variant={data?.collector.enabled ? "default" : "outline"}>
            {data?.collector.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Poll interval (minutes)</Label>
            <Input type="number" min={1} max={10080} value={pollIntervalMinutes} onChange={(e) => setPoll(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Items per sync</Label>
            <Input type="number" min={1} max={100} value={itemsPerSync} onChange={(e) => setItems(Number(e.target.value))} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{isScrape ? "Review page URLs (one per line)" : "Search queries (one per line)"}</Label>
          <Textarea
            rows={4}
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={
              isScrape
                ? platform === "g2"
                  ? "https://www.g2.com/products/notion/reviews"
                  : "https://www.capterra.com/p/186596/Notion/reviews/"
                : "alternative to\ni wish there was a tool\nmanual process"
            }
          />
          <p className="text-xs text-muted-foreground">
            {isScrape
              ? "Each page is scraped and split into review-sized events, then evaluated by the AI."
              : "Each query hits the public Hacker News search API, newest first, incrementally from the last sync."}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <div className="text-sm font-medium">Enabled</div>
            <div className="text-xs text-muted-foreground">Required for scheduled automation cycles. Manual runs always work.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label>Opportunity brief for this source</Label>
          <Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What counts as an opportunity from this source?" />
          <Button size="sm" variant="secondary" onClick={() => saveBrief.mutate()} disabled={!data || saveBrief.isPending}>
            {saveBrief.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />} Save brief
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={busy}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save settings
          </Button>
          <Button variant="secondary" onClick={() => test.mutate()} disabled={busy}>
            {test.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />} Test connection
          </Button>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={busy}>
            {sync.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Run sync now
          </Button>
          <Button variant="outline" onClick={() => cycle.mutate()} disabled={busy}>
            {cycle.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />} Run full cycle now
          </Button>
        </div>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Status" value={data.collector.status} />
            <Stat label="Events collected" value={Number(data.collector.events_collected ?? 0).toLocaleString()} />
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
              <div className="mt-1 text-muted-foreground">
                <a href={testResult.sample.url} target="_blank" rel="noreferrer" className="underline">{testResult.sample.title}</a>
              </div>
            )}
            {testResult.error && <div className="mt-1 text-destructive break-all">{testResult.error}</div>}
          </div>
        )}

        {data?.collector.last_error && (
          <div className="text-xs text-destructive break-all">Last error: {data.collector.last_error}</div>
        )}
      </CardContent>
    </Card>
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
