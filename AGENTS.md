<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- The cron runs every minute and checks at most one due post per run — keeps scraper calls spaced out without sleeping in the handler (the scheduler cancels long handlers).
- All TikTok scraping goes through `fetchTikTokStats` in src/lib/tracker.server.ts — swap providers only there so the cron job and "check now" stay in sync.
- Milestones are claimed with a conditional update (`hit_at IS NULL`) before alerting, so each fires exactly once even if checks overlap.

- Tracker visuals share semantic surface and gradient utilities in src/styles.css and a single inline SVG Icon component, so every screen stays consistent without altering tracking logic.
- Dashboard periods use browser-safe Eastern calendar helpers and filter existing query results only; changing periods never triggers scraping or changes a post's tracking status.
- Post removal uses the existing archived status, never hard deletion; shared history helpers keep totals independent of scraper eligibility, and status guards protect stopped posts from queued checks.
