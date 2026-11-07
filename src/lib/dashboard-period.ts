export type DashboardPeriod = "today" | "week" | "all";

const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

function dateKey(date: Date): string {
  const parts = easternDate.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function easternMidnight(now: number): number {
  const calendarMidnight = Date.parse(`${dateKey(new Date(now))}T00:00:00Z`);
  let midnight = calendarMidnight;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "shortOffset",
  });
  for (let i = 0; i < 3; i++) {
    const offset = formatter.formatToParts(new Date(midnight)).find((p) => p.type === "timeZoneName")?.value;
    const match = offset?.match(/GMT([+-])(\d+)(?::(\d+))?/);
    const minutes = match ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "-" ? -1 : 1) : 0;
    midnight = calendarMidnight - minutes * 60_000;
  }
  return midnight;
}

export function postsForPeriod<T extends { created_at: string }>(posts: T[], period: DashboardPeriod, now: number): T[] {
  if (period === "all") return posts;
  const today = dateKey(new Date(now));
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const start = period === "today" ? today : monday.toISOString().slice(0, 10);
  return posts.filter((post) => {
    const added = new Date(post.created_at);
    if (!Number.isFinite(added.getTime()) || added.getTime() > now) return false;
    const key = dateKey(added);
    return key >= start && key <= today;
  });
}