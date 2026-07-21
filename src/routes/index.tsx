import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Brain, Database, Radio, ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal — Quiet intelligence for high-intent opportunities" },
      { name: "description", content: "A discreet listening layer for the web. Signal detects, ranks and delivers the conversations worth acting on — across Reddit, Discord, Product Hunt, Quora, G2, GitHub and more." },
      { property: "og:title", content: "Signal — Quiet intelligence for high-intent opportunities" },
      { property: "og:description", content: "A discreet listening layer for the web. Ranked by AI, delivered without noise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="relative z-20 flex items-center justify-between px-8 md:px-16 py-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-sm border border-primary/40 bg-primary/10 flex items-center justify-center">
            <Radio className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-xl tracking-tight">Signal</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-0.5">Opportunity Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a href="#philosophy" className="hidden md:inline text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">Philosophy</a>
          <a href="#pipeline" className="hidden md:inline text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">Pipeline</a>
          <a href="#sources" className="hidden md:inline text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">Sources</a>
          <ThemeToggle />
          <Link to="/auth" className="text-sm rounded-sm border border-border bg-card/40 backdrop-blur px-4 py-2 hover:border-primary/50 hover:text-primary transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.12] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 h-[520px] w-[900px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute top-40 right-10 h-[280px] w-[280px] rounded-full bg-accent/10 blur-[100px]" />

        <div className="relative z-10 max-w-[1200px] mx-auto px-8 md:px-16 pt-16 md:pt-28 pb-32 md:pb-44">
          <div className="inline-flex items-center gap-3 rounded-full border border-border/70 bg-card/40 backdrop-blur px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-70 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Listening to the open web · Live
          </div>

          <h1 className="font-serif text-[3.25rem] md:text-[6.5rem] leading-[0.95] tracking-tight max-w-5xl">
            The quiet<br />
            <span className="italic text-gradient-primary">intelligence layer</span><br />
            for the open web.
          </h1>

          <div className="mt-12 grid md:grid-cols-[1.2fr_1fr] gap-12 items-end">
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl font-light">
              Signal listens where your customers actually speak — forums, launches, reviews, communities — and returns only the conversations that matter, ranked by intent.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
              <Link to="/dashboard" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
                Enter the dashboard
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link to="/auth" className="inline-flex items-center justify-center rounded-sm border border-border bg-card/40 backdrop-blur px-6 py-3 text-sm hover:border-primary/50 transition-colors">
                Request access
              </Link>
            </div>
          </div>
        </div>

        {/* Hairline strip */}
        <div className="border-t border-border/60">
          <div className="max-w-[1200px] mx-auto px-8 md:px-16 py-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {["Reddit", "Product Hunt", "Discord", "Quora · G2 · GitHub"].map(s => (
              <div key={s} className="flex items-center gap-2">
                <span className="h-px flex-1 bg-border/60" />
                <span>{s}</span>
                <span className="h-px flex-1 bg-border/60" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PHILOSOPHY */}
      <section id="philosophy" className="relative py-32 md:py-40 border-b border-border/60">
        <div className="max-w-[1200px] mx-auto px-8 md:px-16 grid md:grid-cols-[auto_1fr] gap-16 md:gap-24">
          <div className="text-xs uppercase tracking-[0.28em] text-primary/80 md:sticky md:top-24 md:self-start">
            01 — Ethos
          </div>
          <div>
            <h2 className="font-serif text-4xl md:text-6xl leading-[1.05] tracking-tight text-gradient-serif">
              Attention is expensive.<br />
              <span className="italic text-muted-foreground/90">We spend it carefully.</span>
            </h2>
            <p className="mt-10 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl font-light">
              Most tools flood you with mentions. Signal does the opposite — it discards. Every event passes through independent collectors, deduplication, and an AI pipeline that scores urgency and intent before anything reaches you.
            </p>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl font-light">
              What remains is small, quiet, and unmistakably worth acting on.
            </p>
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="relative py-32 md:py-40 border-b border-border/60">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="max-w-[1200px] mx-auto px-8 md:px-16">
          <div className="flex items-end justify-between gap-8 flex-wrap mb-16">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-primary/80 mb-4">02 — Pipeline</div>
              <h2 className="font-serif text-4xl md:text-6xl leading-[1.05] tracking-tight max-w-3xl">
                Four movements,<br /><span className="italic">one signal.</span>
              </h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">Every source flows through the same disciplined path. Modular by design — new collectors slot in without touching the rest.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-px bg-border/60 border border-border/60 rounded-sm overflow-hidden">
            {[
              { icon: Radio, num: "I", label: "Collect", desc: "Independent VPS workers listen to each platform on their own cadence." },
              { icon: Database, num: "II", label: "Normalize", desc: "Events are shaped, hashed and deduped into a single canonical schema." },
              { icon: Brain, num: "III", label: "Reason", desc: "An AI pipeline extracts intent, urgency and the action worth taking." },
              { icon: Activity, num: "IV", label: "Surface", desc: "Only ranked opportunities reach the dashboard. Nothing else." },
            ].map(({ icon: Icon, num, label, desc }) => (
              <div key={label} className="group relative bg-card/60 backdrop-blur p-8 md:p-10 hover:bg-card transition-colors">
                <div className="flex items-center justify-between mb-8">
                  <span className="font-serif text-3xl italic text-primary/70">{num}</span>
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="font-serif text-2xl mb-3">{label}</div>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOURCES / QUOTE */}
      <section id="sources" className="relative py-32 md:py-44 border-b border-border/60 overflow-hidden">
        <div className="absolute top-1/2 -translate-y-1/2 -left-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="max-w-[1100px] mx-auto px-8 md:px-16 text-center relative">
          <div className="text-xs uppercase tracking-[0.28em] text-primary/80 mb-8">03 — Practice</div>
          <blockquote className="font-serif text-3xl md:text-5xl leading-[1.15] tracking-tight">
            <span className="text-accent/80">“</span>
            We built Signal for the operators who want <span className="italic">fewer, better</span> reasons to reach out — not more noise to sift through.
            <span className="text-accent/80">”</span>
          </blockquote>
          <div className="mt-10 inline-flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            <span className="h-px w-10 bg-border" />
            The Signal team
            <span className="h-px w-10 bg-border" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-32 md:py-44">
        <div className="absolute inset-0 bg-grid opacity-[0.08] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="max-w-[1000px] mx-auto px-8 md:px-16 text-center relative">
          <h2 className="font-serif text-5xl md:text-7xl leading-[1.02] tracking-tight">
            Begin listening,<br /><span className="italic text-gradient-primary">quietly.</span>
          </h2>
          <p className="mt-8 text-lg text-muted-foreground max-w-xl mx-auto font-light">
            Open the dashboard, connect a collector, and let the intelligence layer do the rest.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/dashboard" className="group inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
              Enter the dashboard
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link to="/auth" className="inline-flex items-center justify-center rounded-sm border border-border bg-card/40 backdrop-blur px-7 py-3.5 text-sm hover:border-primary/50 transition-colors">
              Create an account
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60">
        <div className="max-w-[1400px] mx-auto px-8 md:px-16 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded-sm border border-primary/40 bg-primary/10 flex items-center justify-center">
              <Radio className="h-3 w-3 text-primary" />
            </div>
            <span className="font-serif text-lg">Signal</span>
            <span className="text-xs text-muted-foreground ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Quiet intelligence · Ranked by AI
          </div>
        </div>
      </footer>
    </div>
  );
}
