import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, Heart, MessageCircle, Share2, TrendingUp, Pause, AlertTriangle, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/tracker/AppHeader";
import { Sparkline } from "@/components/tracker/Sparkline";
import { MilestonePicker } from "@/components/tracker/MilestonePicker";
import { postsQuery } from "@/components/tracker/data";
import { addPost } from "@/lib/tracker.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { compact, full, gainedSince, isTikTokUrl, nextMilestone, progressToNext, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
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
  const { data, isLoading } = useQuery(postsQuery);
  const [sort, setSort] = useState<Sort>("newest");

  const cards = useMemo(() => {
    if (!data) return [];
    const list = data.posts.map((p) => {
      const ms = data.milestones.filter((m) => m.post_id === p.id);
      const snaps = data.snapshots.filter((s) => s.post_id === p.id);
      const next = nextMilestone(ms);
      return {
        p,
        ms,
        next,
        progress: progressToNext(p.current_views, ms),
        remaining: next ? next.target_views - p.current_views : Infinity,
        spark: snaps.map((s) => s.views),
        h1: gainedSince(p.current_views, snaps, 3600_000),
        h24: gainedSince(p.current_views, snaps, 24 * 3600_000),
      };
    });
    if (sort === "views") list.sort((a, b) => b.p.current_views - a.p.current_views);
    if (sort === "closest") list.sort((a, b) => b.progress - a.progress || a.remaining - b.remaining);
    return list;
  }, [data, sort]);

  return (
    <div className="min-h-screen pb-16">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4">
        <AddPostBox />
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Tracked posts</h2>
            <div className="flex rounded-full bg-secondary p-1 text-sm">
              {(["newest", "views", "closest"] as Sort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`h-9 rounded-full px-3 font-medium ${sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {s === "newest" ? "Newest" : s === "views" ? "Views" : "Closest"}
                </button>
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
                  className="block rounded-2xl border bg-card p-4 transition active:scale-[0.99] hover:border-primary/40"
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {p.thumbnail_url && (
                        <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold">{p.nickname || p.caption || "Untitled post"}</p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-2xl font-bold">
                        <Eye className="h-5 w-5 text-muted-foreground" />
                        {full(p.current_views)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{compact(p.likes)}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{compact(p.comments)}</span>
                        <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" />{compact(p.shares)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {next ? <>Next: <b className="font-mono text-foreground">{compact(next.target_views)}</b></> : "All milestones hit 🎉"}
                      </span>
                      <span className="font-mono">{Math.round(progress * 100)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <Sparkline values={spark} className="flex-1" />
                    <div className="shrink-0 text-right text-xs">
                      <p className="flex items-center justify-end gap-1 font-mono text-success">
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

export function StatusBadge({ status }: { status: string }) {
  if (status === "active") return null;
  const paused = status === "paused";
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paused ? "bg-muted text-muted-foreground" : "bg-destructive/20 text-destructive"}`}>
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
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-bold">Add post</h2>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste TikTok link" inputMode="url" className="h-12 text-base" />
      <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname (optional)" maxLength={60} className="h-12 text-base" />
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Alert me at</p>
        <MilestonePicker value={milestones} onChange={setMilestones} />
      </div>
      <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking post…</> : "Start tracking"}
      </Button>
    </form>
  );
}
