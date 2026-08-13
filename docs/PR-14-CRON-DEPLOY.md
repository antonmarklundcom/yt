# PR-14 — cron endpoint, deploy, and basic auth

What shipped in code, and the runbook for the parts that live in hPanel and can
only be done by someone logged into the Hostinger account.

---

## 1. What the code does

### `/api/cron/poll`

`src/app/api/cron/poll/route.ts`. `GET` and `POST` both work; cron uses `POST`.

- Authenticated by a shared secret, `CRON_SECRET`, sent as
  `x-cron-secret: <value>` or `Authorization: Bearer <value>`.
- The comparison is **constant time** (`src/lib/cron-auth.ts`): both sides are
  SHA-256'd and compared with `crypto.timingSafeEqual`. `===` short-circuits at
  the first differing byte and leaks the matching prefix length to anyone who
  can time the response. Hashing first also guarantees equal-length buffers —
  `timingSafeEqual` throws on mismatched lengths, and that throw would itself
  leak the secret's length.
- **Fails closed.** No `CRON_SECRET` set → `503`, never an open endpoint that
  spends money.
- It calls `pollSources()` in `src/lib/poll.ts` **directly**. It does not spawn
  `scripts/poll-sources.ts` — a second Node runtime on a shared Hostinger slot,
  for a job whose failures would be reduced to an exit code.

| Status | Meaning |
|---|---|
| `200` | Run completed. Body has `summary` (one line) and `result` (the full structured run). |
| `401` | Missing or wrong secret. |
| `402` | Monthly spend cap would be breached — working as designed, not a crash. |
| `409` | A poll is already running in this process; this invocation was skipped. |
| `500` | The run threw. Body carries the message. |
| `503` | `CRON_SECRET` is not set on the deployment. |

Query params: `?limit=N` (videos per source, default 10),
`?analyze=false` (ingest only), `?dry-run=true` (estimate, submit nothing).

### `src/lib/poll.ts`

The poll run, extracted from `scripts/poll-sources.ts` so the script and the
route share one implementation. The script is now a formatter over the same
function and its behaviour is unchanged, including the exit-3-on-spend-cap
convention.

**Two behaviours are new, because PR-14 is what makes the poll unattended:**

1. **Finished batches are collected at the start of every run.** Previously a
   human ran `backfill.ts --collect <id>`. An hourly cron with nobody watching
   would otherwise submit work forever and never read any of it back.
2. **A run refuses to submit while another batch is still `in_progress`.**
   Videos stay "pending" until their batch's results are written, so the next
   hourly run would re-submit the same transcripts and pay for them twice.
   Nothing records a batch id at submission time (`analyses.batch_id` is only
   written at collection), so the Anthropic batches API is the ledger; only the
   last 24 h is considered, which is the API's own batch ceiling.

This assumes `ANTHROPIC_API_KEY` is dedicated to this app. A key shared with
another project would list that project's batches too. Nothing is
mis-attributed — results are matched by the `video-` `custom_id` prefix — but an
unrelated in-flight batch would postpone a submission by one run.

---

## 2. Deploy (hPanel — needs Hostinger login)

Per the `nextjs-deploy-hostinger` skill. This app uses **Hostinger's own MySQL +
Drizzle**, not Neon/Prisma, so §6a of that skill applies, not §2.

1. Merge this branch to `main` — Hostinger builds a branch, and `main` is
   the cleaner target than a `claude/...` branch.
2. hPanel → **Websites → Add Website → Node.js Apps → Import Git Repository** →
   authorize GitHub → `antonmarklundcom/yt`, branch `main`.
3. Confirm the detected settings: framework Next.js, build `npm run build`,
   start `npm start`.
4. **Environment variables** (hPanel → the app → Environment Variables). Paste
   only the raw value into the Value field — pasting `KEY=value` there produces
   `ERR_INVALID_URL` with the var name visible inside the error's `input`.

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://user:pass@localhost:3306/dbname` — **`localhost`** for the live app, not the Remote MySQL host |
   | `YOUTUBE_API_KEY` | Google Cloud key with YouTube Data API v3 enabled |
   | `ANTHROPIC_API_KEY` | console.anthropic.com |
   | `MONTHLY_SPEND_CAP_USD` | `25` |
   | `CRON_SECRET` | `openssl rand -hex 32` — keep a copy for the cron command |
   | `CAPTION_STRATEGIES` | only after a **passing** `npm run probe:captions` on the box; set it to what that run prints |

   Env var changes require a **redeploy**, not a restart.
