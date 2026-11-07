import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Heart,
  MessageCircle,
  Share2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compact, timeAgo, nextMilestone, progressToNext, gainedSince } from "@/lib/format";
import { Sparkline } from "@/components/tracker/Sparkline";
import { MilestonePicker } from "@/components/tracker/MilestonePicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addPost } from "@/lib/tracker.functions";
import { isTikTokUrl } from "@/lib/format";
import { AppHeader } from "@/components/tracker/AppHeader";
import { checkAllPosts } from "@/lib/tracker.functions";

type PostWithDetails = {
  id: string;
  url: string;
  nickname: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  current_views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  status: "active" | "paused" | "failed" | "unavailable";
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  milestones: { id: string; target_views: number; hit_at: string | null }[];
  view_snapshots: { views: number; checked_at: string }[];
};

const postsQuery = {
  queryKey: ["posts"],
  queryFn: async (): Promise<{ posts: PostWithDetails[] }> => {
    const { data: posts, error } = await supabase
      .from("posts")
      .select("*, milestones(*), view_snapshots(views, checked_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { posts: (posts as unknown as PostWithDetails[]) ?? [] };
  },
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
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
    });
    const parts = formatter.formatToParts(now);
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const year = parts.find((p) => p.type === "year")?.value;

    const nyMidnightStr = `${year}-${month}-${day}T00:00:00`;
    const nyMidnightUtcTime = new Date(
      new Date(nyMidnightStr).toLocaleString("en-US", { timeZone: "America/New_York" })
    ).getTime();
    const offsetMs = new Date(nyMidnightStr).getTime() - nyMidnightUtcTime;
    const startOfTodayMs = new Date(nyMidnightStr).getTime() + offsetMs;

    const activePosts = data.posts.filter((p) => p.status === "active");
    const activeCount = activePosts.length;
    const totalViews = activePosts.reduce((acc, p) => acc + (p.current_views || 0), 0);

    const uniqueAccounts = new Set<string>();
    activePosts.forEach((p) => {
      const handle = extractAccountHandle(p.url);
      uniqueAccounts.add(handle);
    });
    const accountCount = uniqueAccounts.size;

    let todayGain = 0;
    let h24Gain = 0;

    activePosts.forEach((p) => {
      const snaps = p.view_snapshots ?? [];
      todayGain += gainedSince(p.current_views, snaps, Date.now() - startOfTodayMs) ?? 0;
      h24Gain += gainedSince(p.current_views, snaps, 24 * 60 * 60 * 1000) ?? 0;
    });

    const list = data.posts.map((p) => {
      const next = nextMilestone(p.milestones ?? []);
      const progress = progressToNext(p.current_views, p.milestones ?? []);
      const snaps = (p.view_snapshots ?? []).slice().sort(
        (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );
      const spark = snaps.map((s) => s.views);
      const h1 = gainedSince(p.current_views, snaps, 60 * 60 * 1000) ?? 0;
      const h24 = gainedSince(p.current_views, snaps, 24 * 60 * 60 * 1000) ?? 0;
      const today = gainedSince(p.current_views, snaps, Date.now() - startOfTodayMs) ?? 0;
      return {
        p,
        next,
        progress,
        remaining: next ? Math.max(0, next.target_views - p.current_views) : 0,
        spark,
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
        {/* Total Views Summary Card */}
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
            const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));

            return (
              <Link
                key={p.id}
                to="/posts/$id"
                params={{ id: p.id }}
                className={`surface-card group block p-4 transition-all hover:border-foreground/30 active:scale-[0.99] ${
                  isPaused ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt=""
                      className="h-20 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="inner-tile flex h-20 w-16 shrink-0 items-center justify-center text-xs text-muted-foreground">
                      No img
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-foreground group-hover:text-primary">
                          {p.nickname || p.caption || "Untitled post"}
                        </h2>
                        {p.nickname && p.caption && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{p.caption}</p>
                        )}
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="silver-text text-2xl font-bold tracking-tight">
                        {compact(p.current_views)}
                      </span>
                      <span className="text-xs text-muted-foreground">views</span>

                      {(h1 > 0 || h24 > 0) && (
                        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-emerald-400">
                          <TrendingUp className="h-3 w-3" />
                          {h1 > 0 ? `+${compact(h1)}/h` : `+${compact(h24)}/24h`}
                        </span>
                      )}
                    </div>

                    {/* Milestone Progress Bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {next ? (
                            <>
                              Next: <strong className="text-foreground">{compact(next.target_views)}</strong>
                            </>
                          ) : (
                            <span className="text-emerald-400 font-medium">All milestones hit</span>
                          )}
                        </span>
                        {next && <span>{pct}%</span>}
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full progress-track">
                        <div
                          className="h-full rounded-full progress-fill transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Stats Row */}
                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {p.likes != null && (
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {compact(p.likes)}
                      </span>
                    )}
                    {p.comments != null && (
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {compact(p.comments)}
                      </span>
                    )}
                    {p.shares != null && (
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" /> {compact(p.shares)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {spark.length > 1 && (
                      <div className="w-16">
                        <Sparkline values={spark} />
                      </div>
                    )}
                    <span className="text-[11px]">
                      {p.last_checked_at ? timeAgo(p.last_checked_at) : "pending check"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {isFailed && p.last_error && (
                  <p className="mt-2 text-xs text-destructive truncate">
                    Last check failed: {p.last_error}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// Summary Card Component
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
  cards: Array<{
    p: PostWithDetails;
    today: number;
    h24: number;
  }>;
  isLoading: boolean;
  checkingAll: boolean;
  onCheckAll: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="surface-card p-5 relative overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="metric-label">Overview</span>
        <button
          onClick={onCheckAll}
          disabled={checkingAll || isLoading}
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium silver-chip transition-all hover:opacity-90 disabled:opacity-50"
          title="Check all active posts right now"
        >
          <RefreshCw className={`h-3 w-3 ${checkingAll ? "animate-spin text-foreground" : ""}`} />
          <span>{checkingAll ? "Checking..." : "Check all now"}</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        {/* Total Tracked Views */}
        <div className="inner-tile p-3.5">
          <p className="metric-label">Total Views</p>
          <p className="silver-text text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
            {isLoading ? "—" : compact(summary.totalViews)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            across {summary.activeCount} active post{summary.activeCount === 1 ? "" : "s"}
          </p>
        </div>

        {/* Views Gained Today */}
        <div className="inner-tile p-3.5">
          <p className="metric-label">Gained Today (ET)</p>
          <p className="silver-text text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 text-emerald-400">
            {isLoading ? "—" : `+${compact(summary.todayGain)}`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Past 24h: <span className="text-foreground font-medium">+{compact(summary.h24Gain)}</span>
          </p>
        </div>
      </div>

      {/* Accounts Tracked Banner */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/30 pt-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>
            <strong className="text-foreground">{summary.accountCount}</strong> account
            {summary.accountCount === 1 ? "" : "s"} tracked
          </span>
        </div>

        {cards.length > 0 && (
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="text-[11px] hover:text-foreground underline decoration-dotted transition-colors"
          >
            {showBreakdown ? "Hide post breakdown" : "View post breakdown"}
          </button>
        )}
      </div>

      {/* Collapsible Per-Post Breakdown */}
      {showBreakdown && cards.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/30 pt-3 text-xs">
          {cards.map(({ p, today, h24 }) => (
            <div key={p.id} className="flex items-center justify-between py-1 text-muted-foreground">
              <span className="truncate max-w-[180px] sm:max-w-[240px] text-foreground font-medium">
                {p.nickname || p.caption || "Untitled"}
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-emerald-400">+{compact(today)} today</span>
                <span className="text-muted-foreground">({compact(h24)} / 24h)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddPostBox({ onAdded }: { onAdded: () => void }) {
  const add = useServerFn(addPost);
  const [url, setUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [milestones, setMilestones] = useState<number[]>([100_000]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isTikTokUrl(url)) {
      toast.error("Paste a valid TikTok link");
      return;
    }
    if (milestones.length === 0) {
      toast.error("Pick at least one milestone");
      return;
    }
    setBusy(true);
    try {
      const res = await add({ data: { url: url.trim(), nickname: nickname.trim() || undefined, milestones } });
      if (res.result && !res.result.ok) toast.warning(`Added, but the first check failed: ${res.result.error}`);
      else toast.success("Post added");
      setUrl("");
      setNickname("");
      onAdded();
    } catch (err) {
      toast.error((err as Error).message || "Could not add post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="surface-card space-y-3 p-5">
      <span className="metric-label">Add post</span>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste TikTok link" className="h-11 text-base" />
      <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname (optional)" maxLength={60} className="h-11 text-base" />
      <MilestonePicker value={milestones} onChange={setMilestones} />
      <Button type="submit" disabled={busy} className="h-11 w-full">
        {busy ? "Adding..." : "Start tracking"}
      </Button>
    </form>
  );
}
