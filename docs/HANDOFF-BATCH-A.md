# Handoff — Batch A (round 2)

Status as of this commit. **Batch A is partially complete**: the two code rows
are merged, the A0 go-live row is blocked on credentials only the owner has.

| Row | State |
|---|---|
| **A0** — caption gate, migrate, seed, deploy, basic auth, cron | **NOT DONE.** Blocked on Hostinger SSH + MySQL credentials + the two API keys. Command sheet in §3 below. |
| **PR-15** — batch lifecycle fixes | Merged (#19). Written and tested, **not run against the real API**. |
| **PR-16** — outline failure rows, shared quota tracker | Merged (#20). Written and tested, **not run against the real API**. |

`main` is green: `npm run typecheck`, `npm test` (41 pass), `npx eslint .`,
`npm run build`.

---

## 1. Verified LIVE vs only written

**Verified live: nothing.** No code in this batch has touched a real database,
the YouTube Data API, or the Anthropic API. Every claim below is "the tests
pass and the build is clean", which is not the same thing.

This is the honest state of the whole project, not just of this batch — the app
has still never run against a real deployment. The caption gate (PLAN.md §0's
central assumption, that captions are fetchable from a datacenter IP) remains
**unrun**. Treat the cost model as unvalidated until A0 says otherwise.

Only written, never executed:

- The `batches` ledger — no batch has ever been submitted, so no row exists.
- `batchFailureReason()` — unit-tested against the SDK's declared types, never
  against a real provider error payload.
- Outline failure rows — no outline has ever been generated.
- The shared `QuotaTracker` — no poll run has ever happened.

## 2. New env vars

**None.** Batch A introduced no new configuration. `.env.example` is unchanged
and still complete.

## 3. A0 command sheet — what the owner needs to run

Two of these need credentials; none of them need a developer.

### 3a. The gate (do this first — it can legitimately fail)

SSH into the Hostinger box (hPanel → Advanced → SSH Access for the host, port
and username), then:

```bash
cd domains/YOURDOMAIN/public_html      # wherever the repo is checked out
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
npm install && npx tsx scripts/probe-captions.ts; echo "EXIT: $?"
```

The `export PATH` line is not optional — Hostinger's SSH shell has no `npm` on
its default PATH.

- **EXIT: 0** → the cost model holds. Set `CAPTION_STRATEGIES` in hPanel to the
  value the probe prints, and continue to 3b.
- **EXIT: 1** → **stop.** This is a business decision, not a bug to code around:
  the options are a residential proxy or pulling the Gemini Flash fallback
  (PLAN.md §11) forward from round 3. Paste the full output into a session and
  decide; do not let anything "work around" it.

### 3b. Schema and seed

From a machine whose public IP is whitelisted in hPanel → Databases → Remote
MySQL (**not** from Hostinger SSH — the live app uses `localhost`, a remote
client uses the `srv####.hstgr.io` host):

```bash
export DATABASE_URL='mysql://user:pass@srv####.hstgr.io:3306/dbname'
export ADMIN_EMAIL='you@example.com'
npm run db:migrate
npm run db:seed
npm run db:check          # expect 14 tables
```

Two migrations are pending and both are safe — `0001` creates `batches`,
`0002` adds two columns to `outlines`. No data movement, nothing destructive.

`drizzle-kit` auto-loads `.env`; **`tsx` does not.** Export `DATABASE_URL` in
the shell before `db:seed` or it silently falls back to `localhost` and throws
`ECONNREFUSED`.

### 3c. Deploy, basic auth, cron

Follow `docs/PR-14-CRON-DEPLOY.md` §2–§4 unchanged. The env var table there is
still accurate — nothing was added.

Two Hostinger traps that have already cost time on this stack:

- Env var changes need a **redeploy**, not a restart.
- Changing the MySQL password without updating `DATABASE_URL` breaks the live
  app into a generic "Application error" page with no useful log.

## 4. What Batch B needs to know

- **The schema moved.** `batches` is new; `outlines` gained `status` and
  `error`. Import from `src/db/schema.ts`, never redeclare.
- **`outlines` rows are no longer all successes.** Anything reading `outlines`
  must filter `status = 'ok'`, as `src/app/video/[id]/page.tsx` now does. A
  failed row has `content = null` and an `error` string.
- **`ingestRef` takes an optional `client`.** Any caller that ingests more than
  one ref in a single process must build one `YouTubeDataClient` and pass it to
  all of them, or the quota guard goes blind again.
- **PR-17 is the biggest product gap** and is unaffected by anything here:
  `analyzeVideo()` exists and works, and nothing in the UI calls it.
- **The `analysis-status` badge PR-17 needs** can read `analyses.status`
  directly; failed analyses have carried `status`/`error`/`rawResponse` since
  round 1, and now outlines match that convention.

## 5. Risks

- **The gate is still the project's single point of failure.** Everything
  downstream — the cost model, the hourly cron, PLAN.md §1's ~$12/month — rests
  on an assumption that has never been tested from the machine that matters.
- **Batch C cannot be fully verified without A0.** PR-23's "verify login works
  on the LIVE deployed app" is not satisfiable while nothing is deployed.
- **Two unexercised recovery paths.** The stranded-batch recovery in PR-15 and
  the outline-failure rows in PR-16 are both code that only runs when something
  else has already gone wrong. They are tested, but the first real proof will be
  the first real failure.

## 6. Ideas noticed, deliberately not built

Per PLAN.md's scope rule these are written down, not built. Round-3 candidates:

1. **The spend cap has no ledger of committed-but-unbilled money.** A submitted
   batch is charged to `spend_log` only when its results are collected, so
   between submit and collect the cap under-counts by the whole batch. `batches`
   now stores `estimated_usd`, so `spendStatus()` could subtract open batches
   and make the cap honest. This is a small change and a real correctness gap.
2. **Nothing ever cancels or ages out an open batch row.** A provider batch that
   is deleted server-side leaves a row that is retried on every poll forever.
   A `submitted_at` age check that marks a row `canceled` after, say, 72 hours
   would bound it. Currently harmless (one failed retrieve per run) but noisy.
3. **`analyses` has no unique constraint on (video_id, batch_id).** Collection
   is idempotent by design — it marks `collected` only after writing everything
   — but a partial write followed by a retry inserts duplicate rows for the
   videos that succeeded the first time. Append-only makes this visible rather
   than corrupting, but a dedupe on read or a constraint would be cleaner.
4. **`probe-captions` results are not stored.** The gate's answer is the most
   load-bearing fact in the project and it lives only in a terminal scrollback.
   A row recording when it last passed, and from which host, would make the
   caption strategy auditable instead of folkloric.
