# YouTube Intelligence Workspace

A private research tool. It ingests YouTube videos, playlists and channels, pulls
their **existing captions**, runs a structured AI analysis once, and stores the
result forever. You read digests instead of watching videos.

Full specification: [`PLAN.md`](./PLAN.md).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Drizzle ORM · MySQL
(Hostinger) · tsx for scripts.

## Status

| PR | Scope | State |
|---|---|---|
| 01 | Caption extraction spike — **the gate** | Built; **awaiting a Hostinger run** |
| 02 | Next.js + Drizzle + MySQL scaffold | Merged |
| 03 | Schema, migrations, seed | Merged (not yet applied to Hostinger MySQL) |
| 04 | YouTube Data API client | Merged |
| 05 | Caption pipeline | Merged |
| 06 | Analysis pipeline | Merged |
| 07 | Spend guard + Batch API | Merged |
| 08–13 | UI (Sonnet track) | Merged |
| 14 | Cron, deploy, basic auth | Merged (code only — **not yet deployed**) |

**Round 2** (deploy + fixes + UX + i18n + roles) is planned — see `PLAN.md` §9.
Nothing has run against live YouTube or MySQL yet; the caption gate below is still
the first step.

## Commands

```bash
npm run probe:captions    # PR-01 gate — run this on Hostinger first
npm run db:check          # verify the database connection
npm run db:migrate        # apply the schema
npm run db:seed           # create the single v1 user (needs ADMIN_EMAIL)
npm run ingest '<url>'    # add a video, playlist or channel
npm run analyze -- --pending
npm run poll              # poll tracked sources, submit a batch
npm run backfill          # analyse everything pending
npm run spend             # month-to-date vs cap
npm test                  # 23 unit tests, no network or database needed
```

## The gate

Everything downstream assumes caption text is free. That assumption is only true
if captions can be fetched **from the Hostinger server IP** — YouTube blocks
datacenter ranges aggressively, and the fallback (AI audio transcription) costs
roughly 20× more.

```bash
npm install
npx tsx scripts/probe-captions.ts
```

Exit 0 = gate open. Exit 1 = stop and report. See
[`docs/PR-01-CAPTIONS.md`](./docs/PR-01-CAPTIONS.md).

## Cost model

Captions-only, Haiku 4.5, analyse-once-store-forever, Batch API on the poller:
**~$6–12/month** at 10 h/day of video. Audio transcription instead would be
~$108/month. That gap is why PR-01 is a gate and not a task. See `PLAN.md` §1.
