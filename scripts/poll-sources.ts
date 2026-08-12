/**
 * Nightly/hourly poller. Finds new uploads on tracked sources, fetches their
 * captions, and submits the analysis work as a Batch API job (PLAN.md §1.2 —
 * nobody is waiting on this, so accept latency for a flat 50% discount).
 *
 *   export DATABASE_URL='mysql://...' YOUTUBE_API_KEY='...' ANTHROPIC_API_KEY='sk-ant-...'
 *   npx tsx scripts/poll-sources.ts
 *
 * Flags:
 *   --limit N        newest N videos per source (default 10)
 *   --no-analyze     ingest only; leave analysis to the backfill
 *   --wait           block until the batch finishes and write the results
 *   --dry-run        report what would be spent, submit nothing
 */

import { asc, eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { sources, type Source } from "../src/db/schema";
import { awaitBatch, collectBatchResults, submitAnalysisBatch } from "../src/lib/analysis/batch";
import { findPendingVideos } from "../src/lib/analysis/run";
import { DEFAULT_MODEL } from "../src/lib/analysis/pricing";
import { ingestRef } from "../src/lib/ingest";
import {
  estimateBatchCostUsd,
  formatUsd,
  SpendCapExceededError,
  spendStatus,
} from "../src/lib/spend";
import { QuotaExhaustedError } from "../src/lib/youtube/quota";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limit = numericFlag(argv, "--limit", 10);
  const dryRun = argv.includes("--dry-run");

  const before = await spendStatus();
  console.log(
    `Spend this month: ${formatUsd(before.monthToDateUsd)} of ${formatUsd(before.capUsd)} ` +
      `(${Math.round(before.fraction * 100)}%)\n`,
  );

  const active = await db
    .select()
    .from(sources)
    .where(eq(sources.active, true))
    // Least-recently-polled first, so a run that dies partway still makes
    // progress across the whole set over successive runs.
    .orderBy(asc(sources.lastPolledAt));

  if (active.length === 0) {
    console.log("No active sources. Add one with `npm run ingest '<channel or playlist url>'`.");
    return;
  }

  console.log(`Polling ${active.length} source(s), newest ${limit} videos each…\n`);

  for (const source of active) {
    try {
      await pollSource(source, limit);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        console.error(`\n${err.message}`);
        console.error("Stopping the poll — remaining sources will be picked up next run.");
        break;
      }
      // One bad source must not abort the run; the others are independent.
      console.error(`  ${source.title}: FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  if (argv.includes("--no-analyze")) {
    console.log("\n--no-analyze set; skipping analysis.");
    return;
  }

  const pending = await findPendingVideos(200);
  if (pending.length === 0) {
    console.log("\nNothing pending analysis.");
    return;
  }

  console.log(`\n${pending.length} video(s) pending analysis.`);

  if (dryRun) {
    const wordCounts = pending.map(() => 5_000); // §1's reference video
    const estimate = estimateBatchCostUsd(wordCounts, DEFAULT_MODEL, { batch: true });
    console.log(
      `--dry-run: would submit a batch estimated at ${formatUsd(estimate)} ` +
        `(${formatUsd(before.remainingUsd)} remaining this month). Nothing submitted.`,
    );
    return;
  }

  let submission;
  try {
    submission = await submitAnalysisBatch(pending);
  } catch (err) {
    if (err instanceof SpendCapExceededError) {
      console.error(`\nSPEND CAP: ${err.message}`);
      // Exit 3 so a cron wrapper can distinguish "hit the cap" (expected, and
      // arguably working as designed) from "crashed" (needs attention).
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  if (!submission) {
    console.log("No videos had a usable transcript; nothing submitted.");
    return;
  }

  console.log(
    `\nSubmitted batch ${submission.batchId} — ${submission.videoIds.length} video(s), ` +
      `estimated ${formatUsd(submission.estimatedUsd)}.`,
  );

  if (!argv.includes("--wait")) {
    console.log(
      `Results are collected by a later run:\n` +
        `  npx tsx scripts/backfill.ts --collect ${submission.batchId}`,
    );
    return;
  }

  console.log("Waiting for the batch to finish…");
  const finished = await awaitBatch(submission.batchId, {
    onPoll: (status) => console.log(`  status: ${status}`),
  });
  if (!finished) {
    console.log(
      `Batch did not finish within the timeout. Collect it later:\n` +
        `  npx tsx scripts/backfill.ts --collect ${submission.batchId}`,
    );
    return;
  }

  const outcome = await collectBatchResults(submission.batchId);
  console.log(
    `\n${outcome.succeeded} ok · ${outcome.failed} failed · ${outcome.expired} expired · ` +
      `actual ${formatUsd(outcome.actualUsd)}`,
  );

  const after = await spendStatus();
  console.log(
    `Spend this month: ${formatUsd(after.monthToDateUsd)} of ${formatUsd(after.capUsd)}`,
  );
}

async function pollSource(source: Source, limit: number): Promise<void> {
  const ref =
    source.kind === "channel"
      ? ({ kind: "channel", channelId: source.youtubeId } as const)
      : ({ kind: "playlist", playlistId: source.youtubeId } as const);

  const summary = await ingestRef(ref, { limit, skipCaptions: false });
  const c = summary.captionCounts;

  console.log(
    `  ${truncate(source.title, 40).padEnd(40)} ` +
      `${summary.videos.length} video(s) · ` +
      `${c.available} captions · ${c.none} none · ${c.failed} failed · ${c.skipped} skipped`,
  );

  await db
    .update(sources)
    .set({ lastPolledAt: new Date() })
    .where(eq(sources.id, source.id));
}

function numericFlag(argv: string[], flag: string, fallback: number): number {
  const idx = argv.indexOf(flag);
  if (idx === -1) return fallback;
  return Number(argv[idx + 1]) || fallback;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (err) => {
    console.error("\nPoll FAILED:", err instanceof Error ? err.message : err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
