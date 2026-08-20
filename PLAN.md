# YouTube Intelligence Workspace — Build Plan

**Status:** round 1 (PR-01 → PR-14) and round 2 batches A and B (PR-15 → PR-22b) merged,
never deployed. A0 (gate, migrate, deploy) and Batch C (roles) remain — see §9.
**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + Drizzle ORM + MySQL (Hostinger) + tsx
**Deploy:** Hostinger Node.js slot, GitHub integration
**Skills to read before coding:** `nodejs-mysql-hostinger-stack`, `nextjs-deploy-hostinger`, `web-design-system`

---

## 0. What this is

A private research tool that ingests YouTube videos, playlists and channels, pulls their
**existing captions**, runs a structured AI analysis once, and stores the result forever.
The user reads digests instead of watching videos.

### Non-goals for v1

- **No AI audio transcription.** Videos without captions are marked unavailable and skipped.
  Audio transcription costs ~10-20x more than reading a caption file. It is a paid-tier
  feature for future customers, not for the owner's own use. Do not build it in v1.
- **No per-video cost approval modal.** With captions only, a video costs ~$0.02. A modal
  per video is friction protecting nothing. Replaced by a monthly spend counter + hard cap.
- **No email/passcode auth screen in v1.** Single user. HTTP basic auth at the Hostinger
  level on a non-obvious subdomain. A real `users` table exists in the schema from day one
  (see §3) so multi-user is a later feature, not a migration.

### The one assumption that can kill this project

Caption extraction must work **from the Hostinger server IP**, not just from a laptop.
YouTube blocks datacenter IP ranges aggressively. PR-01 exists solely to prove this before
anything else is built. **If PR-01 fails, stop and re-plan.** Everything downstream assumes
free caption text.

---

## 1. Cost model (verified against Anthropic pricing, Aug 2026)

A 30-minute video is roughly 5,000 spoken words ≈ **7,000 input tokens**.
The structured analysis output (§4) is roughly **2,500 output tokens**.

| Model | Rate (in/out per MTok) | Per 30-min video | 10 h/day (20 videos) | Per month |
|---|---|---|---|---|
| Haiku 4.5 | $1 / $5 | ~$0.02 | ~$0.39/day | **~$12** |
| Haiku 4.5 + Batch API | $0.50 / $2.50 | ~$0.01 | ~$0.20/day | **~$6** |
| Sonnet 5 | $2 / $10 | ~$0.04 | ~$0.78/day | ~$23 |

**Decisions that follow from this table:**

1. **Haiku 4.5 is the default analysis model.** Summarising a transcript against a fixed
   template is not a reasoning-hard task. Sonnet is a per-video opt-in for videos worth it.
2. **Use the Batch API for the nightly poller.** The channel/playlist job is inherently
   asynchronous — nobody is waiting on it. Batch is a flat 50% discount for accepting
   latency the user does not care about. This alone halves the running cost.
3. **Analyse once, store forever.** Re-reading a stored analysis costs $0. This matters more
   for the budget than any model choice.
4. **Prompt caching on the analysis system prompt.** The template is identical across every
   video; cache hits cost 10% of base input.
   > **Correction (Aug 2026 review):** caching does NOT engage as shipped. Haiku 4.5's
   > minimum cacheable prefix is 4096 tokens and the system prompt is ~650, so the
   > `cache_control` breakpoints in `run.ts`/`batch.ts` are a no-op — and batch scheduling
   > makes hits unlikely even past that. Budget against **~$12/month**, not $6. Still cheap;
   > do not pad the prompt just to reach the cache threshold.

For comparison, AI audio transcription runs ~$0.006/minute → ~$0.18 per 30-min video.
10 h/day of that is ~$3.60/day, ~$108/month. That is the number the paid tier must cover.

---

## 2. Architecture

```
Hostinger Node slot
└── Next.js 15 app
    ├── /                     dashboard — digest feed
    ├── /video/[id]           single analysis view
    ├── /sources              tracked channels + playlists
    ├── /topics               cross-corpus query (v2)
    ├── /api/ingest           add a URL (video | playlist | channel)
    ├── /api/analyze          run analysis on one stored transcript
    └── /api/cron/poll        called by Hostinger cron, hourly

scripts/
├── probe-captions.ts         PR-01 spike — proves the core assumption
├── poll-sources.ts           find new uploads on tracked sources
└── backfill.ts               analyse everything pending

MySQL (Hostinger)             see §3
```

