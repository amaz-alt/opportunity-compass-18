import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAutomationRuns } from "@/lib/automation-runs.functions";
import { formatDistanceToNow, format } from "date-fns";
import { ScrollText, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

function statusIcon(status: string) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "succeeded") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
}

function fmtDuration(start: string, end?: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function HistoryPage() {
  const list = useServerFn(listAutomationRuns);
  const { data: runs, isLoading } = useQuery({
    queryKey: ["automation-runs"],
    queryFn: () => list({ data: { limit: 100 } }),
    refetchInterval: 5_000,
  });

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <PageHeader
        title="Automation history"
        description="Every scheduled and manual cycle with timings, counts, and errors."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
          <CardDescription>Auto-refreshes every 5 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (runs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No runs yet. Trigger one from Integrations.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3">Status</th>
                    <th className="text-left py-2 pr-3">Trigger</th>
                    <th className="text-left py-2 pr-3">Started</th>
                    <th className="text-left py-2 pr-3">Duration</th>
                    <th className="text-right py-2 pr-3">Synced</th>
                    <th className="text-right py-2 pr-3">Processed</th>
                    <th className="text-right py-2 pr-3">Opps</th>
                    <th className="text-right py-2 pr-3">Errors</th>
                    <th className="text-left py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {runs!.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {statusIcon(r.status)}
                          <span className="capitalize">{r.status}</span>
                          {r.status === "running" && r.stage && (
                            <Badge variant="outline" className="text-[10px]">{r.stage}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 capitalize">{r.trigger}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" title={format(new Date(r.started_at), "PPpp")}>
                        {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </td>
                      <td className="py-2 pr-3">{fmtDuration(r.started_at, r.completed_at)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.events_synced}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.events_processed}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.opportunities_created}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.errors}</td>
                      <td className="py-2">
                        {r.error_message ? (
                          <span className="text-destructive text-xs break-all">{r.error_message}</span>
                        ) : (
                          <Link to="/logs" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                            <ScrollText className="h-3 w-3" /> logs
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="outline">
          <Link to="/integrations">Back to integrations</Link>
        </Button>
      </div>
    </div>
  );
}
