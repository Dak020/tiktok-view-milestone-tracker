import { describe, expect, it } from "vitest";
import { easternMidnight, postsForPeriod } from "./dashboard-period";

describe("dashboard periods", () => {
  const now = Date.parse("2026-11-07T11:16:00Z");
  const posts = [
    { id: "older", created_at: "2026-11-01T12:00:00Z", status: "active" },
    { id: "week", created_at: "2026-11-02T05:00:00Z", status: "active" },
    { id: "yesterday", created_at: "2026-11-07T04:59:59Z", status: "active" },
    { id: "today", created_at: "2026-11-07T05:00:00Z", status: "active" },
  ];
  it("Today counts only posts added since Eastern midnight", () => {
    expect(postsForPeriod(posts, "today", now).map((p) => p.id)).toEqual(["today"]);
  });
  it("This Week starts on Monday in Eastern time", () => {
    expect(postsForPeriod(posts, "week", now).map((p) => p.id)).toEqual(["week", "yesterday", "today"]);
  });
  it("All Time retains every post without pausing older posts", () => {
    expect(postsForPeriod(posts, "all", now)).toEqual(posts);
    postsForPeriod(posts, "today", now);
    expect(posts.map((p) => p.status)).toEqual(["active", "active", "active", "active"]);
  });
  it("resets Today on the next Eastern calendar day", () => {
    expect(postsForPeriod(posts, "today", Date.parse("2026-11-08T05:00:00Z"))).toEqual([]);
  });
  it("handles Eastern midnight in winter, summer and DST transition days", () => {
    expect(easternMidnight(now)).toBe(Date.parse("2026-11-07T05:00:00Z"));
    expect(easternMidnight(Date.parse("2026-07-07T12:00:00Z"))).toBe(Date.parse("2026-07-07T04:00:00Z"));
    expect(easternMidnight(Date.parse("2026-03-08T12:00:00Z"))).toBe(Date.parse("2026-03-08T05:00:00Z"));
    expect(easternMidnight(Date.parse("2026-11-01T12:00:00Z"))).toBe(Date.parse("2026-11-01T04:00:00Z"));
  });
});