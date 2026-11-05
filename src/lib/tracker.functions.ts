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
 * Strategy 1: Dedicated RapidAPI (if TIKTOK_SCRAPER_API_KEY is configured)
 */
async function fetchViaRapidApi(url: string, key: string): Promise<TikTokStats> {
  const res = await fetch(`https://tiktok-scraper7.p.rapidapi.com/?hd=0&url=${encodeURIComponent(url)}`, {
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com",
    },
  });
  if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}`);
  const json = await res.json();
  if (!json || json.code !== 0 || !json.data) {
    throw new Error(json?.msg ?? "Invalid RapidAPI response");
  }
  const d = json.data;
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const views = num(d["play_count"]);
  if (views == null) throw new Error("No play_count in RapidAPI payload");

  return {
    views,
    likes: num(d["digg_count"]),
    comments: num(d["comment_count"]),
    shares: num(d["share_count"]),
    caption: (d["title"] as string) || null,
    thumbnail: (d["cover"] as string) || (d["origin_cover"] as string) || null,
  };
}

/**
 * Strategy 2: Direct public TikTok page parsing (No third-party scraper needed)
 */
async function fetchViaDirectTikTok(url: string): Promise<TikTokStats> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`TikTok direct fetch HTTP ${res.status}`);
  const html = await res.text();

  // TikTok embeds initial page state in JSON scripts
  const scriptRegex = /<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"\s+type="application\/json">(.*?)<\/script>/s;
  const match = html.match(scriptRegex);
  if (!match || !match[1]) {
    throw new Error("Unable to locate TikTok rehydration payload");
  }

  const json = JSON.parse(match[1]);
  const defaultScope = json?.["__DEFAULT_SCOPE__"];
  const itemInfo =
    defaultScope?.["webapp.video-detail"]?.itemInfo?.itemStruct ??
    defaultScope?.["seo.app"]?.metaParams?.itemInfo?.itemStruct;

  if (!itemInfo) {
    throw new Error("Video itemStruct missing from TikTok page");
  }

  const stats = itemInfo.stats || itemInfo.statsV2 || {};
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const views = num(stats.playCount);
  if (views == null) throw new Error("playCount missing from direct TikTok stats");

  return {
    views,
    likes: num(stats.diggCount),
    comments: num(stats.commentCount),
    shares: num(stats.shareCount),
    caption: itemInfo.desc || null,
    thumbnail: itemInfo.video?.cover || itemInfo.video?.originCover || null,
  };
}

/**
 * Strategy 3: TikWM public API
 */
async function fetchViaTikWm(url: string): Promise<TikTokStats> {
  const res = await fetch(`https://www.tikwm.com/api/?hd=0&url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`TikWM HTTP ${res.status}`);
  const json = await res.json();
  if (!json || json.code !== 0 || !json.data) {
    throw new Error(json?.msg ?? "TikWM error");
  }
  const d = json.data;
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
  const views = num(d["play_count"]);
  if (views == null) throw new Error("No play_count in TikWM payload");

  return {
    views,
    likes: num(d["digg_count"]),
    comments: num(d["comment_count"]),
    shares: num(d["share_count"]),
    caption: (d["title"] as string) || null,
    thumbnail: (d["cover"] as string) || (d["origin_cover"] as string) || null,
  };
}

/**
 * Multi-provider pipeline: tries configured key, direct page fetch, and TikWM
 */
export async function fetchTikTokStats(url: string): Promise<TikTokStats> {
  const key = process.env["TIKTOK_SCRAPER_API_KEY"];
  const errors: string[] = [];

  // 1. Try RapidAPI if a key exists
  if (key) {
    try {
      return await fetchViaRapidApi(url, key);
    } catch (err) {
      errors.push(`RapidAPI: ${(err as Error).message}`);
    }
  }

  // 2. Try direct TikTok public page extraction
  try {
    return await fetchViaDirectTikTok(url);
  } catch (err) {
    errors.push(`Direct TikTok: ${(err as Error).message}`);
  }

  // 3. Try TikWM
  try {
    return await fetchViaTikWm(url);
  } catch (err) {
    errors.push(`TikWM: ${(err as Error).message}`);
  }

  const combined = errors.join(" | ");
  const isPermanent = /private|not exist|deleted|removed|unavailable|invalid url/i.test(combined);
  throw new ScrapeError(`All scraper providers failed: ${combined}`, isPermanent);
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