**No Express proxy.** Next.js route handlers keep API keys server-side, which was the only
reason the original spec included Express. One build output, one process, one deploy path.

---

## 3. Schema (`src/db/schema.ts`)

```
users              id, email, role enum('admin','user'), created_at
                   -- one row in v1; exists so multi-user is not a migration

sources            id, kind enum('channel','playlist'), youtube_id (unique),
                   title, url, last_polled_at, active, created_at

videos             id, youtube_id (unique), source_id (nullable — direct adds),
                   title, channel_title, published_at, duration_seconds,
                   view_count, thumbnail_url,
                   caption_status enum('unknown','available','none','failed'),
                   caption_checked_at, created_at

transcripts        id, video_id (unique), language, source enum('captions','manual','ai'),
                   word_count, content LONGTEXT, fetched_at

analyses           id, video_id, model, prompt_version,
                   summary TEXT, hook_breakdown TEXT, timeline JSON,
                   gaps JSON, ideas JSON,
                   input_tokens, output_tokens, cost_usd, created_at

outlines           id, analysis_id, idea_index, content TEXT, created_at

topics             id, name, slug (unique)
video_topics       video_id, topic_id            -- tagged at analysis time
                   -- nothing reads these in v1; they make §7 a filter, not a rebuild

spend_log          id, day (unique), cost_usd    -- drives the header counter + cap
```

Every ingest script uses idempotent upsert (`onDuplicateKeyUpdate` on `youtube_id`) so it is
safe to re-run.

---

## 4. The analysis contract

One prompt, versioned (`prompt_version` on the row) so old analyses stay interpretable when
the prompt changes. Model returns **strict JSON**, no prose, no markdown fences.

```json
{
  "summary": "...",
  "takeaways": ["...", "..."],
  "hook": { "technique": "...", "first_30s": "...", "why_it_works": "..." },
  "timeline": [{ "ts": "00:00", "topic": "...", "beat": "..." }],
  "gaps": [{ "gap": "...", "counter_angle": "..." }],
  "ideas": [{ "title": "...", "premise": "...", "why_now": "..." }]
}
```

Parse defensively — strip fences, `try/catch`, store raw response on parse failure and mark
the row `failed` rather than crashing the batch.

The outline generator (§2 `/api/analyze`, separate call) takes one `idea` and returns the
5-part structure: hook → re-hook/stakes → teaching points → counter-intuitive twist → CTA.

---

## 5. PR sequence

Each PR is self-contained, builds clean, and is independently reviewable.
**PR-01 is a gate — do not proceed past it if captions cannot be fetched from Hostinger.**

### Opus track (architecture, risk, contracts) — PR-01 → PR-07

| PR | Scope | Done when |
|---|---|---|
| **01** | `scripts/probe-captions.ts` spike. Given a URL, return caption text. Test locally AND on the Hostinger box. Document the working library/method and the failure mode. | A transcript prints from the Hostinger server. **GATE.** |
| **02** | Scaffold: Next.js 15 + Drizzle + MySQL per `nodejs-mysql-hostinger-stack` §1. `.env.example`, drizzle config, connection pool (`connectionLimit: 8`). | `npm run build` passes, DB connects. |
| **03** | Full schema (§3) + migrations + seed script. | Tables exist on Hostinger MySQL. |
| **04** | YouTube Data API client: resolve any URL → video / playlist / channel; fetch metadata; list uploads. Quota-aware with backoff. | `scripts/` can list a channel's uploads. |
| **05** | Caption pipeline: probe → fetch → store transcript → set `caption_status`. Handles the "no captions" path cleanly. | A playlist ingests, mixed available/none. |
| **06** | Analysis pipeline: transcript → Haiku 4.5 → validated JSON → `analyses` row. Prompt caching on. Token/cost recorded per row. | One video produces a stored analysis. |
| **07** | Spend guard: `spend_log`, monthly cap in env, refuse to start a batch that would exceed it. Batch API path for the poller. | Cap trips correctly in a test. |

### Sonnet track (UI, CRUD, polish) — PR-08 → PR-13

Handed off once the contracts above are frozen.

| PR | Scope |
|---|---|
| **08** | Dashboard shell: dark emerald/slate theme per `web-design-system`, header with spend counter, nav. |
| **09** | Digest feed: video cards with caption-status badge, filter/search, pagination. |
| **10** | Single analysis view: all five sections, copy-full-analysis button. |
| **11** | `/sources`: add/remove/pause tracked channels and playlists. |
| **12** | Ingest form: paste any URL or raw transcript, direct-analyse. |
| **13** | Outline generator UI: one click from an idea → stored outline → copy. |

