export function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function full(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type MilestoneLike = { target_views: number; hit_at: string | null };

/** Lowest milestone target that has not been hit yet. */
export function nextMilestone<T extends MilestoneLike>(ms: T[]): T | null {
  return [...ms].filter((m) => !m.hit_at).sort((a, b) => a.target_views - b.target_views)[0] ?? null;
}

/** Progress 0..1 from the previous hit milestone (or 0) to the next one. */
export function progressToNext(views: number, ms: MilestoneLike[]): number {
  const next = nextMilestone(ms);
  if (!next) return 1;
  return Math.min(1, Math.max(0, views / next.target_views));
}

/** Milestones newly passed by `views` that were not already hit. */
export function newlyHit<T extends MilestoneLike>(views: number, ms: T[]): T[] {
  return ms.filter((m) => !m.hit_at && views >= m.target_views);
}

export type Snap = { views: number; checked_at: string };

/** Views gained over the given window (ms), using the oldest snapshot inside the window as baseline. */
export function gainedSince(current: number, snaps: Snap[], windowMs: number, now = Date.now()): number | null {
  const cutoff = now - windowMs;
  const inWindow = snaps
    .filter((s) => new Date(s.checked_at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());
  if (inWindow.length === 0) return null;
  return Math.max(0, current - inWindow[0]!.views);
}

export function parseViews(input: string): number | null {
  const m = input.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
  const v = Math.round(parseFloat(m[1]!) * mult);
  return v > 0 ? v : null;
}

export function isTikTokUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return /(^|\.)tiktok\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export const QUICK_MILESTONES = [10_000, 50_000, 100_000, 500_000, 1_000_000];
