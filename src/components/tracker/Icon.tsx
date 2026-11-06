import type { SVGProps } from "react";

const paths = {
  pulse: <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />,
  bell: <path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0" />,
  settings: <><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.5" /><circle cx="8" cy="17" r="2.5" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  heart: <path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 9c0 6-8 11-8 11z" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8" /></>,
  refresh: <path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5" />,
  pause: <path d="M8 5v14M16 5v14" />,
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  edit: <path d="M4 20l1-4L16 5l3 3L8 19z" />,
  empty: <circle cx="12" cy="12" r="9" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  play: <path d="M8 5l11 7-11 7z" />,
  close: <path d="M6 6l12 12M6 18L18 6" />,
  up: <path d="M5 15l7-7 7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  trend: <path d="M3 17l6-6 4 4 8-10M15 5h6v6" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3L2 21h20zM12 9v5" /><path d="M12 17h.01" /></>,
  logout: <path d="M9 4H4v16h5M9 12h12M17 8l4 4-4 4" />,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

const named = (name: keyof typeof paths) => function NamedIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props} name={name} />; };
export const Activity = named("pulse"), Bell = named("bell"), BellRing = named("bell"), Settings = named("settings"), ChevronLeft = named("back"), Eye = named("eye"), Heart = named("heart"), MessageCircle = named("comment"), Share2 = named("share"), RefreshCw = named("refresh"), Loader2 = named("refresh"), Pause = named("pause"), Trash2 = named("trash"), Plus = named("plus"), ExternalLink = named("external"), Pencil = named("edit"), Circle = named("empty"), CheckCircle2 = named("check"), Play = named("play"), X = named("close"), ChevronUp = named("up"), ChevronDown = named("down"), TrendingUp = named("trend"), Calendar = named("calendar"), Clock = named("clock"), Sparkles = named("pulse"), AlertTriangle = named("alert"), LogOut = named("logout");