# Handoff — Batch B (round 2)

Status as of this commit. **Batch B is complete**: PR-17 through PR-22b are
merged. `main` is green — `npm run typecheck`, `npm test` (57 pass),
`npx eslint .`, `npm run build`.

| PR | Scope | State |
|---|---|---|
| **17** | Analyze from the UI | Merged (#21) |
| **18** | Route resilience: loading/error/not-found, per-page titles, lazy thumbs | Merged (#22) |
| **19** | Read tracking: `read_at`, `pinned`, filters, sort | Merged (#23) — **migration 0003 pending** |
| **20** | CRUD polish + streaming bulk ingest | Merged (#24) |
| **21** | Search inside analyses, three result shapes, copy raw response | Merged (#25) |
| **22** | i18n (en/sv) + a11y | Merged (#26) |
| **22b** | Output-language parameter, prepared not exposed | Merged (#27) |

---

## 1. Verified LIVE vs only written

**Verified live: still nothing.** No code in this batch — or in any batch —
has touched a real database, the YouTube Data API, or the Anthropic API. The
A0 gate in `docs/HANDOFF-BATCH-A.md` §3 remains unrun, and everything below is
"typecheck, tests, lint and build are clean", which is not the same claim.

Specifically unexercised:

- **The streaming ingest route.** `/api/ingest` has never streamed a byte. The
  response sets `x-accel-buffering: no` because Hostinger's proxy would
  otherwise buffer the whole body and defeat the point — that header's effect
  is a guess until someone watches a real channel ingest.
- **Every new SQL clause.** The analysis-status subquery (PR-17), the
  `read_at`/`pinned` filters and the three sort orders (PR-19), the grouped
  source-count join (PR-20) and the `CAST(json AS CHAR) LIKE` search (PR-21)
  have all only ever been compiled, never run.
- **`markVideoRead`, `deleteVideo`, `renameSource`, `setVideoPinned`.** Written
  and typechecked; no row has ever been read, pinned or deleted.
- **The Swedish UI.** Hand-written, not machine-translated, but not reviewed by
  a second reader and never seen rendered.

## 2. New env vars

**None.** Batch B introduced no configuration. `.env.example` is unchanged and
still complete.

## 3. New routes

| Route | Method | Notes |
|---|---|---|
| `/api/ingest` | POST | NDJSON stream of ingest progress. Playlists and channels only — a single video returns 400 and belongs to the form's server action, which also analyses. No auth of its own; it sits behind the same Hostinger basic auth as every page. |

Every existing route gained `error.tsx`, and the three database-backed ones
gained `loading.tsx`. `/` and `/video/[id]` gained `not-found.tsx`.

## 4. Schema

**One pending migration from this batch: `0003_rapid_blazing_skull.sql`** —
`read_at` (nullable timestamp) and `pinned` (boolean, default false) on
`videos`, plus three indexes. Additive, no data movement, nothing destructive.

It joins the two already pending from Batch A, so A0's `npm run db:migrate`
now applies **three** migrations and `npm run db:check` should still report 10
tables (0003 adds columns, not tables).

## 5. What Batch C needs to know

- **`users` is untouched.** PR-23's `password_hash` column and PR-24's role
  enum migration are still clean additions; nothing in Batch B read or wrote
  the table.
- **There is no session concept anywhere yet.** No middleware, no `getSession()`,
  no cookie except the locale one (`yt_locale`, not httpOnly, not a secret).
  PR-23 is free to define all of it.
- **Money-spending entry points, for PR-24's `requireRole('owner')`:**
  `submitIngest` (`src/lib/ingest.actions.ts`), `analyzeVideoAction`
  (`src/lib/analyze.actions.ts` — **new in this batch, easy to miss**),
  `generateOutlineAction` (`src/lib/outline.actions.ts`), and the cron poll
  route. Destructive entry points: `removeSource`, `renameSource`,
  `setSourceActive` (`src/lib/sources.actions.ts`) and `deleteVideo`
  (`src/lib/video.actions.ts` — **also new**).
- **i18n applies to new UI too.** Adding an English string without a Swedish
  one fails typecheck by design (`sv` is typed as a complete map of `en`'s
  keys). A login page needs both, and `src/lib/i18n/server.ts` gives a server
  component its translator in one line.
- **Client components get `locale` as a prop**, except the error boundaries,
  which use `useTranslator()` from `src/lib/i18n/client.ts` because React
  renders them without going through a page.

## 6. Risks

- **The gate is still the single point of failure**, unchanged from Batch A.
  Batch B made the app better at being empty.
- **The read/pinned columns assume one user.** That is deliberate and stated in
  the schema comment, but PR-24 introduces a second role — an employee marking
  a video read marks it read for the owner too. If that matters, it is a
  `video_reads` table, and PR-24 is the moment to decide, not later.
- **`deleteVideo` is not transactional.** It deletes outlines, analyses,
  transcript and video in sequence; MySQL will happily leave that half-done if
  a connection drops. It is ordered children-first so a retry still finds the
  orphans, but a partial delete is possible and nothing reports it.
- **The locale cookie is not httpOnly**, because client components read it. It
  holds a two-letter language choice, nothing else — but PR-23 must not follow
  that pattern for the session cookie.

## 7. Ideas noticed, deliberately not built

Per PLAN.md's scope rule, written down rather than built. Round-3 candidates,
in the order I would do them:

1. **Bulk actions on the feed.** Every action is per-video: analysing 40
   pending videos means 40 page visits. A checkbox column and one "Analyse
   selected" that reuses the existing batch path would collapse that, and the
   spend estimate for a selection is already computable.
2. **The analysis-status badge cannot say "queued in a batch".** A video whose
   analysis is sitting in an open Batch API job looks identical to one nobody
   has touched. `analyses.batch_id` and the `batches` table already hold
   everything needed to distinguish them.
3. **No way to see failed outlines.** PR-16 made failed generations write a
   row, and the video page filters to `status = 'ok'` — so the failure rows it
   was built to preserve are invisible in the UI. A collapsed "generation
   failed, show why" under the idea would close the loop.
4. **Search has no highlighting and no scope control.** A hit inside an
   analysis renders identically to a title match, so the reason a video matched
   is invisible. Returning the matched field from `matchesQuery` would fix both.
5. **`/topics` still does not exist.** `topics` and `video_topics` are written
   at analysis time and nothing reads them (PLAN.md §7). Now that the feed has
   filters and sorting, a topic filter is the obvious next dimension and needs
   no new infrastructure.