5. Deploy, then map the subdomain (§4 below) and redeploy if anything
   URL-shaped changed.

### Migrations — run from a local machine, not Hostinger SSH

Nothing in the app runs migrations at boot. Whoever deploys must run them once:

```
# hPanel → Databases → Remote MySQL → whitelist your current public IP first
export DATABASE_URL='mysql://user:pass@srv####.hstgr.io:3306/dbname'
npm run db:migrate
npm run db:seed          # writes the single v1 user from ADMIN_EMAIL
```

`drizzle-kit` auto-loads `.env`; **`tsx` does not** — export `DATABASE_URL` in
the shell before `db:seed`, or it silently falls back to `localhost` and throws
`ECONNREFUSED`.

---

## 3. Cron

hPanel → **Advanced → Cron Jobs → Create**. Hourly (`0 * * * *`):

```
curl -fsS -m 900 -X POST -H "x-cron-secret: YOUR_CRON_SECRET" \
  https://SUBDOMAIN.example.com/api/cron/poll
```

- Point it at the **app URL**, not the basic-auth-free origin — see §4; if basic
  auth covers `/api/`, add `-u user:pass` as well.
- `-f` makes curl exit non-zero on `4xx`/`5xx`, so a failed poll shows up in the
  cron mail instead of passing silently.
- `-m 900` caps the run at 15 minutes. The endpoint submits the batch and
  returns; it does not wait for results (the next run collects them), so a
  healthy run is well under this.
- A `402` in the cron mail means the monthly cap stopped the run. That is the
  spend guard doing its job (PLAN.md §0), not a fault.

Verify by hand once the app is live:

```
curl -i -X POST -H "x-cron-secret: YOUR_CRON_SECRET" \
  https://SUBDOMAIN.example.com/api/cron/poll
curl -i -X POST https://SUBDOMAIN.example.com/api/cron/poll     # expect 401
```

---

## 4. HTTP basic auth on the subdomain (Hostinger level, not in the app)

PLAN.md §0: v1 is a single user behind basic auth on a non-obvious subdomain,
with **no login screen in the app**. Nothing in the codebase implements auth for
the UI, deliberately — do not add middleware for this.

1. Point a non-obvious subdomain at the app (hPanel → Domains → Subdomains, then
   map it in the app's settings; SSL is issued automatically). Don't use
   `yt.` or `videos.` — the whole protection model is that the host is not
   guessable.
2. hPanel → **Advanced → Password Protect Directories** (or the equivalent
   `.htaccess`/`.htpasswd` control for the site), applied to the site root.
3. Verify: a browser at the subdomain prompts for credentials, and
   `curl -i https://SUBDOMAIN...` returns `401` with a `WWW-Authenticate:
   Basic` header.

**Interaction with the cron endpoint.** If basic auth covers the whole site,
`/api/cron/poll` is behind it too and the cron command needs `-u user:pass` in
addition to the secret header. Two credentials on one request is fine — belt and
braces on the only endpoint that spends money. If instead you exclude `/api/`
from basic auth, the `CRON_SECRET` check is the only thing protecting it, which
is why that check fails closed.

---

## 5. Post-deploy checklist

Ordered so a failure stops you before the next step wastes money.

- [ ] **The PR-01 gate.** `npm run probe:captions` **on the Hostinger box**.
      Still never run (see `docs/HANDOFF-OPUS.md` §2). Everything downstream
      assumes free captions; the fallback costs ~20×. If it fails, stop and
      re-plan — do not enable the cron.
- [ ] `npm run db:migrate` + `npm run db:seed` applied to Hostinger MySQL
- [ ] App loads on the Hostinger URL, then on the subdomain with valid SSL
- [ ] Basic auth prompts on the subdomain
- [ ] `/api/cron/poll` returns `401` without the secret, `200` with it
- [ ] Cron job created, first run's mail is clean
- [ ] One real channel ingested from `/ingest`; an analysis is stored and the
      header's spend counter shows a real number
- [ ] Slot recorded: which account (LATAM/EU/USA), slots remaining
