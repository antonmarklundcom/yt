# Handoff — Batch C (round 2), and the corrected go-live sheet

**All of round 2's code is merged**, plus PR-25. PR-15 → PR-25, every row in
PLAN.md §9 except A0 — which is not a coding task and has still not been done.

`main` is green: `npm run typecheck`, `npm test` (67 pass), `npx eslint .`,
`npm run build`.

| PR | Scope | State |
|---|---|---|
| **23** | Session auth: login, signed cookie, middleware gate | Merged (#29) |
| **24** | Role gate: owner/employee, spend boundary | Merged (#30) |
| **25** | Per-user read state: `video_reads` table, migration 0006 | Merged |

---

## 1. Verified LIVE vs only written

**Nothing in this project has ever run against a real database, the YouTube
Data API, or the Anthropic API.** That has been true since PR-01 and is still
true. For Batch C specifically it means:

- **No login has ever succeeded or failed.** PLAN.md §9 said Batch C "needs A0
  live so login can be tested for real" — it was built anyway, on the reasoning
  that untested code that exists is worth more to A0 than an empty branch, but
  the verification is genuinely outstanding.
- **The middleware has never redirected anyone.** Its fail-closed branch (no
  `SESSION_SECRET` → redirect to `/login`) is the one most likely to bite, and
  it will bite on the first deploy that forgets the variable. That is the
  intended behaviour, not a bug — but it will look like a broken deploy.
- **Migration 0005 has never run.** It is hand-written specifically because the
  generated version would have destroyed the role column (§3 below). Read it
  before applying it.
- **No employee user exists.** The role gate has only ever been exercised as
  "owner", because the seed creates exactly one owner. Creating a second user
  today means an INSERT by hand; there is no user-management UI, and PLAN.md
  does not ask for one.

## 2. New env vars (both from PR-23)

| Var | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | **YES** | ≥32 chars. The app fails closed without it: every request redirects to `/login` and nobody can get in. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD` | no | Seed-only. Sets/resets the owner's login password, ≥12 chars. Omit on a re-run to leave the stored hash untouched. |

`.env.example` documents both. Remember Hostinger needs a **redeploy**, not a
restart, for env changes to take effect.

## 3. Migrations pending — six, not two

A0 in `docs/HANDOFF-BATCH-A.md` said two. Round 2 added three more, and PR-25 a
sixth:

| File | Effect | Risk |
|---|---|---|
| `0001` | `batches` table | none, additive |
| `0002` | `outlines.status`, `outlines.error` | none, additive |
| `0003` | `videos.read_at`, `videos.pinned`, 3 indexes | none, additive |
| `0004` | `users.password_hash` (nullable) | none, additive |
| `0005` | role enum `admin`/`user` → `owner`/`employee` | **rewrites data** |
| `0006` | `video_reads` table; backfill; drops `videos.read_at`/`pinned` | **moves data** |

**0005 is the only one that touches existing rows.** It widens the enum to all
four values, remaps `admin`→`owner` and `user`→`employee`, then narrows it. It
is hand-written because `drizzle-kit generate` emitted only the final
`MODIFY COLUMN`, which MySQL cannot apply to rows holding values the new enum
does not contain — it fails in strict mode and blanks every role otherwise.
On a database that has never been seeded there is nothing to remap and it is a
no-op with extra steps.

**0006 is hand-edited for the same class of reason.** drizzle-kit emitted the
`CREATE TABLE` and the two `DROP COLUMN`s with nothing in between — a correct
schema diff and a wrong migration, since it discards every existing read and pin.
The `INSERT … SELECT` in the middle copies them to the owner(s) first, and it has
to stay before the drops. **0006 must run after 0005**, because the backfill
selects `users.role = 'owner'` — a value 0005 is what creates.

`npm run db:check` should report **11 tables** — 0006 adds `video_reads`;
0003/0004/0005 add columns, not tables.

## 4. The corrected A0 sequence

Supersedes `docs/HANDOFF-BATCH-A.md` §3, which predates PR-23/24.

### 4a. The gate (unchanged, still first, can legitimately fail)

```bash
cd domains/YOURDOMAIN/public_html
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
npm install && npx tsx scripts/probe-captions.ts; echo "EXIT: $?"
```

Exit 0 → set `CAPTION_STRATEGIES` in hPanel to the printed value and continue.
Exit 1 → **stop**; that is a business decision (residential proxy vs. pulling
PLAN.md §11's Gemini fallback forward), not a bug to code around.

### 4b. Schema and seed — now with a password

From a machine whose IP is whitelisted in hPanel → Remote MySQL:

```bash
export DATABASE_URL='mysql://user:pass@srv####.hstgr.io:3306/dbname'
export ADMIN_EMAIL='you@example.com'
export ADMIN_PASSWORD='<at least 12 characters>'   # NEW — this is your login
npm run db:migrate     # applies all five
npm run db:seed        # creates/updates the owner and sets the password
npm run db:check       # expect 11 tables
```

`drizzle-kit` auto-loads `.env`; **`tsx` does not** — export the vars in the
shell or `db:seed` silently falls back to localhost and throws ECONNREFUSED.

### 4c. Deploy

Follow `docs/PR-14-CRON-DEPLOY.md` §2–§4, **plus `SESSION_SECRET` in the env
var table**. Without it the deployed app redirects every request to `/login`
and the login page itself cannot issue a session — which looks exactly like a
broken deploy and is the first thing to check if that happens.

Hostinger basic auth can stay on top of the session login or be dropped once
the login is confirmed working; they are independent layers.

### 4d. First real run

```bash
npm run ingest '<a channel URL>'
npm run analyze -- --pending
npm run spend
```

This is the moment the cost model stops being arithmetic. Compare
`npm run spend` against the ~$0.02/video figure in PLAN.md §1 — the correction
in §1.4 says prompt caching does not engage, so budget ~$12/month, not $6.

## 5. Risks

- **The gate remains the single point of failure.** Round 2 built a better
  app around an assumption that has still never been tested from the machine
  that matters.
- **A forgotten `SESSION_SECRET` locks you out of your own tool.** By design,
  and worth knowing before it happens at 11pm.
- **No session revocation before expiry (30 days).** Rotating the secret is the
  only revocation, and it signs out everyone. Fine for one user; worth
  revisiting if a second person ever gets an account.
- ~~Read state is shared across users.~~ **Fixed by PR-25** — `read_at`/`pinned`
  are rows in `video_reads` keyed `(video_id, user_id)`, so an employee's reading
  no longer marks yours. Migration 0006 carries the existing state over to the
  owner. Like everything else here, it has never run against a real database.
- **`deleteVideo` is not transactional** (see `docs/HANDOFF-BATCH-B.md` §6).

## 6. What is left, honestly

Nothing in PLAN.md §5 or §9 is unbuilt except **A0**, which needs credentials
only the owner has. Beyond that the plan's own remainders are:

- **§7 topic intelligence** — `topics`/`video_topics` are written at analysis
  time and nothing reads them; `/topics` does not exist.
- **§11 Gemini Flash fallback** for captionless videos — deliberately deferred
  until the gate result is known, and gated behind an `AnalysisProvider`
  abstraction that does not exist yet.
- **Nothing revokes a session** (see the risk above), and there is still no
  user-management UI: a second account is an INSERT by hand plus a password hash.
  PR-25 makes that account safe to create; it does not make it easy.
- The round-3 candidates in `docs/HANDOFF-BATCH-A.md` §6 and
  `docs/HANDOFF-BATCH-B.md` §7. The two I would pick first: the spend cap does
  not count submitted-but-uncollected batches (a real correctness gap, and
  `batches.estimated_usd` already holds what it needs), and there is no bulk
  "analyse selected" on the feed, which is the difference between one click and
  forty after the first big ingest.
