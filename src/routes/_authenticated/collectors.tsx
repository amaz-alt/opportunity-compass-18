import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Collector } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/collectors")({ component: CollectorsPage });

function CollectorsPage() {
  const qc = useQueryClient();
  const { data: collectors } = useQuery({
    queryKey: ["collectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collectors").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Collector[];
    },
    refetchInterval: 10_000,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("collectors").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collectors"] }); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("collectors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collectors"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Collectors"
        description="External VPS workers that fetch normalized events from platforms. They run independently and push into raw_events."
        actions={<CollectorDialog />}
      />
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Enabled</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(collectors ?? []).map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-mono text-xs">{c.platform}</Badge></TableCell>
                  <TableCell><StatusBadge status={c.status} error={c.last_error} /></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.schedule ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{c.events_collected.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.last_run_at ? formatDistanceToNow(new Date(c.last_run_at), { addSuffix: true }) : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch checked={c.enabled} onCheckedChange={(v) => toggle.mutate({ id: c.id, enabled: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <CollectorDialog collector={c} />
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${c.name}"?`)) del.mutate(c.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(collectors ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                  No collectors yet. Add one to start feeding raw events into the pipeline.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  if (error) return <Badge variant="destructive">error</Badge>;
  const map: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    running: "bg-primary/20 text-primary border border-primary/40",
    ok: "bg-accent/20 text-accent border border-accent/40",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? map.idle}`}>{status}</span>;
}

function CollectorDialog({ collector }: { collector?: Collector }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collector?.name ?? "");
  const [platform, setPlatform] = useState(collector?.platform ?? "reddit");
  const [schedule, setSchedule] = useState(collector?.schedule ?? "*/15 * * * *");
  const [enabled, setEnabled] = useState(collector?.enabled ?? true);
  const [config, setConfig] = useState(JSON.stringify(collector?.config ?? { subreddits: ["startups"], keywords: [] }, null, 2));

  const save = useMutation({
    mutationFn: async () => {
      let parsedConfig: unknown = {};
      try { parsedConfig = JSON.parse(config); } catch { throw new Error("Invalid JSON in config"); }
      const payload = { name, platform, schedule, enabled, config: parsedConfig as never };
      if (collector) {
        const { error } = await supabase.from("collectors").update(payload).eq("id", collector.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("collectors").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collectors"] });
      toast.success(collector ? "Updated" : "Created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {collector ? (
          <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="h-4 w-4 mr-1" /> New collector</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{collector ? "Edit collector" : "New collector"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Reddit — r/startups" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="reddit" />
            </div>
            <div className="space-y-2">
              <Label>Schedule (cron)</Label>
              <Input value={schedule} onChange={e => setSchedule(e.target.value)} className="font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Config (JSON)</Label>
            <Textarea value={config} onChange={e => setConfig(e.target.value)} className="font-mono text-xs min-h-40" />
            <p className="text-xs text-muted-foreground">Passed as-is to your collector worker on the VPS.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="c-enabled" />
            <Label htmlFor="c-enabled">Enabled</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !platform}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
