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

/** Faint line under card stats: counts from when the post was added */
export function addedAgo(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}hr ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export type ElapsedUnit = "m" | "h" | "d";

/** Determine whether to display minutes, hours, or days on the graph */
export function elapsedUnit(spanMs: number): ElapsedUnit {
  const hours = spanMs / 3600_000;
  if (hours < 2) return "m";
  if (hours <= 48) return "h";
  return "d";
}

/** Evenly spaced tick intervals for the elapsed graph axis */
export function elapsedTicks(spanMs: number): number[] {
  if (spanMs <= 0) return [0];
  const unit = elapsedUnit(spanMs);
  let stepMs: number;

  if (unit === "m") {
    const mins = spanMs / 60_000;
    if (mins <= 15) stepMs = 5 * 60_000;
    else if (mins <= 30) stepMs = 10 * 60_000;
    else if (mins <= 60) stepMs = 15 * 60_000;
    else stepMs = 30 * 60_000;
  } else if (unit === "h") {
    const hours = spanMs / 3600_000;
    if (hours <= 6) stepMs = 3600_000;
    else if (hours <= 12) stepMs = 2 * 3600_000;
    else if (hours <= 24) stepMs = 3 * 3600_000;
    else stepMs = 6 * 3600_000;
  } else {
    const days = spanMs / (24 * 3600_000);
    if (days <= 5) stepMs = 24 * 3600_000;
    else if (days <= 14) stepMs = 2 * 24 * 3600_000;
    else stepMs = 7 * 24 * 3600_000;
  }

  const ticks: number[] = [0];
  let curr = stepMs;
  while (curr <= spanMs) {
    ticks.push(curr);
    curr += stepMs;
  }
  if (ticks.length === 1 && spanMs > 0) {
    ticks.push(spanMs);
  }
  return ticks;
}

/** Formatter for bottom axis ticks: 0h, 1h, 3h or 0m, 5m or 1d, 2d */
export function formatElapsedTick(tMs: number, unit: ElapsedUnit): string {
  if (tMs <= 0) return `0${unit}`;
  if (unit === "m") {
    return `${Math.round(tMs / 60_000)}m`;
  }
  if (unit === "h") {
    return `${Math.round(tMs / 3600_000)}h`;
  }
  return `${Math.round(tMs / (24 * 3600_000))}d`;
}

/** Precise tooltip elapsed time label (e.g. "3h 20m") */
export function formatElapsedPrecise(tMs: number): string {
  if (tMs < 60_000) return "0m";
  const totalMins = Math.round(tMs / 60_000);
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
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
