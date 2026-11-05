import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/check-posts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { checkPost } = await import("@/lib/tracker.server");
        const { data: posts, error } = await supabaseAdmin
          .from("posts")
          .select("*")
          .eq("status", "active")
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(200);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let ok = 0;
        let failed = 0;
        for (const p of posts ?? []) {
          const r = await checkPost(supabaseAdmin, p);
          if (r.ok) ok++;
          else failed++;
          // free provider allows ~1 req/sec
          await new Promise((res) => setTimeout(res, 1100));
        }
        return Response.json({ checked: ok, failed });
      },
    },
  },
});
