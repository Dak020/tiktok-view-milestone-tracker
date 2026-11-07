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
        const postList = posts ?? [];

        for (let i = 0; i < postList.length; i++) {
          const p = postList[i];
          if (!p) continue;

          try {
            const r = await checkPost(supabaseAdmin, p);
            if (r.ok) ok++;
            else failed++;
          } catch (err) {
            console.error(`Cron error on post ${p.id}:`, err);
            failed++;
          }

          // 10-second interval between each post check to prevent burst rate limits
          if (i < postList.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        }

        return Response.json({ checked: ok, failed });
      },
    },
  },
});
