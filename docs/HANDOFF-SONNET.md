# Handoff → Sonnet track (PR-08 … PR-14)

Everything in `PLAN.md` §5's Opus track (PR-01 → PR-07) is merged to `main`.
This note is self-contained: you should not need to read the Opus PRs to build
the UI.

**Read first:** `PLAN.md` (the spec), and the `web-design-system` skill before
writing any markup.

---

## 1. Status — one thing is not done

| PR | Scope | State |
|---|---|---|
| 01 | Caption probe — **the gate** | Built, **never run from Hostinger** |
| 02 | Next.js 15 + Drizzle + MySQL scaffold | Merged, `npm run build` passes |
| 03 | Schema, migration, seed | Merged; **migration not yet applied to Hostinger MySQL** |
| 04 | YouTube Data API client | Merged, not exercised against the live API |
| 05 | Caption pipeline | Merged, not exercised end to end |
| 06 | Analysis pipeline | Merged, not exercised against the live API |
| 07 | Spend guard + Batch API | Merged, 23/23 unit tests pass |
| 08–14 | **Yours** | — |

**The PR-01 gate has never been evaluated.** It could not be: the build
container's network policy blocks `youtube.com` outright, and no Hostinger
credentials were available. Everything downstream assumes captions are free
(`PLAN.md` §0), and the fallback costs ~20× more.

**This does not block you.** The UI reads stored rows; it does not care how they
got there. Build PR-08 → PR-14 as specified. Just don't report the pipeline as
working end to end — it is *written*, not *proven*. The owner needs to run:

```bash
npm run probe:captions      # on the Hostinger box — exit 0 = gate open
```

---

## 2. Frozen schema

`src/db/schema.ts`. **Do not change it.** Import row types from there rather
than redeclaring shapes — `Video`, `Analysis`, `Source`, `Transcript`,
`Outline`, `Topic`, `SpendLogRow`, `User`, plus `CaptionStatus` and `SourceKind`.

Nine tables. Surrogate `int` autoincrement PKs throughout; timestamps are UTC;
money is `decimal(10,6)`, never float.

```
users          id · email (unique) · role enum('admin','user') · created_at

sources        id · kind enum('channel','playlist') · youtube_id (unique)
               title · url · last_polled_at · active (bool) · created_at

videos         id · youtube_id (unique) · source_id (nullable — direct adds)
               title · channel_title · published_at · duration_seconds
               view_count · thumbnail_url
               caption_status enum('unknown','available','none','failed')
               caption_checked_at · created_at

transcripts    id · video_id (unique) · language
               source enum('captions','manual','ai')   -- 'ai' never written in v1
               word_count · content LONGTEXT · fetched_at

analyses       id · video_id · model · prompt_version
               status enum('ok','failed')
               summary TEXT · takeaways JSON · hook_breakdown JSON
               timeline JSON · gaps JSON · ideas JSON
               raw_response LONGTEXT · error VARCHAR(1024) · batch_id
               input_tokens · output_tokens
               cache_read_tokens · cache_write_tokens
               cost_usd DECIMAL(10,6) · created_at

outlines       id · analysis_id · idea_index · content JSON
               raw_response · model · cost_usd · created_at
               UNIQUE (analysis_id, idea_index)

topics         id · name · slug (unique)
video_topics   video_id · topic_id   (composite PK)

spend_log      id · day DATE (unique, UTC) · cost_usd DECIMAL(10,6)
```

Four behaviours you need to know to render correctly:

- **`videos.caption_status`** is the pipeline state machine. `none` means the
  video genuinely has no captions and is skipped forever (§0); `failed` means
  something transient broke and it may be retried. **Render these differently** —
  collapsing them into one badge hides the distinction the pipeline depends on.
- **`analyses` is append-only.** A video can have several rows: earlier models,
  earlier prompt versions, failed attempts. **Always filter `status = 'ok'` and
  take the newest `id`** unless you are deliberately showing history.
- **A `status = 'failed'` row has `summary = NULL`** and carries `error` plus
  `raw_response`. Don't render it as an empty analysis.
- **No foreign key constraints exist.** Ingest is idempotent and out of order, so
  integrity is enforced by the upsert paths. Don't assume a join always matches.

