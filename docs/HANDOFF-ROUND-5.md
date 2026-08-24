# Handoff — round 5: listening, and what you heard

PR-36 (listen mode) and PR-37 (marking) are merged. `main` is green:
`npm run typecheck && npm test && npm run build`, 135 tests.

Neither PR touches the analysis contract, the spend path, the poller, or any
model call. Nothing here costs money to run.

---

## 1. Verified working vs. only written

The honest line from every previous handoff still holds, and it holds harder
for these two: **nothing in this project has ever run against a real database,
and nothing in round 5 has ever run in a real browser.** A0 is still the gate.

| Thing | State |
|---|---|
| `lib/listen/units.ts` — the content-unit list | **Verified** by unit tests (13): order, skipping, non-renumbering, the row adapter |
| `lib/listen/rate.ts` — the speed dial | **Verified** by unit tests (4) |
| `lib/marks.ts` truncation + filter parsing | **Verified** by unit tests (5) |
| Everything that speaks | **Written only.** No `SpeechSynthesisUtterance` has been constructed in this session — there is no browser here |
| Every SQL query in `lib/marks.ts` | **Written only.** No database |
| Migration 0010 | **Never run** |

### Browser TTS quirks — worked around, not observed here

These are known engine behaviours the player is written to survive. **None of
them were reproduced in this session**, because nothing was run in a browser.
Treat them as the reason the code looks the way it does, not as test results:

- **Chrome cuts long utterances off after roughly 15 seconds.** Worked around
  with a `pause()`/`resume()` pair on a 10-second timer while playing. It is
  inaudible, and on engines that do not need it, it is a no-op.
- **`rate` above ~2 is not honoured uniformly.** The Web Speech spec allows
  0.1–10; Chrome's local voices hold together to about 3, and several Safari
  and Firefox voices flatten out past 2 and simply stop getting faster. The
  slider offers 1–3 for that reason. If 3x sounds identical to 2x on your
  machine, that is the voice, not the code.
- **`pause()` is unreliable on some mobile builds.** The player tracks `paused`
  itself rather than reading `speechSynthesis.paused`, and where resume does
  not take, pressing play re-speaks the current unit from its start — the
  graceful version of that failure rather than silence.
- **`onend` fires after `cancel()`.** A run token discards those late
  callbacks; without it, skipping a section would advance the cursor twice.
- **Voices load asynchronously** in Chrome. The player never selects a voice —
  it uses the engine default — specifically so it does not have to wait for
  `voiceschanged`. If you ever add a voice picker, that is the first thing
  that will bite.
- **Speech survives client-side navigation.** Unmount cancels; otherwise the
  page would keep talking after you left it.

The one behaviour worth checking first on a real deploy: play a long analysis
end to end in Chrome and confirm it does not go silent partway. That is the
keepalive doing its job, and it is the workaround most likely to have rotted.

---

## 2. Schema and route additions, for the record

### Schema — one new table, flagged per PLAN.md §6/§10

`video_unit_marks` is **not** on §10's pre-approved list (which ends at PR-25's
`video_reads`), so it was flagged explicitly in PR-37's description. It is
additive only: no existing column changed, no §4 contract field touched.

```
video_unit_marks   video_id, user_id, unit_type enum, unit_index, unit_text, created_at
                   PK (video_id, user_id, unit_type, unit_index)
                   INDEX (user_id, created_at)
```

Three decisions inside it:

- **Shaped after `video_reads`, deliberately.** Per-user state about a video,
  keyed on the pair, no surrogate id, no foreign keys. A second idiom for the
  same kind of thing would be one more shape to remember.
- **`unit_index` is 0 for singleton sections** (`summary`, `hook`). A uniform
  four-column key is one primary key instead of two, at the cost of one column
  that is always zero.
- **`unit_text` is a snapshot, and the denormalisation is the point.**
  Re-analysing a video rewrites its `analyses` JSON — takeaways get reworded,
  and the list can get shorter — so a mark that stored only an address would
  silently come to point at different text, or at nothing. `/marks` renders the
  snapshot; the video page renders the live analysis. Re-marking a unit
  refreshes the snapshot.

