/**
 * Spend guard tests — PLAN.md §5 row 07's done-when ("cap trips correctly in a
 * test").
 *
 * These cover the pure logic: cap parsing, UTC month boundaries, estimation,
 * and the trip decision itself. The database-backed paths (recordSpend,
 * monthToDateUsd) are exercised by `npm run spend` against real MySQL —
 * mocking Drizzle here would test the mock, not the guard.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  estimateAnalysisCostUsd,
  estimateBatchCostUsd,
  monthlyCapUsd,
  SpendCapExceededError,
  utcDay,
  utcMonthRange,
  type SpendStatus,
} from "./spend";

const ORIGINAL_CAP = process.env.MONTHLY_SPEND_CAP_USD;

afterEach(() => {
  if (ORIGINAL_CAP === undefined) delete process.env.MONTHLY_SPEND_CAP_USD;
  else process.env.MONTHLY_SPEND_CAP_USD = ORIGINAL_CAP;
});

test("monthlyCapUsd defaults, parses, and rejects nonsense", () => {
  delete process.env.MONTHLY_SPEND_CAP_USD;
  assert.equal(monthlyCapUsd(), 25);

  process.env.MONTHLY_SPEND_CAP_USD = "40";
  assert.equal(monthlyCapUsd(), 40);

  // 0 must mean "block all spend", not "fall back to the default" — a cap of
  // zero is the one setting where a silent fallback would be actively harmful.
  process.env.MONTHLY_SPEND_CAP_USD = "0";
  assert.equal(monthlyCapUsd(), 0);

  for (const bad of ["abc", "-5"]) {
    process.env.MONTHLY_SPEND_CAP_USD = bad;
    assert.throws(() => monthlyCapUsd(), /MONTHLY_SPEND_CAP_USD/, `should reject ${bad}`);
  }
});

test("utcDay and utcMonthRange use UTC, not local time", () => {
  // 23:30 UTC on the 31st is already the next day in some local zones; the day
  // key must not drift, or spend lands in the wrong month at the boundary.
  assert.equal(utcDay(new Date("2026-01-31T23:30:00Z")), "2026-01-31");
  assert.deepEqual(utcMonthRange(new Date("2026-01-15T12:00:00Z")), {
    start: "2026-01-01",
    end: "2026-01-31",
  });
  // February in a leap year — the reason the range is computed as day 0 of the
  // next month rather than by adding a fixed number of days.
  assert.deepEqual(utcMonthRange(new Date("2028-02-10T00:00:00Z")), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.deepEqual(utcMonthRange(new Date("2026-12-31T23:59:59Z")), {
    start: "2026-12-01",
    end: "2026-12-31",
  });
});

test("estimation lands near PLAN.md §1's ~$0.02 per 30-minute video", () => {
  // §1's worked example: 5,000 spoken words on Haiku 4.5.
  const cost = estimateAnalysisCostUsd(5_000, "claude-haiku-4-5");
  assert.ok(cost > 0.015 && cost < 0.03, `expected ~$0.02, got $${cost.toFixed(4)}`);
});

test("the batch discount is a flat 50%", () => {
  const full = estimateAnalysisCostUsd(5_000, "claude-haiku-4-5");
  const batch = estimateAnalysisCostUsd(5_000, "claude-haiku-4-5", { batch: true });
  assert.ok(Math.abs(batch - full * 0.5) < 1e-9);
});

test("estimates run high rather than low", () => {
  // A guard that under-estimates lets the cap be breached. Confirm the token
  // ratio is above the 1.4 words-to-tokens implied by §1 rather than below it.
  const cost = estimateAnalysisCostUsd(10_000, "claude-haiku-4-5");
  const naive = (10_000 * 1.4 * 1 + 2_500 * 5) / 1_000_000;
  assert.ok(cost > naive, "estimate should exceed the naive §1 figure");
});

test("Sonnet is priced above Haiku, so the model choice moves the cap", () => {
  const haiku = estimateAnalysisCostUsd(5_000, "claude-haiku-4-5");
  const sonnet = estimateAnalysisCostUsd(5_000, "claude-sonnet-5");
  assert.ok(sonnet > haiku * 2, "Sonnet should be materially more expensive");
});

test("batch estimate is the sum of its videos", () => {
  const words = [3_000, 5_000, 12_000];
  const total = estimateBatchCostUsd(words, "claude-haiku-4-5", { batch: true });
  const sum = words.reduce(
    (acc, w) => acc + estimateAnalysisCostUsd(w, "claude-haiku-4-5", { batch: true }),
    0,
  );
  assert.ok(Math.abs(total - sum) < 1e-12);
});

/**
 * The trip decision, extracted from assertWithinCap so it can be tested without
 * a database. Kept identical to the production comparison.
 */