There is no ORM-level cascade either — deleting a video leaves its analyses.
Nothing in v1 deletes videos, so this only matters if PR-11 adds deletion.

---

## 3. Frozen analysis JSON contract

`src/lib/analysis/contract.ts`. **Do not change it.** Import the types; don't
redeclare them. It has no database import, so it is safe in a client component.

```ts
type AnalysisPayload = {
  summary: string;
  takeaways: string[];
  hook: { technique: string; first_30s: string; why_it_works: string };
  timeline: { ts: string; topic: string; beat: string }[];
  gaps: { gap: string; counter_angle: string }[];
  ideas: { title: string; premise: string; why_now: string }[];
};

type OutlinePayload = {
  hook: string;
  rehook: string;
  teaching_points: string[];
  twist: string;
  cta: string;
};
```

Column mapping — the names differ, which is easy to get wrong:

| Contract field | Column |
|---|---|
| `summary` | `analyses.summary` (TEXT) |
| `takeaways` | `analyses.takeaways` (JSON) |
| `hook` | `analyses.hookBreakdown` — **note the name** |
| `timeline` / `gaps` / `ideas` | same names, JSON |

JSON columns are typed via `$type<>`, so `analysis.timeline` is
`AnalysisTimelineEntry[] | null` — **nullable**. A `failed` row has all of them
null. Guard before mapping.

`timeline[].ts` is a display **string** (`"04:15"`), not a duration. Don't do
arithmetic on it; the model estimates it when the transcript lacks timing.

`ANALYSIS_PROMPT_VERSION` is stored per row. If you show analyses side by side,
surface it — outputs from different versions aren't strictly comparable.

**PR-13 note:** `outlines` and `OutlinePayload` exist, but **no outline
generator is implemented.** PR-13 owns both the API route and the UI. Follow
the pattern in `src/lib/analysis/run.ts` — one Anthropic call, structured
outputs, defensive parse, record cost via `recordSpend`.

---

## 4. Every environment variable

`.env.example` is complete and commented. Nothing here is optional at runtime
except where noted.

| Var | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | `mysql://user:pass@host:3306/db`. Live app uses `localhost`; local dev needs the Remote MySQL host **and** your IP whitelisted in hPanel. |
| `DB_CONNECTION_LIMIT` | Optional | Default 8. Hostinger caps connections per user. |
| `YOUTUBE_API_KEY` | Ingest, poller | Google Cloud → YouTube Data API v3. |
| `YOUTUBE_QUOTA_BUDGET` | Optional | Default 10000. Per-run runaway guard, not a real ledger. |
| `ANTHROPIC_API_KEY` | Analysis, outlines | console.anthropic.com. |
| `MONTHLY_SPEND_CAP_USD` | Spend guard | Default 25. `0` blocks all spend. |
| `CAPTION_STRATEGIES` | Optional | Set to whatever a **passing** PR-01 run prints. Unset = try all. |
| `CAPTION_LANGUAGES` | Optional | Default `en`. |
| `CAPTION_DELAY_MS` | Optional | Default 1500. Paces batches so YouTube doesn't start blocking. |
| `CRON_SECRET` | **PR-14 — you add this** | Shared secret for `/api/cron/poll`. Not yet in `.env.example`. |

**Trap:** `tsx` does **not** auto-load `.env` (drizzle-kit does). Export vars
explicitly before running scripts, or a script silently falls back to
`localhost` and throws `ECONNREFUSED`.

---

## 5. What to import

```
src/db                          db (lazy Proxy — safe to import anywhere), closeDb
src/db/schema                   tables + row types
src/lib/analysis/contract       AnalysisPayload, OutlinePayload, ANALYSIS_PROMPT_VERSION
src/lib/analysis/run            analyzeVideo(), findPendingVideos()
src/lib/analysis/batch          submitAnalysisBatch(), collectBatchResults()
src/lib/analysis/pricing        MODEL_RATES, estimateCostUsd, AnalysisModel
src/lib/spend                   spendStatus(), recordSpend(), assertWithinCap(),
                                SpendCapExceededError, formatUsd()
src/lib/ingest                  ingestUrl(url, opts) — the whole add-a-URL flow
src/lib/youtube/url             parseYouTubeUrl(), parseVideoId()
src/lib/youtube/data-api        YouTubeDataClient
src/lib/youtube/captions        fetchCaptions()
```

