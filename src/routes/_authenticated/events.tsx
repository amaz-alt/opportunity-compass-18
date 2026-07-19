import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { RawEvent } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/events")({ component: EventsPage });

function EventsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "processed" | "unprocessed">("all");

  const { data: events } = useQuery({
    queryKey: ["raw_events", filter],
    queryFn: async () => {
      let query = supabase.from("raw_events").select("*").order("collected_at", { ascending: false }).limit(200);
      if (filter === "processed") query = query.eq("processed", true);
      if (filter === "unprocessed") query = query.eq("processed", false);
      const { data, error } = await query;
      if (error) throw error;
      return data as RawEvent[];
    },
    refetchInterval: 15_000,
  });

  const filtered = (events ?? []).filter(e =>
    !q || e.content.toLowerCase().includes(q.toLowerCase()) || (e.author ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-8">
      <PageHeader title="Raw events" description="Normalized, deduplicated events fetched by collectors — awaiting AI processing." />
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search content or author..." value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
        <div className="flex gap-1 rounded-md border border-border p-1">
          {(["all", "unprocessed", "processed"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{f}</button>
          ))}
        </div>
      </div>
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(e => (
                <TableRow key={e.id}>
                  <TableCell><Badge variant="secondary" className="font-mono text-xs">{e.platform}</Badge></TableCell>
                  <TableCell className="max-w-lg">
                    {e.title && <div className="text-sm font-medium truncate">{e.title}</div>}
                    <div className="text-xs text-muted-foreground line-clamp-2">{e.content}</div>
                    {e.source_url && <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">open source</a>}
                  </TableCell>
                  <TableCell className="text-xs">{e.author ?? "—"}</TableCell>
                  <TableCell>
                    {e.processed
                      ? <Badge className="bg-accent/20 text-accent border border-accent/40">processed</Badge>
                      : <Badge variant="secondary">pending</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(e.collected_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                  No events. Once collectors start pushing, they'll appear here.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
