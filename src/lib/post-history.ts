import { easternMidnight, postsForPeriod, type DashboardPeriod } from "./dashboard-period";
import { gainedSince, type Snap } from "./format";

export function canCheckPost(status: string): boolean {
  return status === "active";
}

export function visiblePosts<T extends { status: string }>(posts: T[]): T[] {
  return posts.filter((post) => post.status !== "archived");
}

export function statusAfterToggle(status: string): "active" | "paused" {
  // Restoring an archive does not restart scraping without a separate Resume.
  return status === "active" || status === "archived" ? "paused" : "active";
}

type RecordedPost = {
  status: string;
  created_at: string;
  current_views: number;
  url: string;
  view_snapshots: Snap[];
};

export function summarizeHistory(posts: RecordedPost[], period: DashboardPeriod, now: number) {
  const scoped = postsForPeriod(posts, period, now);
  const accounts = new Set(scoped.map((post) => {
    const handle = post.url.match(/@([a-zA-Z0-9_.-]+)/)?.[1];
    return handle ? `@${handle.toLowerCase()}` : post.url.split("?")[0];
  }));
  return {
    totalViews: scoped.reduce((sum, post) => sum + post.current_views, 0),
    todayGain: scoped.reduce((sum, post) => sum + (gainedSince(post.current_views, post.view_snapshots ?? [], now - easternMidnight(now), now) ?? 0), 0),
    h24Gain: scoped.reduce((sum, post) => sum + (gainedSince(post.current_views, post.view_snapshots ?? [], 24 * 3600_000, now) ?? 0), 0),
    activeCount: scoped.filter((post) => canCheckPost(post.status)).length,
    recordedCount: scoped.length,
    accountCount: accounts.size,
  };
}