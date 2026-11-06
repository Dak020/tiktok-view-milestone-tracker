import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "ViewPulse — TikTok view tracker" },
      { name: "description", content: "Track TikTok post views and get pinged when milestones hit." },
      { property: "og:title", content: "ViewPulse — TikTok view tracker" },
      { property: "og:description", content: "Track TikTok post views and get pinged when milestones hit." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
