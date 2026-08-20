# Handoff — round 3, and what is left to code

**Merged this session: PR-25 → PR-32** (#32–#39). All of it is code-only — no new
credentials, no new env vars, one migration.

`main` is green: `npm run typecheck`, `npm test` (86 pass), `npx eslint .`,
`npm run build`.

| PR | Scope | Why it was worth doing now |
|---|---|---|
| **25** (#32) | Per-user read state: `video_reads`, migration 0006 | Cheap before a second account exists, awkward after |
| **26** (#33) | Spend cap counts committed batch money | The cap under-counted by a whole batch between submit and collect |
| **27** (#34) | Abandon batches unreadable for 72h, billing their estimate | After PR-26 a stranded row holds cap space forever |
| **28** (#35) | Bulk "analyse selected" on the feed | Forty pending videos meant forty page visits |
| **29** (#36) | Show failed outline generations | PR-16 stored them; the page filtered them out |
| **30** (#37) | Say why a video matched a search | An analysis hit looked identical to a title match |
| **31** (#38) | `deleteVideo` in one transaction | The only multi-table delete in the app |
| **32** (#39) | Re-collection skips rows it already wrote | Duplicate rows **and** a second charge to the spend counter |

---

## 1. Still true: nothing here has ever run

No login has succeeded or failed, no migration has run, no batch has been
submitted, collected, or abandoned, and no analysis has been paid for. Round 3
adds more code around the same unverified core. Two consequences worth holding
on to:

- **PR-26/27/32 change how money is counted.** They are the kind of correctness
  that only proves itself against real spend. The first real `npm run spend`
  after the first real batch is the moment to check that Billed + Committed adds
  up to what the Anthropic console says.
- **PR-28 submits real batches from a button.** It refuses while any batch is
  open and re-filters ids server-side, but the first click is still the first
  time this path has ever run.

## 2. Migrations — still six, unchanged since PR-25

Round 3 added no schema. `docs/HANDOFF-BATCH-C.md` §3 is current: 0001–0006,
`0005` rewrites role data, `0006` moves read state and **must run after 0005**.
`npm run db:check` should report **11 tables**.

## 3. A correction to `HANDOFF-BATCH-B.md` §7

That list said `topics` and `video_topics` "are written at analysis time and
nothing reads them". **Nothing writes them either.** The analysis contract
(`src/lib/analysis/contract.ts`, marked FROZEN) has no topics field; the only
per-segment `topic` strings live inside `timeline` entries. A `/topics` page is
therefore not the small UI job that note implied — see §4.

## 4. What is left to code, and why none of it was done today

Everything below is deliberately not built. Each needs a decision that is the
owner's, not a coding session's.

1. **Topic intelligence (PLAN.md §7).** Needs one of: a change to the frozen
   analysis contract plus a `ANALYSIS_PROMPT_VERSION` bump (which means
   re-analysing the corpus to get topics for videos already stored — real
   money), or deriving topics from `timeline[].topic`, which is noisy per-segment
   labelling rather than subject tagging. PLAN.md §7 calls this v2 explicitly.
   **Decide: pay to re-analyse, or accept noisy derived topics, or leave it.**
2. **"Queued in a batch" on the analysis badge.** A video sitting in an open
   batch looks identical to one nobody has touched. Batch membership is not
   stored anywhere — `analyses.batch_id` is written at *collection* time — so
   this needs a `batch_videos` table (or a column on `videos`), which is a schema
   change outside PLAN.md §10's pre-approved list.
3. **Unique constraint on `analyses (video_id, batch_id)`.** PR-32 closed the
   duplicate-row hole from the read side, which is where the double-charge came
   from. The constraint would close it from the write side too. It is a
   migration, and it needs a decision about what to do with any duplicates a
   real database already holds.
4. **Storing the caption-gate result.** The most load-bearing fact in the
   project still lives only in terminal scrollback. A row recording when the
   probe last passed and from which host needs a table.
5. **Session revocation.** Rotating `SESSION_SECRET` is still the only way to
   sign anyone out, and it signs out everyone. Fine for one user; worth
   revisiting the moment a second account exists.
6. **User management.** PR-25 made a second account *safe* to create; it is
   still an INSERT plus a bcrypt hash by hand. A one-page owner-only "add
   employee" form is a small job, but PLAN.md does not ask for it and it is the
   kind of thing worth wanting before building.
7. **Batch language.** The batch path is English-only by design (PR-22b): the
   collecting run has no memory of what the submitting run asked for, so a
   multilingual batch needs a `language` column on `batches`.

## 5. The next session, if it is a coding one

Read this file, then `docs/HANDOFF-BATCH-C.md` §4 (the go-live sequence, still
the priority). If A0 has happened, the highest-value work is verification rather
than features: run the real flows, compare `npm run spend` against the Anthropic
console, and fix what the first real run exposes.

If A0 has not happened and the answer is still "more code", pick from §4 above —
but every item there starts with a decision, so bring the decision rather than a
prompt to "keep going".

## 6. If it is not a coding session

The gate, the migrations and the deploy are in `docs/HANDOFF-BATCH-C.md` §4,
in order, with the exact commands. Three things that will bite in that order:

- **The caption gate can legitimately fail.** That is a business decision
  (residential proxy vs. pulling PLAN.md §11's Gemini fallback forward), not a
  bug to code around.
- **A forgotten `SESSION_SECRET` looks exactly like a broken deploy.** Every
  request redirects to `/login` and the login page cannot issue a session. It is
  the first thing to check.
- **`tsx` does not auto-load `.env`.** Export `DATABASE_URL`, `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` in the shell before `npm run db:seed`, or it falls back to
  localhost and throws ECONNREFUSED.
