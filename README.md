# Tiktok View Milestone Tracker

Build a TikTok post view tracker web app (mobile-friendly, dark theme).

CORE FLOW
- Main screen has an "Add post" box: paste a TikTok link, set one or more milestone view counts (quick-pick chips: 10K, 50K, 100K, 500K, 1M, plus custom), optional nickname for the post.
- Dashboard shows a card per tracked post: thumbnail/caption if available, current views, likes/comments/shares if available, a progress bar toward the NEXT unhit milestone, "last checked" time, and a small sparkline of view growth.
- Tapping a card opens a detail page with a full growth chart (views over time), a milestone list showing hit/pending with timestamps, and options to edit milestones, pause tracking, or delete.

BACKEND (Supabase)
- Tables: posts (id, url, nickname, current_views, status, created_at), milestones (id, post_id, target_views, hit_at nullable, notified boolean), view_snapshots (id, post_id, views, likes, comments, shares, checked_at), notifications (id, post_id, message, created_at, read).
- A scheduled edge function runs every 20 minutes via cron. For each active post it calls a TikTok scraper API to get the current stats, saves a snapshot, updates current_views, and checks milestones.
- When views >= a milestone target that has not been hit: mark it hit, set hit_at, send a push alert, and create a row in notifications. Each milestone fires only once.
- Scraper API key stored as a Supabase secret (I'll supply it). Make the provider easy to swap by isolating the fetch in one function. Handle failed or private/deleted posts gracefully (mark status and stop retrying after repeated failures).

NOTIFICATIONS
- Push alerts through ntfy: the edge function sends a POST to https://ntfy.sh/{NTFY_TOPIC} with a title ("Milestone hit 🎉") and a message like "Your post [nickname] just passed 50K views (52,340 now)". Add a click-through link to the post. NTFY_TOPIC is a secret I'll set.
- Add a settings page where I enter my ntfy topic, with a "Send test notification" button.
- Also show an in-app bell icon with the unread notifications list.

EXTRAS
- Show how fast each post is growing (views gained in the last hour / 24h).
- Sort posts by newest, most views, or closest to the next milestone.
- Simple email login (Supabase auth) so the data is private.

Keep the UI clean and fast, with big tap targets for phone use.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tiktok-view-milestone-tracker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2837a7c6-ed42-4fda-b855-18c194ca4011).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
