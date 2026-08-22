# PR-35 — Gallringen, step 1: metadata screening

**What it does:** before the poll run pays ~$0.02 to analyse a transcript, it
spends ~$0.001 asking Haiku — from the free metadata already stored on `videos`
— whether that video is worth it. Videos scored below the bar leave the work
list that scheduled runs pay for. Nothing is deleted, nothing is marked failed,
and one click on a video's own page still buys its analysis.

## 1. Why this is the PR that pays for itself

PLAN.md §1 budgets ~$12/month for 20 videos a day at Haiku's rate, and it also
records the reason Sonnet was not chosen: 4x the price for a task that is not
reasoning-hard. Both of those hold only if every video in the corpus is worth
the same amount, and no channel produces videos that are worth the same amount.

The screen changes the arithmetic rather than the model. At a 50-point bar on a
typical channel mix, a third to a half of what a poll run would have analysed is
a reaction, a re-upload, an announcement, or a title with nothing behind it.
Screening 100 videos costs about a tenth of what analysing the ones it culls
would have. What it buys back is the option to spend the difference on the
videos that survive — which is what makes "Sonnet on the ones that matter"
affordable inside the same cap.

The break-even is printed by `npm run screen -- --dry-run`, so it is checkable
rather than asserted.

## 2. The three rules it is built on

**It fails open.** A video is culled only when a screening actually completed
and actually returned a readable score below the bar. Never screened, screening
failed, score null, screening disabled — all keep the video. This is why
`parseScreeningResponse` refuses a missing score instead of coercing one (unlike
the analysis parser, which coerces on purpose): a guessed score removes a video
from the corpus with a sentence explaining a judgement nobody made, and a
silently missing video is indistinguishable from one that was never ingested.
`isCulled()` in `lib/screening/policy.ts` and `notCulled()` in
`lib/screening/sql.ts` are the same rule in two languages and have to stay
identical.

**It stores a score, not a verdict.** The model is never told where the bar is.
`SCREEN_MIN_SCORE` is a spend dial the owner turns, and turning it re-decides
every video already screened for free — raising it culls more, lowering it hands
videos back, and neither costs an API call. A stored keep/skip would have made
every change of mind a re-screen of the whole corpus.

**It is not append-only.** `analyses` keeps its history because each row was
paid for and is an asset. A screening is a disposable opinion about a video
nobody has read yet, so `screenings` holds one current row per video and
re-screening replaces it.

## 3. What runs where

| Path | Behaviour |
|---|---|
| `npm run poll` / `/api/cron/poll` | Screens what has never been screened, then assembles the batch from what survives. Skipped on `--dry-run` (a run that submits nothing must buy nothing) and on `--no-screen`. |
| `npm run screen` | The same screen with a terminal attached. `--dry-run` prices it, `--all` re-screens videos that already carry a screening. |
| `npm run backfill` | Unchanged in code, culled in effect: it reads `findPendingVideos`, which now excludes culled videos. |
| A video's own page | Unaffected. The analyse button ignores the screen entirely — see §5. |
| The feed's bulk select | Culled videos get no checkbox, and `findPendingVideosByIds` refuses them server-side. |

Screening calls are interactive, not batched. The Batch API's 50% discount costs
hours of latency, and the whole value of a screen is that it happens *before*
the batch is assembled in the same run. A batched screen could only act on its
own results a run later, by which time the videos it meant to cull have been
submitted at full analysis price.

## 4. Cost, and what it is charged against

Every screening goes through `recordSpend`, so the monthly counter and the hard
cap see it exactly as they see an analysis. `screenVideos` checks the cap once
for the whole set before the first call, like `submitAnalysisBatch` — a cap
discovered halfway through a set is not something a caller can act on.

A cap that will not fund the screening will not fund the analysis either, so the
poll run swallows `SpendCapExceededError` from the screen and lets the analysis
path report it: one place says "over the cap", and it is the place with the
estimate in hand.

## 5. Where the override lives, and why it is there

A culled video keeps its analyse button. The gallring decides what the
*unattended* run spends; a person looking at one video and deciding it is worth
$0.02 is the case the filter exists to serve, not the case it exists to block.
The bulk-select path is the opposite — forty checkboxes are not forty decisions
— so it honours the cull on both the client and the server.

## 6. What this is *not*, and what step 2 would be

This is step 1 because the evidence is metadata only. A title and a description
are what the uploader chose to say about a video, which is a real signal and a
marketed one. Step 2 — not built, and not to be built until step 1 has run
against a real corpus — would screen on the first ~500 words of the transcript
for the videos step 1 is uncertain about, at a few tenths of a cent each. It is
a strictly better filter and a strictly worse first move: it is only worth
building once there are real scores to show which band of the range is actually
uncertain.

The other thing deliberately absent is any hardcoded topic or channel
allowlist. PLAN.md §7's rule — the corpus says what it is about, the code does
not decide in advance — applies here too. `SCREEN_INTERESTS` is the escape
hatch, and it is the owner's own sentences passed through verbatim rather than
a taxonomy chosen for them.

## 7. Verification, when this first runs for real

Nothing in this repo has ever run against the live API (`docs/HANDOFF-ROUND-3.md`
§1), and this PR spends money in a new place, so the first real run is the test:

1. `npm run screen -- --dry-run` — sanity-check the estimate before anything is
   bought.
2. `npm run screen -- --limit 20` — read the twenty reason strings. This is the
   only way to find out whether the bar is in the right place, and it is worth
   doing before an hourly cron starts culling unattended.
3. `npm run spend` — the screening cost should appear in the same counter as
   analyses, and the Anthropic console should agree.
4. If the reasons look right but the bar looks wrong, change `SCREEN_MIN_SCORE`
   and re-read the feed. No re-screening is needed; that is the point of storing
   the score.