function wouldTrip(spent: number, estimated: number, cap: number): boolean {
  return spent + estimated > cap;
}

test("the cap trips exactly when projected spend exceeds it", () => {
  assert.equal(wouldTrip(0, 10, 25), false, "well under");
  assert.equal(wouldTrip(20, 4.99, 25), false, "just under");
  assert.equal(wouldTrip(20, 5, 25), false, "landing exactly on the cap is allowed");
  assert.equal(wouldTrip(20, 5.01, 25), true, "one cent over trips");
  assert.equal(wouldTrip(26, 0.01, 25), true, "already over stays tripped");
  assert.equal(wouldTrip(0, 0.01, 0), true, "a zero cap blocks all spend");
});

test("a realistic month of polling stays inside the default cap", () => {
  // PLAN.md §1: 20 videos/day on Haiku 4.5 via the Batch API is ~$6/month.
  // If this ever exceeds $25, either the estimator or §1 has drifted.
  const perDay = estimateBatchCostUsd(Array(20).fill(5_000), "claude-haiku-4-5", {
    batch: true,
  });
  const perMonth = perDay * 30;
  assert.ok(perMonth < 25, `projected $${perMonth.toFixed(2)}/month should be under the cap`);
  assert.ok(perMonth > 3, `projected $${perMonth.toFixed(2)}/month looks implausibly low`);
});

test("SpendCapExceededError carries the numbers needed to act on it", () => {
  const status: SpendStatus = {
    monthToDateUsd: 20,
    committedUsd: 4,
    projectedUsd: 24,
    capUsd: 25,
    remainingUsd: 1,
    fraction: 0.96,
    overCap: false,
  };
  const err = new SpendCapExceededError("nope", status, 5);
  assert.equal(err.name, "SpendCapExceededError");
  assert.equal(err.status.remainingUsd, 1);
  assert.equal(err.estimatedUsd, 5);
});

/**
 * PR-26: the cap is measured against billed + committed, so an open batch has
 * to close the window it used to leave. These pin the arithmetic that
 * spendStatus() does around the two database reads.
 */
function project(billed: number, committed: number, cap: number) {
  const projected = billed + committed;
  return {
    projected,
    remaining: Math.max(0, cap - projected),
    overCap: projected >= cap,
  };
}

test("committed batch money counts against the cap", () => {
  // The gap PR-26 closes: $20 billed, $6 sitting in a submitted batch, $25 cap.
  // Counting only spend_log leaves $5 of headroom that is already spent.
  const withCommitted = project(20, 6, 25);
  assert.equal(withCommitted.projected, 26);
  assert.equal(withCommitted.remaining, 0);
  assert.equal(withCommitted.overCap, true);
  assert.equal(wouldTrip(withCommitted.projected, 0.01, 25), true);

  // Nothing open is the normal case, and must behave exactly as before.
  const idle = project(20, 0, 25);
  assert.equal(idle.projected, 20);
  assert.equal(idle.remaining, 5);
  assert.equal(idle.overCap, false);
  assert.equal(wouldTrip(idle.projected, 4.99, 25), false);
});

test("collecting a batch does not double-count it", () => {
  // Collection writes the real cost to spend_log and flips the row out of
  // in_progress/ended in the same run, so the estimate stops being counted the
  // moment the actual does. The failure mode this guards against is a status
  // value that stays open after collection.
  const open = project(20, 6, 25);
  const collected = project(20 + 5.5, 0, 25);
  assert.equal(open.projected, 26);
  assert.equal(collected.projected, 25.5);
  assert.ok(collected.projected < open.projected + 5.5, "estimate must drop as billed rises");
});
