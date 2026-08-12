# PR-06 — Analysis pipeline

Transcript → Haiku 4.5 → validated JSON → `analyses` row, with tokens and cost
recorded per row. Implements `PLAN.md` §5 row 06 against the frozen §4 contract.

## Two findings that affect the §1 cost model

### 1. Prompt caching does not currently engage on Haiku 4.5

`PLAN.md` §1.4 assumes prompt caching on the analysis system prompt: *"The
template is identical across every video; cache hits cost 10% of base input."*

The mechanism works, but it has a floor. **The minimum cacheable prefix on
Haiku 4.5 is 4,096 tokens.** Below that, `cache_control` is silently ignored —
no error, no warning, just `cache_creation_input_tokens: 0`. The system prompt
in `src/lib/analysis/prompt.ts` is roughly 500 tokens, so **caching is
requested but never engages.**

This is not a code bug and there is nothing to fix in this PR. It is a cost
assumption that does not hold, and the honest response is to measure rather
than pad the prompt to 4,096 tokens purely to make caching activate — that
would add ~3,600 tokens of filler to *every* call to save 90% on a prefix that
is small to begin with. The arithmetic is unfavourable, so caching stays
requested-but-inactive.

**Impact is small.** The system prompt is ~500 of roughly 7,500 input tokens per
video; caching it perfectly would save ~$0.0004 per video, about 2% of the
~$0.02 figure. The §1 monthly estimate stands.

`scripts/analyze.ts` prints `cache inactive` per row and a closing note, so this
is visible in every run rather than buried here. If the prompt later grows past
4,096 tokens, caching begins working with no code change.

### 2. Structured outputs replace fence-stripping as the primary defence

`PLAN.md` §4 specifies parsing defensively: strip fences, `try`/`catch`, store
the raw response on failure. Since that was written, **Haiku 4.5 supports
structured outputs** — `output_config.format` with a JSON schema constrains the
model to the §4 shape rather than merely asking for it in the prompt.

Both are implemented. Structured outputs are the primary mechanism; the
defensive parser in `src/lib/analysis/parse.ts` remains as a backstop, because
"should never fire" is not a property a nightly batch should depend on.

**No contract change.** The JSON schema is generated from the same §4 shape, and
`SchemaMatchesContract` in `prompt.ts` is a compile-time assertion that the two
agree.

## What gets stored

One row per analysis run, append-only — re-analysing with a different model or
prompt version inserts a new row rather than overwriting (§1.3: "analyse once,
store forever" only holds if history is not destroyed).

Four token counts are recorded separately: `input_tokens` is the **uncached
remainder only**, so total prompt size is `input + cache_read + cache_write`.
Storing them apart is what makes `cost_usd` auditable against the actual bill —
which matters once PR-07's hard cap depends on that number being right.

## Failure handling

Every failure path writes a row rather than throwing, so a single bad video
never aborts a batch (§4). `status='failed'` plus `error` and `raw_response`
make each one diagnosable:

| Failure | Recorded | Cost |
|---|---|---|
| API error (network, 429, 5xx) | `api error: …` | $0 — no usage was produced |
| `stop_reason: max_tokens` | Named explicitly | Charged; the tokens were generated |
| Unparseable response | Parser's reason + raw response | Charged |

The `max_tokens` case gets its own branch because truncated JSON parses as
garbage; without it you would debug the parser instead of raising the limit.

## Model choice

Haiku 4.5 is the default, per §1. Sonnet 5 is a per-video opt-in via
`--model sonnet`.

Sonnet 5's cost is computed at the standard $3/$15 rather than the
introductory $2/$10 rate. That over-estimates spend, which makes PR-07's cap
trip early — the safe direction to be wrong in when a hard cap is involved.

## Not implemented: topic tagging

`PLAN.md` §3 says `video_topics` is *"tagged at analysis time"*, but the §4
contract has no `topics` field, so the analysis response carries nothing to tag
with. Populating it would require changing §4, which is frozen.

Left unpopulated, which is consistent with §7: *"Nothing in v1 reads those
tables."* The tables exist so §7 is a feature rather than a rewrite. Adding a
`topics: string[]` field to §4 is the natural fix when §7 is built — a decision
for whoever picks that up, not something to slip in here.

## Running it

```bash
export DATABASE_URL='mysql://...'
export ANTHROPIC_API_KEY='sk-ant-...'

npm run analyze -- 'https://www.youtube.com/watch?v=VIDEO_ID' --show
npm run analyze -- --pending --limit 10
```

The video must already be ingested (PR-05) and have a transcript. Every run
prints its spend and compares it against the §1 budget of ~$0.02/video.
