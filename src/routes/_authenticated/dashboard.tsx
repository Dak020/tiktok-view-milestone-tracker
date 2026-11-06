import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  Pause,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Calendar,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "@/components/tracker/Icon";
import { AppHeader } from "@/components/tracker/AppHeader";
import { Sparkline } from "@/components/tracker/Sparkline";
import { MilestonePicker } from "@/components/tracker/MilestonePicker";
import { postsQuery } from "@/components/tracker/data";
import { addPost, checkAllPosts } from "@/lib/tracker.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { compact, full, gainedSince, isTikTokUrl, nextMilestone, progressToNext, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Dashboard — ViewPulse" },
      { name: "description", content: "Your tracked TikTok posts, views and milestone progress." },
      { property: "og:title", content: "Dashboard — ViewPulse" },
      { property: "og:description", content: "Your tracked TikTok posts, views and milestone progress." },
    ],
  }),
  component: DashboardPage,
});

type Sort = "newest" | "views" | "closest";

// Extract @username from TikTok URL or fallback to host/path for shortlinks
function extractAccountHandle(url: string): string {
  const match = url.match(/@([a-zA-Z0-9_.-]+)/i);
  if (match && match[1]) {
    return `@${match[1].toLowerCase()}`;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] || url;
  }
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "active") return null;
  const tone = status === "paused" ? "text-muted-foreground" : "text-destructive";
  return <span className={`inner-tile shrink-0 !px-2 !py-0.5 text-[11px] capitalize ${tone}`}>{status}</span>;
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(postsQuery);
  const [sort, setSort] = useState<Sort>("newest");
  const checkAll = useServerFn(checkAllPosts);
  const [checkingAll, setCheckingAll] = useState(false);
  const autoCheckedRef = useRef(false);

  // 1. Supabase Realtime: auto-refresh UI when posts or snapshots change without manual page reload
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "view_snapshots" }, () => {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 2. Client-side fallback check: If any active post hasn't been checked in >= 20 mins, check them automatically
  useEffect(() => {
    if (!data?.posts || autoCheckedRef.current || checkingAll) return;
    const now = Date.now();
    const staleThreshold = 20 * 60 * 1000; // 20 minutes
    const hasStale = data.posts.some((p) => {
      if (p.status !== "active") return false;
      if (!p.last_checked_at) return true;
      return now - new Date(p.last_checked_at).getTime() >= staleThreshold;
    });

    if (hasStale) {
      autoCheckedRef.current = true;
      setCheckingAll(true);
      checkAll()
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["posts"] });
        })
        .catch(() => {})
        .finally(() => setCheckingAll(false));
    }
  }, [data, checkAll, queryClient, checkingAll]);

  // Manual Check All Handler
  async function handleCheckAll() {
    setCheckingAll(true);
    try {
      const res = await checkAll();
      toast.success(`Refreshed ${res.checked} active post${res.checked === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    } catch (err) {
      toast.error((err as Error).message || "Failed to check posts");
    } finally {
      setCheckingAll(false);
    }
  }

  // Calculate cards and aggregate summary metrics (Option C: Today in US ET + 24h + Total Views)
  const { cards, summary } = useMemo(() => {
    if (!data) {
      return {
        cards: [],
        summary: { totalViews: 0, todayGain: 0, h24Gain: 0, activeCount: 0, accountCount: 0 },
      };
    }

    // US Eastern midnight (America/New_York) — 12:00 AM ET = 5:00 AM WAT / UTC+1
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value;
    const h = Number(getPart("hour") ?? 0);
    const min = Number(getPart("minute") ?? 0);
    const s = Number(getPart("second") ?? 0);
    const msSinceMidnight = (h * 3600 + min * 60 + s) * 1000;

    let totalViews = 0;
    let todayGain = 0;
    let h24Gain = 0;
    let activeCount = 0;

    const activePosts = data.posts.filter((p) => p.status === "active");
    const uniqueAccounts = new Set(activePosts.map((p) => extractAccountHandle(p.url)));
    const accountCount = uniqueAccounts.size;

    const list = data.posts.map((p) => {
      const ms = data.milestones.filter((m) => m.post_id === p.id);
      const snaps = data.snapshots.filter((s) => s.post_id === p.id);
      const next = nextMilestone(ms);

      const h1 = gainedSince(p.current_views, snaps, 3600_000);
      const h24 = gainedSince(p.current_views, snaps, 24 * 3600_000);
      const today = gainedSince(p.current_views, snaps, msSinceMidnight);

      if (p.status === "active") {
        activeCount++;
        totalViews += p.current_views;
        todayGain += today ?? 0;
        h24Gain += h24 ?? 0;
      }

      return {
        p,
        ms,
        next,
        progress: progressToNext(p.current_views, ms),
        remaining: next ? next.target_views - p.current_views : Infinity,
        spark: snaps.map((s) => s.views),
        h1,
        h24,
        today,
      };
    });

    if (sort === "views") list.sort((a, b) => b.p.current_views - a.p.current_views);
    if (sort === "closest") list.sort((a, b) => b.progress - a.progress || a.remaining - b.remaining);

    return {
      cards: list,
      summary: { totalViews, todayGain, h24Gain, activeCount, accountCount },
    };
  }, [data, sort]);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        {/* Total Views Summary Card — Placed ABOVE Add Post */}
        <TotalViewsSummary
          summary={summary}
          cards={cards}
          isLoading={isLoading}
          checkingAll={checkingAll}
          onCheckAll={handleCheckAll}
        />

        {/* Add Post Form */}
        <AddPostBox onAdded={() => queryClient.invalidateQueries({ queryKey: ["posts"] })} />

        {/* Posts List Header & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Tracked posts {cards.length > 0 && <span className="text-foreground">({cards.length})</span>}
          </p>
          <div className="flex items-center gap-1 text-xs">
            {(["newest", "views", "closest"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-full px-3 py-1 font-medium transition-all ${
                  sort === s
                    ? "silver-chip shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "newest" ? "Newest" : s === "views" ? "Most views" : "Closest"}
              </button>
            ))}
          </div>
        </div>

        {/* Post Cards */}
        {isLoading && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-[20px] bg-secondary/30" />
            ))}
          </div>
        )}

        {!isLoading && cards.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-border/60 p-8 text-center text-muted-foreground">
            No posts tracked yet. Paste a TikTok link above to get started.
          </div>
        )}

        <div className="space-y-3">
          {cards.map(({ p, next, progress, spark, h1, h24, today }) => {
            const isPaused = p.status === "paused";
            const isFailed = p.status === "failed" || p.status === "unavailable";

            return (
              <Link
                key={p.id}
                to="/posts/$id"
                params={{ id: p.id }}
                className="group block surface-card transition-all hover:border-foreground/25 active:scale-[0.995]"
              >
                <div className="flex items-start gap-3">
                  {p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt=""
                      className="h-16 w-12 flex-shrink-0 rounded-[10px] object-cover ring-1 ring-border/50"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded-[10px] bg-secondary/50 text-muted-foreground">
                      <Sparkles className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-foreground group-hover:text-silver-300">
                        {p.nickname || (p.caption ? p.caption.slice(0, 36) : "Untitled post")}
                      </h3>
                      {isPaused && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Pause className="h-2.5 w-2.5" /> Paused
                        </span>
                      )}
                      {isFailed && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                          <AlertTriangle className="h-2.5 w-2.5" /> Error
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-extrabold tracking-tight silver-text">
                        {compact(p.current_views)}
                      </span>
                      <span className="text-xs text-muted-foreground">views</span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {p.likes !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {compact(p.likes)}
                        </span>
                      )}
                      {p.comments !== null && (
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {compact(p.comments)}
                        </span>
                      )}
                      {p.shares !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Share2 className="h-3 w-3" />
                          {compact(p.shares)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Sparkline values={spark} />
                    <span className="text-[11px] text-muted-foreground">
                      {p.last_checked_at ? timeAgo(p.last_checked_at) : "pending"}
                    </span>
                  </div>
                </div>

                {/* Progress toward next milestone */}
                <div className="mt-3.5 space-y-1.5 border-t border-border/40 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {next ? (
                        <>
                          Next milestone: <b className="text-foreground">{compact(next.target_views)}</b>
                        </>
                      ) : (
                        <span className="text-success font-medium">All milestones hit</span>
                      )}
                    </span>
                    {next && <span className="font-mono text-muted-foreground">{Math.round(progress)}%</span>}
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                  </div>
                </div>

                {/* Growth Velocity Badges */}
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {h1 !== null && (
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-success" />
                        <span className="text-success font-medium">+{compact(h1)}</span> 1h
                      </span>
                    )}
                    {today !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-foreground font-medium">+{compact(today)}</span> today
                      </span>
                    )}
                    {h24 !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground font-medium">+{compact(h24)}</span> 24h
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// Total Views Summary Component (Option C: Today in US ET + Rolling 24h + Total Views)
function TotalViewsSummary({
  summary,
  cards,
  isLoading,
  checkingAll,
  onCheckAll,
}: {
  summary: {
    totalViews: number;
    todayGain: number;
    h24Gain: number;
    activeCount: number;
    accountCount: number;
  };
  cards: any[];
  isLoading: boolean;
  checkingAll: boolean;
  onCheckAll: () => void;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="surface-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="metric-label">Total Tracked Views</span>
          <div className="mt-1 flex items-baseline gap-2">
            <h1 className="font-mono text-4xl leading-none font-extrabold tracking-tight silver-text">
              {isLoading ? "—" : full(summary.totalViews)}
            </h1>
            <span className="text-xs text-muted-foreground">({compact(summary.totalViews)})</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            across {summary.activeCount} active {summary.activeCount === 1 ? "post" : "posts"}
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5 px-3 text-xs"
          onClick={onCheckAll}
          disabled={checkingAll || isLoading || summary.activeCount === 0}
        >
          {checkingAll ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> Check all now
            </>
          )}
        </Button>
      </div>

      {/* Metrics Row: Today's Gain vs Rolling 24h Gain */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {/* Today's Gain (US Eastern Midnight Anchor) */}
        <div className="inner-tile">
          <p className="metric-label flex items-center gap-1.5">
            Today (US)
          </p>
          <p className="mt-1 font-mono text-2xl leading-tight font-bold text-success break-all">
            {isLoading ? "—" : `+${full(summary.todayGain)}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isLoading ? "—" : `+${compact(summary.todayGain)} · resets 12 AM ET / 5 AM local`}
          </p>
        </div>

        {/* Rolling 24 Hours Gain */}
        <div className="inner-tile">
          <p className="metric-label flex items-center gap-1.5">
            Rolling 24h
          </p>
          <p className="mt-1 font-mono text-2xl leading-tight font-bold text-success break-all">
            {isLoading ? "—" : `+${full(summary.h24Gain)}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isLoading ? "—" : `+${compact(summary.h24Gain)} in last 24 hours`}
          </p>
        </div>
      </div>

      {/* Account Tracked Bar (Replacing likes, comments & shares) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {summary.accountCount} {summary.accountCount === 1 ? "account" : "accounts"} tracked
        </span>

        {cards.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showTable ? "Hide post breakdown" : "View post breakdown"}
            {showTable ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Collapsible Breakdown Table */}
      {showTable && cards.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border/40 bg-secondary/20 p-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase text-muted-foreground">
                <th className="pb-1.5 pl-1">Post</th>
                <th className="pb-1.5 text-right">Current</th>
                <th className="pb-1.5 text-right">Today (US)</th>
                <th className="pb-1.5 text-right">24h</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 font-mono">
              {cards.map(({ p, today, h24 }) => (
                <tr key={p.id} className="hover:bg-secondary/40">
                  <td className="py-1.5 pl-1 font-sans font-medium text-foreground truncate max-w-[140px]">
                    {p.nickname || p.caption || "Untitled"}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{compact(p.current_views)}</td>
                  <td className="py-1.5 text-right text-success font-semibold">
                    {today !== null ? `+${compact(today)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {h24 !== null ? `+${compact(h24)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Add Post Box Component
function AddPostBox({ onAdded }: { onAdded: () => void }) {
  const add = useServerFn(addPost);
  const [url, setUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [milestones, setMilestones] = useState<number[]>([10_000, 50_000, 100_000]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUrl = url.trim();

    if (!cleanUrl) {
      toast.error("Please paste a TikTok video link");
      return;
    }
    if (!isTikTokUrl(cleanUrl)) {
      toast.error("That doesn't look like a valid TikTok link (use tiktok.com/...)");
      return;
    }
    if (milestones.length === 0) {
      toast.error("Select at least one milestone to track");
      return;
    }

    setSubmitting(true);
    try {
      await add({
        data: {
          url: cleanUrl,
          nickname: nickname.trim() || undefined,
          milestones,
        },
      });
      toast.success("Post added! Checking initial views...");
      setUrl("");
      setNickname("");
      onAdded();
    } catch (err) {
      toast.error((err as Error).message || "Failed to add post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold tracking-tight text-foreground">Add TikTok post</h2>
        <span className="text-[11px] text-muted-foreground">Auto-checks every 20m</span>
      </div>

      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.tiktok.com/@creator/video/..."
        className="h-12 text-sm"
        disabled={submitting}
      />

      <Input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nickname (optional, e.g. 'Dance Reel')"
        className="h-11 text-sm"
        disabled={submitting}
      />

      <div className="space-y-1.5">
        <label className="metric-label">Milestone targets</label>
        <MilestonePicker value={milestones} onChange={setMilestones} />
      </div>

      <Button type="submit" disabled={submitting} className="w-full text-base font-semibold">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Adding & fetching stats...
          </>
        ) : (
          "Start tracking"
        )}
      </Button>
    </form>
  );
}
