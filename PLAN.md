# YouTube Intelligence Workspace — Build Plan

**Status:** planning complete, not started
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