### Final — PR-14

| PR | Scope |
|---|---|
| **14** | Hostinger cron → `/api/cron/poll` (shared-secret header). Deploy per `nextjs-deploy-hostinger`. Basic auth on the subdomain. |

---

## 6. Rules for autonomous PRs

- One PR = one row above. Do not merge scopes.
- Every PR ends with `npm run build` passing. Do not open a PR that does not build.
- Never commit `.env`. Update `.env.example` when adding a var.
- Do not change the schema in §3 or the JSON contract in §4 without flagging it explicitly
  in the PR description — those are the interfaces the two tracks share.
- No new external service. MySQL + the two APIs only.
- If PR-01's method breaks in a later PR, stop and report. Do not silently fall back to AI
  audio transcription — that is a 20x cost change and needs a human decision.

---

## 7. v2 — topic intelligence (design for it now, build it later)

"Give me insights on [topic] from everything I've indexed."

Because §3 stores `topics` / `video_topics` and every analysis is retained, this is a query
plus a synthesis prompt over stored analyses — not a re-ingest. Nothing in v1 reads those
tables; they exist so v2 is a feature, not a rewrite.

Intended topics are open-ended (web design with AI, using Claude well, SEO, local ranking,
AI video and content creation, and anything else). **No topic is hardcoded anywhere.**

## 8. v3 — multi-user / paid tier

The `users` table and the `role` enum exist from PR-03. The paid tier is where AI audio
transcription belongs: customers who want captionless videos pay the ~$0.18/video that the
owner declines to. That is the point at which the original spec's cost-approval modal
becomes worth building — for someone else's spend, not the owner's.

> **Update (Aug 2026):** the cheap fallback for captionless videos is now Gemini Flash via
> direct YouTube-URL ingestion, not classic audio transcription — see §11. Roles are pulled
> forward into round 2 (§9 Batch C); the paid *customer* tier (tenant scoping) stays here.

---

# Round 2 — deploy, fix, polish (planned Aug 2026)

Round 1 built the whole system but it has **never run against live YouTube or MySQL**.
Round 2 was planned after a full code + UX review (two independent reviewer passes).
Owner decisions already made — do not re-ask:

- AI analysis output stays **English**; a Swedish-output option is a cheap optional add
  (PR-22b), not a priority.
- Gemini captionless fallback is **deferred** (§11), revisit after the caption gate result.
- Roles = **owner + employee** now (Batch C); customer/tenant tier stays v3.
- Build sessions may **create and merge their own PRs when green** — full AFK mode.

## 9. PR sequence, round 2

Same rules as §6, plus: run `npm run typecheck && npm test && npm run build` before every
merge. One PR per row. Sequential *within* a batch (later rows touch the same files).

### Batch A — Opus 5: go live + correctness (do first, in order)

| PR | Scope | Notes |
|---|---|---|
| **A0** (no PR) | Run the caption gate on Hostinger (`docs/NEXT-PROMPTS.md` step 0), apply migration, seed, deploy per PR-14 runbook, basic auth, cron. | **Still the gate.** If it fails: stop, report, decide (residential proxy vs §11 Gemini fallback). |
| **15** | Batch lifecycle fixes: read the real error reason (`entry.result.error.error.type`, `batch.ts:155`); persist batch IDs at submit time (new `batches` table: id, provider_batch_id, status, submitted_at, collected_at) so an outage >24h can't strand a paid batch; collection walks stored IDs, not `batches.list()`. | Fixes two review findings. Schema addition approved. |
| **16** | Failed outline generations write a row (store `rawResponse` + error like `run.ts` does); share one `QuotaTracker` across a whole poll run (pass the client into `ingestRef` instead of constructing per source). | Fixes two review findings. |

### Batch B — Sonnet 5: product + UX (after Batch A merges)

