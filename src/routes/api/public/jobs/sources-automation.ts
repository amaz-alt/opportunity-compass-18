import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/sources-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSourceAutomation, SOURCE_PLATFORMS, isSourcePlatform } = await import("@/lib/sources.server");

        let requested: string[] = [...SOURCE_PLATFORMS];
        try {
          const body = (await request.json()) as { platforms?: string[] };
          if (Array.isArray(body?.platforms) && body.platforms.length) requested = body.platforms;
        } catch {
          // no body: run all
        }

        const results: Record<string, unknown> = {};
        for (const platform of requested) {
          if (!isSourcePlatform(platform)) continue;
          try {
            results[platform] = await runSourceAutomation(supabaseAdmin, platform, "scheduled");
          } catch (e) {
            results[platform] = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
