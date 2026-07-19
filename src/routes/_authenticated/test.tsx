import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlayCircle, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/test")({
  component: TestPage,
});

type TestResult = {
  ok: boolean;
  error?: string;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  collector?: { id: string; name: string; platform: string };
  rawResponse?: unknown;
  normalized?: unknown;
  insert?: { id: string; created_at: string; dedupe_hash: string; external_id: string };
  steps?: Array<{ step: string; status: string; at: string; [k: string]: unknown }>;
  logs?: Array<{ id: string; level: string; message: string; metadata: unknown; created_at: string }>;
  aiPipelineTriggered?: boolean;
  status?: number | null;
  code?: string | null;
  details?: string | null;
  stack?: string[];
};

const LS_KEY = "signal.collector.producthunt.baseUrl";

function TestPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setBaseUrl(saved);
  }, []);

  const runTest = async () => {
    setNetworkError(null);
    setResult(null);
    if (!baseUrl) {
      setNetworkError("Set the collector base URL first (e.g. http://your-vps:8080).");
      return;
    }
    localStorage.setItem(LS_KEY, baseUrl);
    setLoading(true);
    try {
      const url = baseUrl.replace(/\/$/, "") + "/collector/test";
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      const text = await res.text();
      let json: TestResult;
      try { json = JSON.parse(text); }
      catch { throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`); }
      setResult(json);
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Product Hunt · Test Mode</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fetches exactly one live Product Hunt item, normalizes it, and inserts into <code>raw_events</code>.
          The AI pipeline is NOT triggered.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collector endpoint</CardTitle>
          <CardDescription>
            The Product Hunt collector runs on your VPS. Enter its base URL — this call goes directly from your browser to that host.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="http://your-vps-host:8080"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <Button onClick={runTest} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run Test
          </Button>
          {networkError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Request failed</div>
                <div className="text-muted-foreground break-all">{networkError}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {result.ok ? (
                    <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Test succeeded</>
                  ) : (
                    <><XCircle className="h-5 w-5 text-destructive" /> Test failed</>
                  )}
                </CardTitle>
                <CardDescription>
                  {result.startedAt} → {result.finishedAt ?? "—"}
                  {result.collector && <> · collector <code>{result.collector.name}</code></>}
                </CardDescription>
              </div>
              {!result.ok && result.error && <Badge variant="destructive">{result.error}</Badge>}
            </CardHeader>
            {(result.message || result.steps) && (
              <CardContent className="space-y-3">
                {result.message && !result.ok && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <div className="font-medium text-destructive">{result.error}</div>
                    <div className="text-muted-foreground mt-1 break-all">{result.message}</div>
                    {result.code && <div className="text-xs mt-1">code: <code>{result.code}</code></div>}
                    {result.details && <div className="text-xs mt-1">details: <code>{result.details}</code></div>}
                  </div>
                )}
                {result.steps && (
                  <div className="space-y-1">
                    {result.steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono">
                        {s.status === "ok" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span className="text-muted-foreground">{s.at.slice(11, 19)}</span>
                        <span className="font-semibold">{s.step}</span>
                        <span className={s.status === "ok" ? "text-emerald-500" : "text-destructive"}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <Section title="Database insert result" empty={!result.insert}>
            {result.insert && <Json data={result.insert} />}
          </Section>

          <Section title="Normalized payload" empty={!result.normalized}>
            {result.normalized != null && <Json data={result.normalized} />}
          </Section>

          <Section title="Raw API response" empty={!result.rawResponse}>
            {result.rawResponse != null && <Json data={result.rawResponse} />}
          </Section>

          <Section title="Logs (collector_logs)" empty={!result.logs?.length}>
            {result.logs && result.logs.length > 0 && (
              <div className="space-y-1 font-mono text-xs">
                {result.logs.map((l) => (
                  <div key={l.id} className="flex gap-2 items-start border-b border-border/50 pb-1">
                    <span className="text-muted-foreground shrink-0">{l.created_at.slice(11, 19)}</span>
                    <Badge
                      variant={l.level === "error" ? "destructive" : l.level === "warn" ? "secondary" : "outline"}
                      className="shrink-0"
                    >
                      {l.level}
                    </Badge>
                    <div className="flex-1">
                      <div>{l.message}</div>
                      {l.metadata != null && Object.keys(l.metadata as object).length > 0 && (
                        <pre className="text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                          {JSON.stringify(l.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {result.stack && (
            <Section title="Stack trace">
              <pre className="text-xs font-mono whitespace-pre-wrap">{result.stack.join("\n")}</pre>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {empty ? (
          <div className="text-xs text-muted-foreground italic">No data.</div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function Json({ data }: { data: unknown }) {
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded-md p-3 max-h-96 overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
