import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import type { AiJob } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/queue")({ component: QueuePage });

function QueuePage() {
  const { data: jobs } = useQuery({
    queryKey: ["ai_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_jobs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as AiJob[];
    },
    refetchInterval: 5_000,
  });

  const groups = {
    pending: (jobs ?? []).filter(j => j.status === "pending").length,
    processing: (jobs ?? []).filter(j => j.status === "processing").length,
    completed: (jobs ?? []).filter(j => j.status === "completed").length,
    failed: (jobs ?? []).filter(j => j.status === "failed").length,
  };

  return (
    <div className="p-8">
      <PageHeader title="AI processing queue" description="ai_jobs table — one job per raw event awaiting or having gone through AI extraction." />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Object.entries(groups).map(([k, v]) => (
          <Card key={k} className="border-border">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="text-2xl font-semibold mt-1 tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs ?? []).map(j => (
                <TableRow key={j.id}>
                  <TableCell><JobStatus status={j.status} /></TableCell>
                  <TableCell className="font-mono text-xs">{j.model ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{j.attempts}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-xs truncate">{j.error ?? ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.started_at ? formatDistanceToNow(new Date(j.started_at), { addSuffix: true }) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.completed_at ? formatDistanceToNow(new Date(j.completed_at), { addSuffix: true }) : "—"}</TableCell>
                </TableRow>
              ))}
              {(jobs ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">Queue is empty.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function JobStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    processing: "bg-primary/20 text-primary border border-primary/40",
    completed: "bg-accent/20 text-accent border border-accent/40",
    failed: "bg-destructive/20 text-destructive border border-destructive/40",
  };
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? map.pending}`}>{status}</span>;
}