| PR | Scope |
|---|---|
| **17** | **Analyze from the UI** (the top product gap — `/ingest` promises it, nothing implements it): "Analyze now" on the video page's not-analysed and failed states; analysis-status badge on feed cards (pending / analysed / failed) next to the caption badge; "Re-analyze with Sonnet" using the existing `{ model, force }` options; show estimated cost (~$0.02) on the button. |
| **18** | Route resilience: `loading.tsx`, `error.tsx`, `not-found.tsx` for every route; per-page `<title>` via `generateMetadata` (video title on `/video/[id]`); `loading="lazy"` on card thumbnails. |
| **19** | Read tracking: `read_at` (null = unread) and `pinned` columns on `videos` (single-user, so columns beat a join table — schema addition approved); mark-read on opening a video; unread/pinned filters and visual state on the feed; sort control (published / added / views). |
| **20** | CRUD polish: confirm before source delete; delete-video action (removes transcript/analyses too — confirm modal); edit source title; per-source video count + "polls hourly via cron" note on `/sources`; wire the existing `onProgress` callback into bulk-ingest so the form shows per-video progress instead of a frozen "Working…". |
| **21** | Search inside analyses (extend the feed `q` to also `LIKE` over `analyses.summary` and raw JSON of takeaways/ideas via join — no new infra); distinct success/info/error styling for the three ingest-result shapes; copy button on the failed-analysis raw response. |
| **22** | i18n + a11y: flat TS dictionary (`en`/`sv`) + `t()` helper + cookie-based toggle in the header — **no i18n library, no `[locale]` routing** (~70–90 strings, listed in the UX review); locale-aware date formatting (drop hardcoded `en-US` in `format.ts`); restore visible focus (`focus-visible:ring`) on the five inputs that removed it; `aria-live="polite"` on async form results. |
| **22b** | AI-output language *preparation* (owner decision: English is enough for now, but the code must be ready to add languages later): thread an optional `language` param (default `'en'`) through `AnalyzeOptions`, `buildUserPrompt`, and the outline prompt builder — when `'en'`, prompts are byte-identical to today (no `ANALYSIS_PROMPT_VERSION` bump needed); any other value appends a "respond in <language>" instruction and bumps the version. **No UI, no setting yet** — adding a language later becomes a one-line change. |

### Batch C — Opus 5: roles (after Batch B; needs A0 live so login can be tested for real)

| PR | Scope |
|---|---|
| **23** | Session auth: `/login` (email + password, bcrypt hash column added to `users`), httpOnly cookie session, `getSession()` / `requireUser()` helpers, logout, seed script sets the owner password. Replaces nothing — Hostinger basic auth can stay on top or be dropped once this is verified live. |
| **24** | Role gate: extend enum to `('owner','employee')` (migration from `admin`→`owner`, `user`→`employee`); `requireRole('owner')` at the top of every money-spending action (`submitIngest` analyse paths, `generateOutlineAction`) and destructive action (`removeSource`, delete video); employee keeps add/pause sources, metadata ingest, and all reads; hide owner-only buttons per role in the UI. **The permission boundary is spend, not CRUD.** |

## 10. Rules for round-2 autonomous PRs

Everything in §6 still applies, with these updates:

- Schema changes listed above (batches table, `read_at`/`pinned`, `password_hash`, role enum)
  are **pre-approved** — no need to stop and ask. Any *other* schema or §4-contract change
  still needs flagging.
- Merge your own PR once typecheck + tests + build are green. Sequential within a batch.
- End each batch with a short handoff note in `docs/` (new env vars, new routes, anything
  verified live vs only written), like rounds past.
- Report at the end: what was done, ideas noticed along the way, and honest risks/issues —
  the owner reads these.

## 11. Deferred — Gemini Flash fallback for captionless videos (v1.5)

Owner-approved direction, deliberately not built yet: for videos with `caption_status='none'`,
send the **YouTube URL directly to the Gemini API** (Flash tier), which can ingest public
videos and transcribe/analyse the audio — roughly a few cents per 30-min video, far below
the ~$0.18 classic-transcription estimate this plan used. Revisit **after** the A0 gate
result: if captions work from Hostinger, most videos never need this.

Prerequisite when built: introduce an `AnalysisProvider` interface first
(`analyze(transcript|url, opts) → { payload, usage, costUsd }`). The current analysis
package is hardcoded to the Anthropic SDK (structured output, `cache_control`, and
especially the Batch API flow have no Gemini equivalents), so this is a 1–2 day provider
abstraction + implementation, not a config flag. Verify Gemini media pricing at build time —
it has churned repeatedly in 2026. Needs a Google AI API key (new external service — §6
sign-off satisfied by this section).

Not worth doing yet: swapping the *transcript* analysis model to Gemini. At ~$12/month on
Haiku the ceiling on savings is a few dollars; the provider abstraction is only justified
by the captionless-fallback feature.
