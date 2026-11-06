import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bell, Settings, ChevronLeft } from "@/components/tracker/Icon";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery } from "./data";
import { timeAgo } from "@/lib/format";

export function AppHeader({ back, title }: { back?: boolean; title?: string }) {
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery(notificationsQuery);
  const unread = notes.filter((n) => !n.read).length;

  async function markAllRead(open: boolean) {
    if (!open || unread === 0) return;
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    setTimeout(() => qc.invalidateQueries({ queryKey: ["notifications"] }), 1500);
  }

  return (
    <header className="sticky top-0 z-20 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-2xl items-center gap-3 px-4">
        {back ? (
          <Link to="/dashboard" className="icon-control grid shrink-0 place-items-center" aria-label="Back">
            <ChevronLeft className="h-6 w-6" />
          </Link>
        ) : (
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] logo-mark">
              <Activity className="h-5 w-5" />
            </span>
          </Link>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold silver-text">{title ?? "ViewPulse"}</h1>
        <Sheet onOpenChange={markAllRead}>
          <SheetTrigger asChild><Button variant="secondary" size="icon" className="relative" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
                {unread}
              </span>
            )}
          </Button></SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
            </SheetHeader>
            <ul className="mt-2 space-y-2 px-4 pb-6">
              {notes.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet. Milestones will show up here.</li>}
              {notes.map((n) => (
                <li key={n.id} className={`rounded-xl border p-3 ${n.read ? "opacity-70" : "border-primary/40 bg-primary/5"}`}>
                  {n.post_id ? (
                    <Link to="/posts/$id" params={{ id: n.post_id }} className="block">
                      <p className="text-sm">{n.message}</p>
                    </Link>
                  ) : (
                    <p className="text-sm">{n.message}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
        <Link to="/settings" className="icon-control grid shrink-0 place-items-center" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
