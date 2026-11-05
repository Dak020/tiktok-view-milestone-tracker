// Server-only tracking logic shared by the scheduled job and "check now".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { newlyHit, full } from "./format";

type Admin = SupabaseClient<Database>;

export type TikTokStats = {
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  caption: string | null;
  thumbnail: string | null;
};

export class ScrapeError extends Error {
  constructor(message: string, public permanent: boolean) {
    super(message);
  }
}

/**
 * The ONLY place that talks to the scraper provider. Swap providers here.
 * With TIKTOK_SCRAPER_API_KEY set, uses RapidAPI "TikTok Scraper" (tiktok-scraper7);
 * without it, falls back to the free tikwm endpoint (same response shape, rate-limited).
 */
export async function fetchTikTokStats(url: string): Promise<TikTokStats> {
  const key = process.env["TIKTOK_SCRAPER_API_KEY"];
  const endpoint = key
    ? `https://tiktok-scraper7.p.rapidapi.com/?hd=0&url=${encodeURIComponent(url)}`
    : `https://www.tikwm.com/api/?hd=0&url=${encodeURIComponent(url)}`;
  const headers: Record<string, string> = key
    ? { "x-rapidapi-key": key, "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com" }
    : {};

  let res: Response;
  try {
    res = await fetch(endpoint, { headers });
  } catch (e) {
    throw new ScrapeError(`Network error: ${(e as Error).message}`, false);
  }
  if (res.status === 401 || res.status === 403) throw new ScrapeError(`Scraper rejected key (${res.status})`, false);
  if (!res.ok) throw new ScrapeError(`Scraper HTTP ${res.status}`, false);

  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: Record<string, unknown>;
  } | null;
  if (!json || json.code !== 0 || !json.data) {
    const msg = json?.msg ?? "Unknown scraper response";
    const permanent = /private|not exist|deleted|removed|unavailable|invalid url|parsing/i.test(msg);
    throw new ScrapeError(msg, permanent);
  }
  const d = json.data;
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const views = num(d.play_count);
  if (views == null) throw new ScrapeError("No view count in response", false);
  return {
    views,
    likes: num(d.digg_count),
    comments: num(d.comment_count),
    shares: num(d.share_count),
    caption: (d.title as string) || null,
    thumbnail: (d.cover as string) || (d.origin_cover as string) || null,
  };
}

export async function sendNtfy(topic: string, title: string, message: string, clickUrl?: string) {
  const headers: Record<string, string> = { Title: encodeHeader(title), Tags: "tada" };
  if (clickUrl) headers["Click"] = clickUrl;
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    headers,
    body: message,
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}: ${await res.text()}`);
}

// HTTP headers must be latin-1; ntfy accepts RFC 2047 encoded-words for emoji.
function encodeHeader(v: string) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

const MAX_TRANSIENT_FAILURES = 6;
const MAX_PERMANENT_FAILURES = 3;

type Post = Database["public"]["Tables"]["posts"]["Row"];

export async function checkPost(admin: Admin, post: Post) {
  const now = new Date().toISOString();
  let stats: TikTokStats;
  try {
    stats = await fetchTikTokStats(post.url);
  } catch (e) {
    const err = e instanceof ScrapeError ? e : new ScrapeError(String(e), false);
    const failures = post.failure_count + 1;
    const limit = err.permanent ? MAX_PERMANENT_FAILURES : MAX_TRANSIENT_FAILURES;
    const status = failures >= limit ? (err.permanent ? "unavailable" : "failed") : post.status;
    await admin
      .from("posts")
      .update({ failure_count: failures, last_error: err.message, last_checked_at: now, status })
      .eq("id", post.id);
    if (status !== post.status) {
      await admin.from("notifications").insert({
        user_id: post.user_id,
        post_id: post.id,
        message: `Stopped tracking ${post.nickname || "a post"}: ${err.message}`,
      });
    }
    return { ok: false as const, error: err.message };
  }

  await admin.from("view_snapshots").insert({
    post_id: post.id,
    user_id: post.user_id,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    shares: stats.shares,
    checked_at: now,
  });
  await admin
    .from("posts")
    .update({
      current_views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      caption: stats.caption ?? post.caption,
      thumbnail_url: stats.thumbnail ?? post.thumbnail_url,
      failure_count: 0,
      last_error: null,
      last_checked_at: now,
    })
    .eq("id", post.id);

  const { data: ms } = await admin.from("milestones").select("*").eq("post_id", post.id);
  const hits = newlyHit(stats.views, ms ?? []);
  if (hits.length === 0) return { ok: true as const, views: stats.views, hits: 0 };

  const { data: settings } = await admin
    .from("user_settings")
    .select("ntfy_topic")
    .eq("user_id", post.user_id)
    .maybeSingle();
  const topic = settings?.ntfy_topic || process.env["NTFY_TOPIC"];
  const name = post.nickname || stats.caption?.slice(0, 40) || "post";

  for (const m of hits.sort((a, b) => a.target_views - b.target_views)) {
    // Claim the milestone atomically so it only ever fires once.
    const { data: claimed } = await admin
      .from("milestones")
      .update({ hit_at: now })
      .eq("id", m.id)
      .is("hit_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const message = `Your post ${name} just passed ${compactLabel(m.target_views)} views (${full(stats.views)} now)`;
    await admin.from("notifications").insert({ user_id: post.user_id, post_id: post.id, message });
    let notified = false;
    if (topic) {
      try {
        await sendNtfy(topic, "Milestone hit 🎉", message, post.url);
        notified = true;
      } catch (e) {
        console.error("ntfy failed", e);
      }
    }
    await admin.from("milestones").update({ notified }).eq("id", m.id);
  }
  return { ok: true as const, views: stats.views, hits: hits.length };
}

function compactLabel(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}
