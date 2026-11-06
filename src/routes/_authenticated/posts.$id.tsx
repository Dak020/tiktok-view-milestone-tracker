import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink, Pause, Play, RefreshCw, Trash2, Pencil } from "@/components/tracker/Icon";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppHeader } from "@/components/tracker/AppHeader";
import { MilestonePicker } from "@/components/tracker/MilestonePicker";
import { postQuery } from "@/components/tracker/data";
import { StatusBadge } from "./dashboard";
import { checkNow } from "@/lib/tracker.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { compact, full, gainedSince, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/posts/$id")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Post details — ViewPulse" },
      { name: "description", content: "View growth chart and milestones for a tracked TikTok post." },
      { property: "og:title", content: "Post details — ViewPulse" },
      { property: "og:description", content: "View growth chart and milestones for a tracked TikTok post." },
    ],
  }),
  component: PostDetail,
});

function PostDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const check = useServerFn(checkNow);
  const { data, isLoading, error } = useQuery(postQuery(id));
  const [checking, setChecking] = useState(false);

  if (isLoading) return <><AppHeader back /><p className="p-10 text-center text-muted-foreground">Loading…</p></>;
  if (error || !data) return <><AppHeader back /><p className="p-10 text-center text-muted-foreground">Post not found.</p></>;
  const { post, milestones, snapshots } = data;
  const refresh = () => qc.invalidateQueries();

  const chart = snapshots.map((s) => ({ t: new Date(s.checked_at).getTime(), views: s.views }));
  const h1 = gainedSince(post.current_views, snapshots, 3600_000);
  const h24 = gainedSince(post.current_views, snapshots, 24 * 3600_000);

  async function runCheck() {
    setChecking(true);
    try {
      const r = await check({ data: { id } });
      if (r.ok) toast.success(`${full(r.views)} views`);
      else toast.error(r.error);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function togglePause() {
    const status = post.status === "active" ? "paused" : "active";
    await supabase.from("posts").update({ status, failure_count: 0 }).eq("id", id);
    toast.success(status === "paused" ? "Tracking paused" : "Tracking resumed");
    refresh();
  }

  async function remove() {
    await supabase.from("posts").delete().eq("id", id);
    toast.success("Post deleted");
    qc.invalidateQueries();
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen pb-16">
      <AppHeader back title={post.nickname || "Post"} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="flex gap-4 surface-card">
          <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-[14px] border bg-secondary">
            {!post.thumbnail_url && <Circle className="h-6 w-6 text-muted-foreground" />}
            {post.thumbnail_url && <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{post.caption || post.url}</p>
              <StatusBadge status={post.status} />
            </div>
            <p className="mt-1 font-mono text-[38px] leading-tight font-extrabold silver-text">{full(post.current_views)}</p>
            <p className="text-xs text-muted-foreground">views · checked {timeAgo(post.last_checked_at)}</p>
            <a href={post.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-primary underline underline-offset-4">
              Open on TikTok <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

        {post.last_error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">Last check failed: {post.last_error}</p>
        )}

        <section className="grid grid-cols-5 gap-2 text-center">
          <Stat label="Hour" value={`+${compact(h1 ?? 0)}`} accent />
          <Stat label="24h" value={`+${compact(h24 ?? 0)}`} accent />
          <Stat label="Likes" value={compact(post.likes)} />
          <Stat label="Replies" value={compact(post.comments)} />
          <Stat label="Shares" value={compact(post.shares)} />
        </section>

        <section className="surface-card">
          <h2 className="mb-3 font-bold">Views over time</h2>
          {chart.length < 2 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">The chart fills in as checks run every 20 minutes.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: -10, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-fill)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-fill)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tick={{ fill: "var(--label)", fontSize: 10 }}
                    tickFormatter={(t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" })} />
                  <YAxis tickFormatter={(v) => compact(v)} tick={{ fill: "var(--label)", fontSize: 10 }} width={50} />
                  <Tooltip
                    cursor={{ stroke: "var(--chart-guide)", strokeWidth: 1 }}
                    contentStyle={{ background: "var(--tile)", border: "1px solid var(--control-border)", borderRadius: 12 }}
                    labelFormatter={(t) => new Date(t as number).toLocaleString()}
                    formatter={(v) => [full(v as number), "Views"]}
                  />
                  <Area dataKey="views" stroke="var(--chart-line)" strokeWidth={2} activeDot={{ r: 4, fill: "var(--highlight)", stroke: "var(--highlight)" }} fill="url(#v)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="surface-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Milestones</h2>
            <EditMilestones postId={id} current={milestones} onSaved={refresh} />
          </div>
          <ul className="divide-y">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                {m.hit_at ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                <span className="font-mono font-bold">{compact(m.target_views)}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {m.hit_at ? `Hit ${new Date(m.hit_at).toLocaleString()}` : `${full(Math.max(0, m.target_views - post.current_views))} to go`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid grid-cols-3 gap-2">
          <Button variant="secondary" className="h-[52px] gap-1.5 whitespace-normal px-2 text-xs sm:text-[13px]" onClick={runCheck} disabled={checking}>
            <RefreshCw className={`h-5 w-5 ${checking ? "animate-spin" : ""}`} /> Check now
          </Button>
          <Button variant="secondary" className="h-[52px] gap-1.5 whitespace-normal px-2 text-xs sm:text-[13px]" onClick={togglePause}>
            {post.status === "active" ? <><Pause className="h-5 w-5" />Pause</> : <><Play className="h-5 w-5" />Resume</>}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" className="h-[52px] gap-1.5 whitespace-normal px-2 text-xs sm:text-[13px] text-destructive"><Trash2 className="h-5 w-5" />Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                <AlertDialogDescription>All its history and milestones will be removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground" onClick={remove}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="inner-tile min-w-0 !px-1.5 !py-3">
      <p className={`font-mono text-base sm:text-lg font-bold ${accent ? "text-success" : ""}`}>{value}</p>
      <p className="text-[10px] sm:text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function EditMilestones({
  postId, current, onSaved,
}: { postId: string; current: { id: string; target_views: number; hit_at: string | null }[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const existing = current.map((m) => m.target_views);
    const toDelete = current.filter((m) => !value.includes(m.target_views)).map((m) => m.id);
    const toAdd = value.filter((v) => !existing.includes(v));
    if (toDelete.length) await supabase.from("milestones").delete().in("id", toDelete);
    if (toAdd.length) await supabase.from("milestones").insert(toAdd.map((t) => ({ post_id: postId, target_views: t })));
    setSaving(false);
    setOpen(false);
    toast.success("Milestones updated");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(current.map((m) => m.target_views)); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="h-10 rounded-full"><Pencil className="h-4 w-4" /> Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit milestones</DialogTitle></DialogHeader>
        <MilestonePicker value={value} onChange={setValue} />
        <Button className="h-12" onClick={save} disabled={saving || value.length === 0}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}
