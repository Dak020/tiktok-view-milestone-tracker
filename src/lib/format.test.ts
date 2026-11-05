import { describe, it, expect } from "vitest";
import { newlyHit, nextMilestone, gainedSince, parseViews, isTikTokUrl } from "./format";

describe("milestones", () => {
  const ms = [
    { target_views: 50_000, hit_at: null },
    { target_views: 10_000, hit_at: "2026-01-01" },
    { target_views: 100_000, hit_at: null },
  ];
  it("next milestone is the lowest unhit one", () => {
    expect(nextMilestone(ms)?.target_views).toBe(50_000);
  });
  it("a milestone fires when views reach it, and an already-hit one never fires again", () => {
    expect(newlyHit(52_340, ms).map((m) => m.target_views)).toEqual([50_000]);
    expect(newlyHit(9_000, ms)).toEqual([]);
  });
});

describe("growth", () => {
  it("views gained in the last hour", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const snaps = [
      { views: 100, checked_at: "2026-01-01T10:00:00Z" },
      { views: 400, checked_at: "2026-01-01T11:10:00Z" },
    ];
    expect(gainedSince(1000, snaps, 3600_000, now)).toBe(600);
  });
});

describe("input", () => {
  it("parses custom milestone shorthand", () => {
    expect(parseViews("250k")).toBe(250_000);
    expect(parseViews("1.5M")).toBe(1_500_000);
    expect(parseViews("abc")).toBeNull();
  });
  it("accepts only tiktok links", () => {
    expect(isTikTokUrl("https://www.tiktok.com/@a/video/1")).toBe(true);
    expect(isTikTokUrl("https://vm.tiktok.com/xyz")).toBe(true);
    expect(isTikTokUrl("https://youtube.com")).toBe(false);
  });
});