**Migration 0010** — `drizzle/0010_video_unit_marks.sql`, generated, additive,
no data movement. It brings the pending count to **ten**, and
`npm run db:check` should now report **15 tables**, not the 14 in
`docs/HANDOFF-BATCH-C.md` §3. Everything else in that section's A0 sequence is
unchanged.

### Routes

| Route | What |
|---|---|
| `/marks` | Every marked passage across the corpus, newest first, with `?q=` and `?type=` and pagination. Plus `loading.tsx` and `error.tsx`, per PR-18's rule that every route has both. |

Plus one new feed filter value: `/?filter=marked` ("Has marks") next to the
existing `unread` and `pinned`. It composes with `q`, `status`, `type` and
`sort` because it is one more condition on the same query, not a second
listing — the same argument PR-34 made for the topic pages.

### No new env vars, no new dependencies, no new external service.

---

## 3. What is where

```
src/lib/listen/units.ts        the content-unit list — shared by the player,
                               the reading view and the marks
src/lib/listen/rate.ts         the 1x–3x speed dial
src/components/ListenPlayer.tsx    the player (client), including "Mark this"
src/lib/marks.ts               reads: markedUnitKeys(), listMarks()
src/lib/marks.actions.ts       writes: markUnit / unmarkUnit / toggleUnitMark
src/components/UnitMarkButton.tsx  the star in the reading view (no client JS)
src/components/MarksFilters.tsx    the /marks filter form (PR-21's shape)
src/app/marks/                 the page
```

`lib/listen/units.ts` is the piece to read first and the piece to be careful
with. It is the single definition of what "unit 3" means, and the player, the
reading view and the marks table all address units through it. If two of them
ever disagreed, a mark made while listening would land on different text when
it was read back.

---

## 4. Ideas noticed, deliberately not built

- **The reading view does not highlight the unit currently being spoken.**
  Doing it needs shared client state between the player and the server-rendered
  sections — a context provider, and the sections becoming client components.
  That is a real change to how the page renders, for a nice-to-have.
- **No keyboard shortcuts** (space to play, arrows to skip). Cheap, but it means
  a global key handler and deciding what happens when focus is in the search box.
- **The player does not resume where you left off.** Reopening a video starts at
  the summary. A `localStorage` cursor per video would fix it in a few lines;
  nobody has asked.
- **No voice picker.** The engine default is used, which is why nothing waits on
  `voiceschanged`. A picker is the natural next request and the natural next bug.
- **Marks are not exportable.** `/marks` is a page, not a feed or a copy button.
  A "copy all marked passages" button is the obvious companion to
  `CopyAnalysisButton` and was left out to keep PR-37 to one feature.
- **A mark cannot be removed from `/marks`.** You unstar it on the video page.
  Adding it here means the page needs the live analysis text to rebuild the
  action's payload, or the action needs to accept the snapshot — a small
  decision that did not need making yet.

## 5. Risks and one bug found in passing

- **The snapshot can go stale, by design.** A marked takeaway that a
  re-analysis reworded will read differently on `/marks` than on the video page.
  That is the intended trade (see §2), but it will look like a bug the first
  time it happens.
- **The `unit_type` enum is duplicated** — once in `schema.ts`, once as
  `UnitType` in `lib/listen/units.ts`. A test asserts they match, which is the
  cheap version of the guarantee; a drift that the test somehow missed would
  surface as a database error on write, not a silent wrong row.
- ~~**Found, not fixed: `Pagination` linked every page back to `/`.**~~
  **Fixed by PR-38**, which passes `basePath` on the topic/entity shelf and adds
  a test over `buildHref` — the bug lived entirely in that one function.
  Original write-up, for the record:

- **`Pagination` linked every page back to `/`.** The
  component hardcoded the feed's path, so pagination on `/topics/[kind]/[slug]`
  has been sending readers to the feed with the topic dropped since PR-34.
  PR-37 added a `basePath` prop (defaulting to `/`, so nothing changed for
  existing callers) because `/marks` needed it, and passes it there — but
  **`/topics/[kind]/[slug]` still does not pass it**, because fixing that is a
  different PR's scope. It is a one-line change: pass
  `basePath={`/topics/${kind}/${slug}`}`. Worth doing.
