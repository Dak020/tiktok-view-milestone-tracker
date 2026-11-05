import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const addSchema = z.object({
  url: z.string().url().max(500).refine((u) => /(^|\.)tiktok\.com$/.test(new URL(u).hostname), "Not a TikTok link"),
  nickname: z.string().max(60).optional(),
  milestones: z.array(z.number().int().positive()).min(1).max(20),
});

export const addPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof addSchema>) => addSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: post, error } = await supabase
      .from("posts")
      .insert({ url: data.url.trim(), nickname: data.nickname?.trim() || null, user_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const uniq = [...new Set(data.milestones)];
    const { error: mErr } = await supabase
      .from("milestones")
      .insert(uniq.map((t) => ({ post_id: post.id, target_views: t, user_id: userId })));
    if (mErr) throw new Error(mErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPost } = await import("./tracker.server");
    const result = await checkPost(supabaseAdmin, post);
    return { id: post.id, result };
  });

export const checkNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: post, error } = await context.supabase.from("posts").select("*").eq("id", data.id).single();
    if (error || !post) throw new Error("Post not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPost } = await import("./tracker.server");
    return checkPost(supabaseAdmin, post);
  });

export const checkAllPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: posts, error } = await context.supabase
      .from("posts")
      .select("*")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPost } = await import("./tracker.server");
    
    let checked = 0;
    for (const p of posts ?? []) {
      await checkPost(supabaseAdmin, p);
      checked++;
    }
    return { ok: true, checked };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_settings")
      .select("ntfy_topic")
      .eq("user_id", context.userId)
      .maybeSingle();
    const topic = data?.ntfy_topic || process.env["NTFY_TOPIC"];
    if (!topic) throw new Error("Set your ntfy topic first");
    const { sendNtfy } = await import("./tracker.server");
    await sendNtfy(topic, "Milestone hit 🎉", "Test: your notifications are working!");
    return { ok: true };
  });
