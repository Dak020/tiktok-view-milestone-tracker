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

    // Expand shortlinks (vt.tiktok.com / vm.tiktok.com) to the full @username URL
    let targetUrl = data.url.trim();
    if (/(^|\.)(vt|vm)\.tiktok\.com$/.test(new URL(targetUrl).hostname)) {
      try {
        const headRes = await fetch(targetUrl, { method: "HEAD", redirect: "follow" });
        if (headRes.url && headRes.url.includes("@")) {
          targetUrl = headRes.url;
        }
      } catch {
        // Fall back to original URL if head request fails
      }
    }

    const { data: post, error } = await supabase
      .from("posts")
      .insert({ url: targetUrl, nickname: data.nickname?.trim() || null, user_id: userId })
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
      .eq("status", "active");
    if (error) throw new Error(error.message);
    if (!posts || posts.length === 0) return { checked: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPost } = await import("./tracker.server");

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      if (!p) continue;
      try {
        await checkPost(supabaseAdmin, p);
      } catch (err) {
        console.error(`checkAllPosts error on post ${p.id}:`, err);
      }
      if (i < posts.length - 1) {
        await new Promise((r) => setTimeout(r, 1250));
      }
    }

    return { checked: posts.length };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("user_settings")
      .select("ntfy_topic")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.ntfy_topic) {
      throw new Error("No ntfy topic configured in settings");
    }

    const { sendNtfy } = await import("./tracker.server");
    await sendNtfy(
      settings.ntfy_topic,
      "Test Notification 🎉",
      "ViewPulse is connected and ready to send milestone alerts.",
      "https://tiktok.com"
    );

    await supabase.from("notifications").insert({
      user_id: userId,
      message: "Test notification sent successfully to ntfy.",
    });

    return { success: true };
  });
