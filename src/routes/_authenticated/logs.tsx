import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/tracker/AppHeader";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compact, addedAgo } from "@/lib/format";

const logsQuery = queryOptions({
  queryKey: ["archived-posts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("posts").select("*").eq("status", "archived").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [
    { title: "Archived logs — ViewPulse" },
    { name: "description", content: "Preserved TikTok post statistics, growth history and milestones." },
    { property: "og:title", content: "Archived logs — ViewPulse" },
    { property: "og:description", content: "Preserved TikTok post statistics, growth history and milestones." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ArchivedLogs,
});

function ArchivedLogs() {
  const { data: posts, isLoading, error } = useQuery(logsQuery);
  return <div className="min-h-screen pb-16">
    <AppHeader back title="Archived logs" />
    <main className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
      {isLoading && <p className="py-8 text-center text-muted-foreground">Loading…</p>}
      {error && <p className="py-8 text-center text-destructive">Could not load archived posts.</p>}
      {posts?.length === 0 && <p className="py-8 text-center text-muted-foreground">No archived posts yet.</p>}
      {posts?.map((post) => <Link key={post.id} to="/posts/$id" params={{ id: post.id }} className="surface-card flex items-center gap-3 p-4">
        {post.thumbnail_url && <img src={post.thumbnail_url} alt="" className="h-20 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{post.nickname || post.caption || "Untitled post"}</h2>
          <p className="silver-text mt-1 text-2xl font-bold">{compact(post.current_views)} <span className="text-xs font-normal text-muted-foreground">views</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Archived · added {addedAgo(post.created_at)}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>)}
    </main>
  </div>;
}