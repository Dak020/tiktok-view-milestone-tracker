import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Runs every minute but checks at most ONE due post per run, so scraper calls are
// always spaced well apart (no bursts). A post is due once 20 min have passed.
const DUE_AFTER_MS = 20 * 60 * 1000;

export const Route = createFileRoute("/api/public/jobs/check-posts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { checkPost } = await import("@/lib/tracker.server");
        const cutoff = new Date(Date.now() - DUE_AFTER_MS).toISOString();
        const { data: posts, error } = await supabaseAdmin
          .from("posts")
          .select("*")
          .eq("status", "active")
          .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(1);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const p = posts?.[0];
        if (!p) return Response.json({ checked: 0, skipped: "nothing due" });
        const r = await checkPost(supabaseAdmin, p);
        return Response.json({ checked: r.ok ? 1 : 0, failed: r.ok ? 0 : 1 });
      },
    },
  },
});
