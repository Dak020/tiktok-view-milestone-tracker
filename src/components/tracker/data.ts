import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const postsQuery = queryOptions({
  queryKey: ["posts"],
  refetchInterval: 60_000,
  queryFn: async () => {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const [posts, ms, snaps] = await Promise.all([
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
      supabase.from("milestones").select("*"),
      supabase
        .from("view_snapshots")
        .select("post_id, views, checked_at")
        .gte("checked_at", since)
        .order("checked_at", { ascending: true })
        .limit(5000),
    ]);
    if (posts.error) throw posts.error;
    return { posts: posts.data, milestones: ms.data ?? [], snapshots: snaps.data ?? [] };
  },
});

export const postQuery = (id: string) =>
  queryOptions({
    queryKey: ["post", id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [post, ms, snaps] = await Promise.all([
        supabase.from("posts").select("*").eq("id", id).single(),
        supabase.from("milestones").select("*").eq("post_id", id).order("target_views"),
        supabase.from("view_snapshots").select("*").eq("post_id", id).order("checked_at").limit(5000),
      ]);
      if (post.error) throw post.error;
      return { post: post.data, milestones: ms.data ?? [], snapshots: snaps.data ?? [] };
    },
  });

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  refetchInterval: 60_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },
});
