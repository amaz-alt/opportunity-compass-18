import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { CollectorLog, Collector } from "@/lib/api";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/logs")({ component: LogsPage });

function LogsPage() {
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");

  const { data: collectors } = useQuery({
    queryKey: ["collectors-map"],
    queryFn: async () => {
      const { data } = await supabase.from("collectors").select("id, name");
      const map = new Map<string, string>();
      (data ?? []).forEach(c => map.set(c.id, (c as Pick<Collector, "id" | "name">).name));
      return map;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["logs", level],
    queryFn: async () => {
      let query = supabase.from("collector_logs").select("*").order("created_at", { ascending: false }).limit(300);
      if (level !== "all") query = query.eq("level", level);
      const { data, error } = await query;
      if (error) throw error;
      return data as CollectorLog[];
    },
    refetchInterval: 5_000,
  });

  return (
    <div className="p-8">
      <PageHeader title="Logs" description="Live log stream from all collectors on the VPS." />
      <div className="flex gap-1 rounded-md border border-border p-1 mb-4 w-fit">
        {(["all", "info", "warn", "error"] as const).map(l => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-3 py-1 text-xs rounded ${level === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >{l}</button>
        ))}
      </div>
      <Card className="border-border">
        <CardContent className="p-0 font-mono text-xs">
          {(logs ?? []).length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">No log entries yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {logs!.map(l => (
                <div key={l.id} className="grid grid-cols-[80px_60px_180px_1fr] gap-3 px-4 py-2 hover:bg-muted/30">
                  <LevelPill level={l.level} />
                  <span className="text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: false })}</span>
                  <span className="text-primary truncate">{l.collector_id ? (collectors?.get(l.collector_id) ?? l.collector_id.slice(0, 8)) : "system"}</span>
                  <span className="truncate">{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LevelPill({ level }: { level: string }) {
  const map: Record<string, string> = {
    info: "bg-muted text-muted-foreground",
    warn: "bg-warning/20 text-warning border border-warning/40",
    error: "bg-destructive/20 text-destructive border border-destructive/40",
  };
  return <span className={`inline-flex justify-center rounded px-1.5 text-[10px] font-medium uppercase ${map[level] ?? map.info}`}>{level}</span>;
}
