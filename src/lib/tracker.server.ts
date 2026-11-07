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
  constructor(
    message: string,
    public permanent: boolean,
    // Temporary provider problem (daily limit, throttling, timeouts, 5xx).
    // These must never count toward stopping a post.
    public rateLimited: boolean = false,
  ) {
    super(message);
  }
}

/**
 * Strategy 1: Dedicated RapidAPI (if TIKTOK_SCRAPER_API_KEY is configured)
 */
async function fetchViaRapidApi(url: string, rawKey: string): Promise<TikTokStats> {
  const key = rawKey.trim().replace(/\.+$/, "");
  const cleanUrl = url.trim().split("?")[0] ?? url.trim();
  const res = await fetch(`https://tiktok-scraper7.p.rapidapi.com/?hd=0&url=${encodeURIComponent(cleanUrl)}`, {
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
 * Strategy 2: TikWM public API with automatic 1.25s backoff on 1-req/sec rate limits
 */
async function fetchViaTikWm(url: string): Promise<TikTokStats> {
  const cleanUrl = url.trim().split("?")[0] ?? url.trim();
  const hosts = ["https://www.tikwm.com", "https://tikwm.com"];
  let lastError = "TikWM error";

  for (let attempt = 1; attempt <= 3; attempt++) {
    const host = hosts[(attempt - 1) % hosts.length];
    try {
      const res = await fetch(`${host}/api/?hd=0&url=${encodeURIComponent(cleanUrl)}`);
      if (!res.ok) throw new Error(`TikWM HTTP ${res.status}`);
      const json = await res.json();

      if (json && json.code === 0 && json.data) {
        const d = json.data;
        const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v) || null);
        const views = num(d["play_count"]);
        if (views != null) {
          return {
            views,
            likes: num(d["digg_count"]),
            comments: num(d["comment_count"]),
            shares: num(d["share_count"]),
            caption: (d["title"] as string) || null,
            thumbnail: (d["cover"] as string) || (d["origin_cover"] as string) || null,
          };
        }
      }

      lastError = json?.msg || "Invalid response";
      if (typeof lastError === "string" && lastError.includes("1 request/second")) {
        await new Promise((r) => setTimeout(r, 1250));
        continue;
      }
      break;
    } catch (e) {
      lastError = (e as Error).message;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error(`TikWM: ${lastError}`);
}

/**
 * Multi-provider pipeline: RapidAPI primary -> TikWM fallback
 */
export async function fetchTikTokStats(url: string): Promise<TikTokStats> {
  const rawKey = process.env["TIKTOK_SCRAPER_API_KEY"];
  const key = rawKey ? rawKey.trim().replace(/\.+$/, "") : undefined;
  const errors: string[] = [];

  if (key) {
    try {
      return await fetchViaRapidApi(url, key);
    } catch (err) {
      errors.push(`RapidAPI: ${(err as Error).message}`);
    }
  }

  try {
    return await fetchViaTikWm(url);
  } catch (err) {
    errors.push((err as Error).message);
  }

  const combined = errors.join(" | ");
  const isPermanent = /private|not exist|deleted|removed|unavailable|invalid url/i.test(combined);
  const isRateLimited =
    !isPermanent &&
    /limit|429|too many|1 request\/second|timeout|timed out|fetch failed|HTTP 5\d\d/i.test(combined);
  throw new ScrapeError(`Scraper failed: ${combined}`, isPermanent, isRateLimited);
}

export async function sendNtfy(
  topic: string,
  title: string,
  message: string,
  clickUrl?: string,
  tags = "tada",
) {
  const headers: Record<string, string> = { Title: encodeHeader(title), Tags: tags };
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

const MAX_TRANSIENT_FAILURES = 48;
const DELAY_ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const MAX_PERMANENT_FAILURES = 3;

type Post = Database["public"]["Tables"]["posts"]["Row"];

export async function checkPost(admin: Admin, post: Post) {
  const now = new Date().toISOString();
  let stats: TikTokStats;
  try {
    stats = await fetchTikTokStats(post.url);
  } catch (e) {
    const err = e instanceof ScrapeError ? e : new ScrapeError(String(e), false);

    if (err.rateLimited) {
      // Provider is throttling us. Keep the post active and simply retry next cycle
      await admin
        .from("posts")
        .update({ last_error: err.message, last_checked_at: now })
        .eq("id", post.id);
      await alertChecksDelayed(admin, post);
      return { ok: false as const, error: err.message };
    }

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

async function alertChecksDelayed(admin: Admin, post: Post) {
  const since = new Date(Date.now() - DELAY_ALERT_COOLDOWN_MS).toISOString();
  const { data: recent } = await admin
    .from("notifications")
    .select("id")
    .eq("post_id", post.id)
    .like("message", "Checks delayed%")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return;

  const name = post.nickname || "a post";
  const message = `Checks delayed for ${name}: the data provider is rate limiting. Still tracking, will retry automatically.`;
  await admin.from("notifications").insert({ user_id: post.user_id, post_id: post.id, message });

  const { data: settings } = await admin
    .from("user_settings")
    .select("ntfy_topic")
    .eq("user_id", post.user_id)
    .maybeSingle();
  const topic = settings?.ntfy_topic || process.env["NTFY_TOPIC"];
  if (!topic) return;
  try {
    await sendNtfy(topic, "Checks delayed", message, undefined, "warning");
  } catch (e) {
    console.error("ntfy failed", e);
  }
}

function compactLabel(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}