`spendStatus()` returns exactly what the PR-08 header needs:
`{ monthToDateUsd, capUsd, remainingUsd, fraction, overCap }` — `fraction` is
0–1+ for a meter. `formatUsd()` gives `$0.0234` under a dollar, `$12.30` above.

`ingestUrl()` handles video, playlist, channel and `@handle`, stores metadata
first, then captions, and takes an `onProgress` callback — everything PR-12
needs. It throws `SpendCapExceededError` and `QuotaExhaustedError`; catch both
and render them as messages, not stack traces.

Existing UI: `src/app/layout.tsx`, `src/app/globals.css` (base dark tokens —
extend, don't replace), and a placeholder `src/app/page.tsx` you should replace.

---

## 6. Your PRs

Rules from `PLAN.md` §6: one PR per row, `npm run build` must pass before you
open it, never commit `.env`, update `.env.example` when adding a var, no new
external services, and **do not change the §3 schema or §4 contract** — they
are the interface the two tracks share.

| PR | Scope | Watch for |
|---|---|---|
| **08** | Dashboard shell — dark emerald/slate per `web-design-system`, header with spend counter, nav | `spendStatus()` gives you the numbers. Show the cap, not just the spend. |
| **09** | Digest feed — video cards with caption-status badge, filter/search, pagination | Four distinct `caption_status` values. Paginate in SQL; the corpus grows without bound. |
| **10** | Single analysis view — all five sections, copy-full-analysis button | JSON columns are nullable. Handle `status='failed'` explicitly. |
| **11** | `/sources` — add/remove/pause tracked channels and playlists | Pause = `active=false`, not delete. `last_polled_at` is the poll cursor — don't reset it. |
| **12** | Ingest form — paste any URL or raw transcript, direct-analyse | `ingestUrl()` does the work. Raw-transcript paste needs a `transcripts` row with `source='manual'`. |
| **13** | Outline generator — idea → stored outline → copy | **Not yet built.** You write the generator too. Unique on `(analysis_id, idea_index)`. |
| **14** | Hostinger cron → `/api/cron/poll` (shared-secret header), deploy, basic auth on the subdomain | Compare the secret in constant time. Follow `nextjs-deploy-hostinger`. |

Route handlers `/api/ingest`, `/api/analyze`, `/api/cron/poll` (`PLAN.md` §2) do
not exist yet — they belong to PR-12, PR-13 and PR-14.

**Auth (§0):** v1 is a single user behind HTTP basic auth at the Hostinger level
on a non-obvious subdomain. Do **not** build a login screen. The `users` table
exists so multi-user is a later feature, not a migration.

---

## 7. Open items — flag, don't silently fix

1. **The PR-01 gate is unrun.** Not yours to resolve. Don't claim the pipeline
   works end to end.
2. **Migrations are not applied to Hostinger MySQL.** `npm run db:migrate` then
   `npm run db:seed` needs to happen before any UI shows real data.
3. **Prompt caching doesn't engage on Haiku 4.5.** The minimum cacheable prefix
   is 4,096 tokens; the system prompt is ~500, so `cache_control` is silently
   ignored. Costs ~2% of the §1 figure — documented in `docs/PR-06-ANALYSIS.md`,
   not worth acting on.
4. **`video_topics` is never populated.** §3 says topics are tagged at analysis
   time, but the §4 contract has no `topics` field. Filling it needs a §4 change,
   which is frozen. Consistent with §7 ("nothing in v1 reads those tables") —
   leave it alone.
5. **Schema extensions in PR-03** were additive to §3 and are flagged in that
   PR's description: `takeaways`, `status`, `raw_response`, `error`, `batch_id`,
   `cache_read_tokens`, `cache_write_tokens`. §4 cannot round-trip without the
   first four. Nothing in §3 was removed or retyped.

**Stop and ask the owner if** you need to change the schema or the JSON
contract, a PR needs a new external service or paid dependency, or PR-01 turns
out to have failed.
