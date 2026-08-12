# Next steps — what to run, and which model

Opus track (PR-01 → PR-07) is merged. `main` is at the handoff commit.
Zero open pull requests.

---

## Step 0 — the gate (do this first, it is not a prompt)

On the Hostinger box:

```bash
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
npm install && npx tsx scripts/probe-captions.ts
```

- **Exit 0** → the cost model holds. Continue to step 1.
- **Exit 1** → stop. Paste the output into a new Opus session. The fallback
  (AI audio transcription) is ~20x the cost, so this is a business decision,
  not a coding task.

Also apply the schema once, from a machine whose IP is whitelisted in
hPanel → Remote MySQL:

```bash
export DATABASE_URL='mysql://user:pass@host:3306/dbname'
npm run db:migrate
export ADMIN_EMAIL='you@example.com'
npm run db:seed
npm run db:check      # should list 9 tables
```

---

## Step 1 — Sonnet 5 · PR-08 → PR-13 (the UI)

Paste into a new session:

> Read `PLAN.md` and `docs/HANDOFF-SONNET.md` in the repo root. The handoff note
> is written for you and is self-contained — you should not need to read the
> merged PRs.
>
> Read the `web-design-system` skill before writing any markup.
>
> Your job is PR-08 through PR-13 (the Sonnet track in §5). One PR per row, in
> order, each building clean before you open the next. Create and merge each PR
> yourself — you have my permission, don't wait on me.
>
> The §3 schema and §4 JSON contract are frozen. Import types from
> `src/db/schema.ts` and `src/lib/analysis/contract.ts` instead of redeclaring
> them, and reuse `spendStatus()`, `ingestUrl()` and `analyzeVideo()` instead of
> reimplementing them.
>
> Stop and ask me only if: you need to change the schema or the JSON contract, a
> PR needs a new external service or paid dependency, or you find that something
> in PR-01→07 is actually broken rather than merely unrun.
>
> The database is empty, so treat empty states as first-class — that is what I
> will see on day one. Do not seed fake data into the app.
>
> When PR-13 is merged, write a short note listing every new env var, every new
> route, and anything PR-14 needs to know about deployment.

## Step 2 — Opus 5 · PR-14 (deploy and go live)

Paste into a new session:

> Read `PLAN.md`, `docs/HANDOFF-SONNET.md`, and the note the previous session
> left after PR-13. Read the `nextjs-deploy-hostinger` skill.
>
> Your job is PR-14: Hostinger cron → `/api/cron/poll` with a shared-secret
> header, deploy per the skill, and HTTP basic auth on the subdomain. Then get
> the app actually live end to end — migration applied, a real channel ingested,
> a real analysis stored, the spend counter showing a real number.
>
> Compare the cron secret in constant time. Never commit `.env`.
>
> Report honestly what is verified live versus what is only written. If the
> PR-01 caption gate has still not been run from the server, say so rather than
> assuming it works.

---

## Which model, and why

| Work | Model | Reason |
|---|---|---|
| PR-08 → PR-13 (UI) | **Sonnet 5** | Contracts frozen, handoff note thorough, and the one API integration (PR-13's outline generator) has a working pattern to copy in `src/lib/analysis/run.ts`. Squarely Sonnet's strength, ~1/3 the cost. |
| PR-14 (deploy, auth, cron) | **Opus 5** | Where the real risk lives: Hostinger's env-var and password traps, basic auth, a constant-time secret compare, and live debugging of a system that has never run. PR-08→13 either compiles or does not; PR-14 is where you hit a bare "Application error" page with no useful log and need judgment. |
| If the gate fails | **Opus 5** | A re-plan, not an implementation task: residential proxy vs. a different slot vs. accepting ~$108/month for audio transcription. |

**Expectation to set:** two sessions gets you a working MVP, but "working" is
bounded by the gate. If captions cannot be fetched from Hostinger you will have
a correct, well-built, empty app — and the fix is a business decision, not more
code.
