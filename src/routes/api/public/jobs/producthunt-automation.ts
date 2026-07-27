import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/producthunt-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        if (apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runProductHuntAutomation } = await import("@/lib/producthunt.server");

        const result = await runProductHuntAutomation(supabaseAdmin, process.env.PRODUCT_HUNT_TOKEN, "scheduled");
        return Response.json(result);
      },
    },
  },
});
