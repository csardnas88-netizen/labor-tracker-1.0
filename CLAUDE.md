# Labor Tracker — working rules for Claude Code

This is Carlos's Housekeeping Labor Tracker: a single-file vanilla-JS PWA
(`index.html` + `sw.js`), Supabase backend, deployed to GitHub Pages from
this repo's `main` branch. It is in daily operational use — a bug here
affects a real hotel's labor data, not a side project.

## Before every push

1. `npm test` — must be 146+/146 green. GitHub Actions also runs this on
   every push, but don't rely on CI to catch it after the fact; run it
   yourself first.
2. Run `/code-review` on the diff before pushing, every time, without
   being asked. This repo has a long history of real production bugs
   (dual-storage sync drift, day-boundary clock math, whole-blob
   overwrites, unconditional re-renders causing scroll jumps) that a
   review pass over the diff can catch before they reach Carlos's real
   data. If the review finds anything plausible, fix it before pushing,
   not after.
3. Bump BOTH `index.html`'s `<meta name="app-version">` AND `sw.js`'s
   `CACHE_VERSION` together — a push that updates only one leaves users
   stuck on a stale cached build with no way to tell. Add a `CHANGELOG`
   entry describing the user-visible change.
4. After pushing, confirm the live GitHub Pages URL actually serves the
   new version (both markers) before telling Carlos it's done — a push
   succeeding is not the same as GitHub Pages having deployed it yet.

## Known recurring bug classes (check for these specifically in review)

- **Dual-storage drift**: several data types are synced BOTH as a legacy
  whole-blob array (`calloffs_data`, `projects_data`, `latearrivals_data`,
  `req_notebook`) AND as individual per-record keys (`calloff_<id>`,
  `project_<id>`, etc). The per-record key wins on merge. Any manual
  Supabase SQL fix to one of these must update BOTH the blob and every
  matching per-record key, or the stale per-record key silently wins on
  the next sync pull.
- **Day-boundary clock math**: comparing two bare clock-times with no date
  breaks when one event happened the calendar day before the other (a
  call-off notified "11:31 PM" for a shift "the next day" computing a
  negative gap via plain subtraction). Always check whether a "night
  before" case needs +1440 minutes before comparing.
- **Whole-blob overwrite**: saving one piece of a larger record must never
  silently replace the whole remote record — always pull + merge before
  push for anything shared across devices (see `_schedMergeRecord`,
  `_monthPushShadow` for the established pattern).
- **Silent async push loss**: a save that writes to localStorage
  synchronously but pushes to Supabase asynchronously can lose the push
  if the tab backgrounds mid-flight (especially on iOS) — the edit
  survives locally but never reaches other devices until something
  retries it. See `_schedRetryPendingPush` for the established
  savedat/pushedat shadow pattern; apply the same approach to any new
  save path that has this shape.
- **Unconditional re-render side effects**: a render function called from
  many places (e.g. `renderLaborDash`) must not carry an action that's
  only appropriate for ONE of its callers (e.g. `scrollIntoView`,
  `window.scrollTo`) — it fires on every unrelated re-render too.
