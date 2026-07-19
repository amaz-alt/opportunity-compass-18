import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Brain, Database, Radio } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-primary/20 blur-[120px]" />

      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Radio className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight">Signal</span>
        </div>
        <Link to="/auth" className="text-sm rounded-md bg-primary px-4 py-2 text-primary-foreground font-medium hover:opacity-90">
          Sign in
        </Link>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-8 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur px-3 py-1 text-xs text-muted-foreground mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Live signal from Reddit, Discord, Product Hunt, Quora, G2 & more
        </div>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          AI opportunity <span className="text-gradient-primary">intelligence</span><br />
          for the entire web.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Independent collectors scan every platform where your customers ask questions. AI extracts intent, scores urgency, and surfaces the opportunities worth acting on.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/dashboard" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Open dashboard
          </Link>
          <Link to="/auth" className="rounded-md border border-border bg-card/50 px-5 py-2.5 text-sm font-medium hover:bg-card">
            Sign in
          </Link>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { icon: Radio, label: "Collectors", desc: "External VPS workers" },
            { icon: Database, label: "Raw events", desc: "Normalized & deduped" },
            { icon: Brain, label: "AI pipeline", desc: "Intent + score + action" },
            { icon: Activity, label: "Dashboard", desc: "Browse & triage" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-lg border border-border bg-card/50 backdrop-blur p-5 text-left">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground mt-1">{desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
