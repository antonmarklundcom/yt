# PR-01 — Caption extraction spike (THE GATE)

> **Status: NOT YET PASSED.** The probe is built and verified working as a program.
> It has **not** been run from the Hostinger server, which is the only run that counts.
> See [Running the gate](#running-the-gate) — it is one command.

## Why this PR exists

`PLAN.md` §0 names the single assumption that can kill the project:

> Caption extraction must work **from the Hostinger server IP**, not just from a
> laptop. YouTube blocks datacenter IP ranges aggressively.

Every number in the cost model (§1) assumes caption text is free. If captions
cannot be fetched server-side, the only alternative is AI audio transcription at
roughly **20× the cost** (~$108/month vs ~$6), which is a human decision, not an
implementation detail. Hence: gate first, build second.

## Running the gate

On the Hostinger box, from the app directory:

```bash
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH   # Hostinger SSH: npm is not on PATH
npm install
npx tsx scripts/probe-captions.ts
```

Also worth running against a video from the actual research niche, since the
default sample is deliberately mainstream:

```bash
npx tsx scripts/probe-captions.ts 'https://www.youtube.com/watch?v=YOUR_VIDEO'
```

Flags: `--json` (machine-readable), `--full` (print the entire transcript).

**Exit code 0 = gate open. Exit code 1 = gate shut, stop, report.**

The report's first block prints the host's **outbound IPv4/IPv6**. That is what
makes a Hostinger run self-evidencing rather than a claim — paste the whole
output, and the IP line proves where it ran.

## What the probe does

It runs **six independent strategies** against each video and reports all of
them, even after one succeeds. The point is not to get a transcript once; it is
to learn how much margin exists.

| # | Strategy | Method | Why it is in the list |
|---|---|---|---|
| 1 | `innertube-android` | POST `/youtubei/v1/player` as the Android app client | Plain JSON API, no HTML. Historically the last client to be gated. |
| 2 | `innertube-ios` | Same, as the iOS app client | Gated independently of Android. |
| 3 | `innertube-tv` | Same, as `TVHTML5_SIMPLY_EMBEDDED_PLAYER` | Embedded-player client, often exempt from bot checks. |
| 4 | `innertube-web` | Same, as the desktop web client | Most likely to demand a proof-of-origin token; useful as a canary. |
| 5 | `youtubei-lib` | `youtubei.js` `getInfo()` / `getTranscript()` | Maintained third-party client; tracks YouTube changes faster than we can. |
| 6 | `watch-page` | Scrape `ytInitialPlayerResponse` from the HTML | Most exposed to consent walls, but occasionally works when the API clients do not. |

Strategies 1–4 and 6 produce a list of caption tracks, then download the chosen
one from the `timedtext` endpoint, trying `json3` → `srv3` → legacy XML. Strategy
5 can also return transcript text directly, bypassing `timedtext` entirely.

**Track selection** prefers manually-authored captions over auto-generated ones
(ASR output is unpunctuated and measurably degrades the analysis) and prefers the
requested language. See `selectTrack` in `src/lib/youtube/captions/track.ts`.

## Reading the result

Failures are classified, because the classification is the whole point:

| Reason | Meaning | Gate implication |
|---|---|---|
| `no_captions` | The video genuinely has no caption tracks | Not a gate failure. Property of the video — `caption_status='none'` in PR-05. Short-circuits the remaining strategies. |
| `blocked` | HTTP 403/429, `LOGIN_REQUIRED`, bot wall, or consent redirect | **The failure this gate tests for.** |
| `unavailable` | Private, deleted, region-locked | Not a gate failure. |
| `network` | Timeout, DNS, connection reset | Infrastructure, not YouTube. Re-run. |
| `parse` | Response arrived but was not the expected shape | YouTube changed something. Needs a code fix. |

The probe defends against the two ways a naive run misleads you:

- **It probes three videos by default.** One video reporting `no_captions` is
  probably true. All three reporting it means we are being blocked and YouTube is
  declining politely rather than with a 403.
- **It flags local proxy blocks.** Two or more sub-50ms refusals cannot both be
  round trips to Google, so the verdict says "your own firewall did this" instead
  of falsely blaming the datacenter-IP problem.

A **partial** pass (some videos work, some do not) is reported as a FAIL, not a
pass — on a datacenter IP that pattern usually means rate limiting, and building
on top of an intermittent transport is how you get a corpus with silent holes.

## Output of a passing run

A pass prints the strategy order to pin in the environment:

```
CAPTION_STRATEGIES=innertube-android,innertube-ios,watch-page
```

Set that on the Hostinger app so the PR-05 pipeline stops paying the latency of
strategies known to be dead on this host. Unset, the code falls back to the full
`STRATEGY_ORDER` in `src/lib/youtube/captions/index.ts`.

The verdict also distinguishes "several strategies work" from "exactly one works".
One working strategy is a pass with no margin — worth knowing before it breaks.

## If the gate fails

Per `PLAN.md` §5 and §6:

1. **Stop. Do not start PR-02.**
2. Report the full probe output, including the outbound IP line.
3. **Do not silently fall back to AI audio transcription.** That is a ~20× cost
   change and needs a human decision.

Things worth trying before declaring it dead, in rough order of effort:

- Re-run at a different time of day; YouTube's datacenter heuristics are partly
  load-based, and an intermittent pass changes the diagnosis.
- Check whether Hostinger egresses through a shared IP that other tenants have
  already burned — a different slot or account may have a cleaner IP.
- A residential proxy in front of the caption fetch. This is a **new external
  service** and therefore needs sign-off (`PLAN.md` §6), but it is far cheaper
  than audio transcription and preserves the entire cost model.

## Code layout

The strategies live in `src/lib/youtube/captions/`, not inside the script,
because PR-05 consumes exactly the same code. The probe is a thin driver over the
real implementation — so a passing gate proves the production path works, not
just a throwaway spike.

```
src/lib/youtube/url.ts               parse any YouTube URL → video/playlist/channel
src/lib/youtube/captions/
  index.ts        fetchCaptions() — production entry point; tryStrategy() — probe entry
  innertube.ts    the four /youtubei/v1/player clients + shared track extraction
  watch-page.ts   HTML scrape fallback + brace-matching JSON extractor
  youtubei-lib.ts youtubei.js strategy, dynamically imported so a broken install
                  degrades to one failed row instead of crashing the probe
  track.ts        track selection, timedtext download, json3/XML parsing
  http.ts         timeouts, and mapping HTTP 403/429 onto reason='blocked'
  types.ts        shared types
scripts/probe-captions.ts            the gate
```

`fetchCaptions()` is what PR-05 calls: it walks the strategy list, returns the
first success, and short-circuits on `no_captions`.
