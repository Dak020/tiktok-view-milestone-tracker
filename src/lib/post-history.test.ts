import { describe, expect, it } from "vitest";
import { canCheckPost, statusAfterToggle, summarizeHistory, visiblePosts } from "./post-history";

const now = Date.parse("2026-11-08T12:00:00Z");
const post = {
  status: "active", created_at: "2026-11-08T06:00:00Z", current_views: 1200,
  url: "https://www.tiktok.com/@same/video/1",
  view_snapshots: [{ views: 1000, checked_at: "2026-11-08T06:00:00Z" }, { views: 1200, checked_at: "2026-11-08T10:00:00Z" }],
};

describe("Preserved post history", () => {
  it("keeps paused views, daily gains, and account counts", () => {
    const summary = summarizeHistory([{ ...post, status: "paused" }], "today", now);
    expect(summary).toEqual({ totalViews: 1200, todayGain: 200, h24Gain: 200, activeCount: 0, recordedCount: 1, accountCount: 1 });
  });
  it("includes archived and stopped views in all-time totals", () => {
    const summary = summarizeHistory([{ ...post, status: "archived" }, { ...post, status: "unavailable", current_views: 800 }], "all", now);
    expect(summary.totalViews).toBe(2000);
    expect(summary.accountCount).toBe(1);
  });
  it("hides archived posts from the feed without mutating their history", () => {
    const archived = { ...post, status: "archived" };
    expect(visiblePosts([post, archived])).toEqual([post]);
    expect(archived.view_snapshots).toHaveLength(2);
    expect(archived.current_views).toBe(1200);
  });
  it.each(["paused", "archived", "failed", "unavailable"])("does not scrape %s posts", (status) => {
    expect(canCheckPost(status)).toBe(false);
  });
  it("allows active tracking", () => expect(canCheckPost("active")).toBe(true));
  it("restores an archive paused instead of automatically resuming checks", () => expect(statusAfterToggle("archived")).toBe("paused"));
  it("retains Eastern-day filtering for preserved history", () => {
    expect(summarizeHistory([{ ...post, status: "archived", created_at: "2026-11-07T06:00:00Z" }], "today", now).totalViews).toBe(0);
  });
});