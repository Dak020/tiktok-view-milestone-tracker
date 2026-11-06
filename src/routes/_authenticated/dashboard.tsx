import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Eye,
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
  component: Dashboard,
});

type Sort = "newest" | "views" | "closest";

function Dashboard() {
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

  // Calculate cards and aggregate summary metrics (Option C: Today + 24h + Total Views)
  const { cards, summary } = useMemo(() => {
    if (!data) {
      return {
        cards: [],
        summary: { totalViews: 0, todayGain: 0, h24Gain: 0, totalLikes: 0, totalComments: 0, totalShares: 0, activeCount: 0 },
      };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const msSinceMidnight = Date.now() - startOfToday.getTime();

    let totalViews = 0;
    let todayGain = 0;
    let h24Gain = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let activeCount = 0;

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
        totalLikes += p.likes ?? 0;
        totalComments += p.comments ?? 0;
        totalShares += p.shares ?? 0;
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
      summary: { totalViews, todayGain, h24Gain, totalLikes, totalComments, totalShares, activeCount },
    };
  }, [data, sort]);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {/* TOTAL VIEWS SUMMARY TABLE (PLACED ABOVE ADD POST) */}
        <TotalViewsSummary
          summary={summary}
          cards={cards}
          isLoading={isLoading}
          checkingAll={checkingAll}
          onCheckAll={handleCheckAll}
        />

        {/* ADD POST BOX */}
        <AddPostBox />

        {/* TRACKED POSTS LIST */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold sm:text-lg">Tracked posts</h2>
            <div className="flex shrink-0 rounded-full border bg-muted p-1 text-sm">
              {(["newest", "views", "closest"] as Sort[]).map((s) => (
                <Button
                  variant="ghost"
                  key={s}
                  onClick={() => setSort(s)}
                  className={`h-10 rounded-full px-2.5 text-xs font-semibold transition ${
                    sort === s ? "silver-chip text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "newest" ? "Newest" : s === "views" ? "Views" : "Closest"}
                </Button>
              ))}
            </div>
          </div>

          {isLoading && <p className="py-10 text-center text-muted-foreground">Loading…</p>}

          {!isLoading && cards.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              Paste a TikTok link above to start tracking.
            </p>
          )}

          <ul className="space-y-3">
            {cards.map(({ p, next, progress, spark, h1, h24 }) => (
              <li key={p.id}>
                <Link
                  to="/posts/$id"
                  params={{ id: p.id }}
                  className="block surface-card transition active:scale-[0.99] hover:border-primary/40"
                >
                  <div className="flex gap-3">
                    <div className="grid h-[100px] w-[74px] shrink-0 place-items-center overflow-hidden rounded-[14px] border bg-secondary">
                      {!p.thumbnail_url && <Sparkles className="h-6 w-6 text-muted-foreground" />}
                      {p.thumbnail_url && (
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold">{p.nickname || p.caption || "Untitled post"}</p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-3xl font-bold silver-text">
                        <Eye className="h-5 w-5 text-muted-foreground" />
                        {full(p.current_views)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" />
                          {compact(p.likes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {compact(p.comments)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3.5 w-3.5" />
                          {compact(p.shares)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {next ? (
                          <>
                            Next: <b className="font-mono text-foreground">{compact(next.target_views)}</b>
                          </>
                        ) : (
                          "All milestones hit 🎉"
                        )}
                      </span>
                      <span className="font-mono">{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full progress-track">
                      <div className="h-full rounded-full progress-fill transition-all" style={{ width: `${progress * 100}%` }} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <Sparkline values={spark} className="flex-1" />
                    <div className="shrink-0 text-right text-xs">
                      <p className="flex items-center justify-end gap-1 font-mono text-success font-medium">
                        <TrendingUp className="h-3.5 w-3.5" />+{compact(h1 ?? 0)}/h · +{compact(h24 ?? 0)}/24h
                      </p>
                      <p className="text-muted-foreground">checked {timeAgo(p.last_checked_at)}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

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
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    activeCount: number;
  };
  cards: Array<{
    p: { id: string; nickname: string | null; caption: string | null; current_views: number };
    today: number | null;
    h24: number | null;
  }>;
  isLoading: boolean;
  checkingAll: boolean;
  onCheckAll: () => void;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="surface-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          
          <h2 className="metric-label">Total Views Overview</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCheckAll}
          disabled={checkingAll || isLoading}
          className="h-10 gap-1.5 rounded-full px-3 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checkingAll ? "animate-spin text-primary" : ""}`} />
          {checkingAll ? "Checking all…" : "Check all"}
        </Button>
      </div>

      {/* Primary KPI Grid (Option C: Total Views, Today, Past 24h) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Views */}
        <div className="col-span-2 pb-1">
          <p className="mt-1 font-mono text-[44px] leading-tight font-extrabold silver-text">
            {isLoading ? "—" : full(summary.totalViews)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Across {summary.activeCount} active post{summary.activeCount === 1 ? "" : "s"}
          </p>
        </div>

        {/* Today's Gain (Since Midnight) */}
        <div className="inner-tile">
          <p className="metric-label flex items-center gap-1.5">
            
            Today
          </p>
          <p className="mt-1 font-mono text-2xl leading-tight font-bold text-success break-all">
            {isLoading ? "—" : `+${full(summary.todayGain)}`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isLoading ? "—" : `+${compact(summary.todayGain)} views since midnight`}
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

      {/* Aggregate Engagements */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5 text-muted-foreground" />
            <b>{compact(summary.totalLikes)}</b> likes
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <b>{compact(summary.totalComments)}</b> comments
          </span>
          <span className="flex items-center gap-1">
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
            <b>{compact(summary.totalShares)}</b> shares
          </span>
        </div>

        {cards.length > 0 && (
          <Button variant="link"
            onClick={() => setShowTable(!showTable)}
            className="h-11 px-0 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showTable ? "Hide breakdown table" : "Show per-post table"}
            {showTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {/* Per-Post Breakdown Table Drawer */}
      {showTable && cards.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border bg-background/50">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 font-semibold text-muted-foreground">
              <tr>
                <th className="p-2.5">Post</th>
                <th className="p-2.5 text-right">Total Views</th>
                <th className="p-2.5 text-right">Today</th>
                <th className="p-2.5 text-right">24h Gain</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono">
              {cards.map(({ p, today, h24 }) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="p-2.5 font-sans font-medium">
                    <Link to="/posts/$id" params={{ id: p.id }} className="truncate hover:underline">
                      {p.nickname || p.caption || "Untitled"}
                    </Link>
                  </td>
                  <td className="p-2.5 text-right font-bold">{full(p.current_views)}</td>
                  <td className="p-2.5 text-right text-success">+{compact(today ?? 0)}</td>
                  <td className="p-2.5 text-right text-success">+{compact(h24 ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "active") return null;
  const paused = status === "paused";
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        paused ? "bg-muted text-muted-foreground" : "bg-destructive/20 text-destructive"
      }`}
    >
      {paused ? <Pause className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {paused ? "Paused" : status === "unavailable" ? "Unavailable" : "Failing"}
    </span>
  );
}

function AddPostBox() {
  const qc = useQueryClient();
  const add = useServerFn(addPost);
  const [url, setUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [milestones, setMilestones] = useState<number[]>([100_000]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isTikTokUrl(url)) {
      toast.error("That doesn't look like a TikTok link");
      return;
    }
    if (milestones.length === 0) {
      toast.error("Pick at least one milestone");
      return;
    }
    setBusy(true);
    try {
      const r = await add({ data: { url: url.trim(), nickname: nickname || undefined, milestones } });
      if (r.result.ok) toast.success(`Tracking! ${full(r.result.views)} views right now.`);
      else toast.warning(`Added, but the first check failed: ${r.result.error}`);
      setUrl("");
      setNickname("");
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 surface-card shadow-sm">
      <h2 className="text-lg font-bold">Add post</h2>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste TikTok link"
        inputMode="url"
        className="h-12 text-base"
      />
      <Input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nickname (optional)"
        maxLength={60}
        className="h-12 text-base"
      />
      <div>
        <p className="mb-2 metric-label">Alert me at</p>
        <MilestonePicker value={milestones} onChange={setMilestones} />
      </div>
      <Button type="submit" disabled={busy} className="h-[52px] w-full text-[15px] font-bold">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Checking post…
          </>
        ) : (
          "Start tracking"
        )}
      </Button>
    </form>
  );
}
