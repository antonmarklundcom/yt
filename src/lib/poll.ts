/**
 * The poll run — find new uploads on tracked sources, fetch their captions, and
 * submit the analysis work as a Batch API job (PLAN.md §1.2).
 *
 * This lives in `src/lib` rather than in `scripts/poll-sources.ts` because two
 * callers need it: the CLI script, and the `/api/cron/poll` route handler that
 * Hostinger's cron hits over HTTP. The route handler must not shell out to the
 * script — a Next.js server process spawning `tsx` would double the memory
 * footprint on a shared Node slot, lose the error, and give the caller nothing
 * but an exit code.
 */

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { analyses, sources, type Source } from "@/db/schema";
import {
  awaitBatch,
  collectBatchResults,
  submitAnalysisBatch,
  type BatchOutcome,
} from "@/lib/analysis/batch";
import { DEFAULT_MODEL, type AnalysisModel } from "@/lib/analysis/pricing";
import { anthropic, findPendingVideos } from "@/lib/analysis/run";
import { ingestRef } from "@/lib/ingest";
import {
  estimateBatchCostUsd,
  SpendCapExceededError,
  spendStatus,
  type SpendStatus,
} from "@/lib/spend";
import { QuotaExhaustedError } from "@/lib/youtube/quota";

export type PollOptions = {
  /** Newest N videos per source. */
  limit?: number;
  /** Cap on videos considered for analysis in one run. */
  pendingLimit?: number;
  /** Ingest only; leave analysis to the backfill. */
  analyze?: boolean;
  /** Report what would be spent, submit nothing. */
  dryRun?: boolean;
  /** Block until the submitted batch finishes and write its results. */
  wait?: boolean;
  model?: AnalysisModel;
  onProgress?: (event: PollEvent) => void;
};

export type PollEvent =
  | { phase: "sources"; count: number }
  | { phase: "source"; result: PollSourceResult }
  | { phase: "quota-exhausted"; message: string }
  | { phase: "collected"; batchId: string; outcome: BatchOutcome }
  | { phase: "pending"; count: number }
  | { phase: "submitted"; batchId: string; videoCount: number; estimatedUsd: number }
  | { phase: "batch-status"; batchId: string; status: string };

export type PollSourceResult = {
  sourceId: number;
  title: string;
  kind: Source["kind"];
  videos: number;
  captions: { available: number; none: number; failed: number; skipped: number };
  error: string | null;
};

/**
 * Why no batch was submitted. `null` means one was.
 *
 * `batch-in-flight` is the one that matters for an unattended hourly cron:
 * videos stay "pending" until a batch's results are collected, so a second run
 * would happily re-submit the same transcripts and pay for them twice.
 */
export type PollSkipReason =
  | "no-analyze"
  | "nothing-pending"
  | "dry-run"
  | "batch-in-flight"
  | "no-usable-transcript"
  | "spend-cap";

export type PollResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sources: PollSourceResult[];
  quotaExhausted: boolean;
  /** Batches that had already ended and were written to `analyses` this run. */
  collected: Array<{ batchId: string; outcome: BatchOutcome }>;
  pendingAnalysis: number;
  submitted: { batchId: string; videoCount: number; estimatedUsd: number } | null;
  /** Set when `submitted` is null — includes the dry-run estimate. */
  skipped: { reason: PollSkipReason; detail: string; estimatedUsd?: number } | null;
  waited: { batchId: string; finished: boolean; outcome: BatchOutcome | null } | null;
  spend: { before: SpendStatus; after: SpendStatus };
};

export async function pollSources(options: PollOptions = {}): Promise<PollResult> {
  const {
    limit = 10,
    pendingLimit = 200,
    analyze = true,
    dryRun = false,
    wait = false,
    model = DEFAULT_MODEL,
    onProgress = () => {},
  } = options;

  const startedAt = new Date();
  const before = await spendStatus();

  const active = await db
    .select()
    .from(sources)
    .where(eq(sources.active, true))
    // Least-recently-polled first, so a run that dies partway still makes
    // progress across the whole set over successive runs.
    .orderBy(asc(sources.lastPolledAt));

  onProgress({ phase: "sources", count: active.length });

  const results: PollSourceResult[] = [];
  let quotaExhausted = false;

  for (const source of active) {
    try {
      const result = await pollSource(source, limit);
      results.push(result);
      onProgress({ phase: "source", result });
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        quotaExhausted = true;
        onProgress({ phase: "quota-exhausted", message: err.message });
        // Remaining sources are picked up next run — they sort first by then.
        break;
      }
      // One bad source must not abort the run; the others are independent.
      const result: PollSourceResult = {
        sourceId: source.id,
        title: source.title,
        kind: source.kind,
        videos: 0,
        captions: { available: 0, none: 0, failed: 0, skipped: 0 },
        error: err instanceof Error ? err.message : String(err),
      };
      results.push(result);
      onProgress({ phase: "source", result });
    }
  }

  const finish = async (
    partial: Pick<PollResult, "collected" | "pendingAnalysis" | "submitted" | "skipped" | "waited">,
  ): Promise<PollResult> => {
    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      sources: results,
      quotaExhausted,
      spend: { before, after: await spendStatus() },
      ...partial,
    };
  };

  const empty = { collected: [], pendingAnalysis: 0, submitted: null, waited: null };

  if (!analyze) {
    return finish({
      ...empty,
      skipped: { reason: "no-analyze", detail: "analysis disabled for this run" },
    });
  }

  // Collect anything that finished since the last run before deciding what is
  // still pending — a collected batch removes its videos from the pending set.
  const collected = dryRun ? [] : await collectFinishedBatches(model, onProgress);
  const inFlight = await inFlightBatchIds();

  const pending = await findPendingVideos(pendingLimit);
  onProgress({ phase: "pending", count: pending.length });

  if (pending.length === 0) {
    return finish({
      ...empty,
      collected,
      skipped: { reason: "nothing-pending", detail: "no video is awaiting analysis" },
    });
  }

  if (inFlight.length > 0) {
    return finish({
      ...empty,
      collected,
      pendingAnalysis: pending.length,
      skipped: {
        reason: "batch-in-flight",
        detail:
          `batch ${inFlight.join(", ")} is still processing; ` +
          "not submitting again so the same transcripts are not paid for twice",
      },
    });
  }

  if (dryRun) {
    // PLAN.md §1's reference video, since word counts aren't loaded until submit.
    const estimatedUsd = estimateBatchCostUsd(pending.map(() => 5_000), model, { batch: true });
    return finish({
      ...empty,
      collected,
      pendingAnalysis: pending.length,
      skipped: { reason: "dry-run", detail: "nothing submitted", estimatedUsd },
    });
  }

  let submission;
  try {
    submission = await submitAnalysisBatch(pending, { model });
  } catch (err) {
    if (err instanceof SpendCapExceededError) {
      return finish({
        ...empty,
        collected,
        pendingAnalysis: pending.length,
        skipped: { reason: "spend-cap", detail: err.message },
      });
    }
    throw err;
  }

  if (!submission) {
    return finish({
      ...empty,
      collected,
      pendingAnalysis: pending.length,
      skipped: {
        reason: "no-usable-transcript",
        detail: "no pending video had a non-empty transcript",
      },
    });
  }

  const submitted = {
    batchId: submission.batchId,
    videoCount: submission.videoIds.length,
    estimatedUsd: submission.estimatedUsd,
  };
  onProgress({ phase: "submitted", ...submitted });

  if (!wait) {
    return finish({
      collected,
      pendingAnalysis: pending.length,
      submitted,
      skipped: null,
      waited: null,
    });
  }

  const finished = await awaitBatch(submission.batchId, {
    onPoll: (status) => onProgress({ phase: "batch-status", batchId: submission!.batchId, status }),
  });
  const outcome = finished ? await collectBatchResults(submission.batchId, { model }) : null;

  return finish({
    collected,
    pendingAnalysis: pending.length,
    submitted,
    skipped: null,
    waited: { batchId: submission.batchId, finished, outcome },
  });
}

async function pollSource(source: Source, limit: number): Promise<PollSourceResult> {
  const ref =
    source.kind === "channel"
      ? ({ kind: "channel", channelId: source.youtubeId } as const)
      : ({ kind: "playlist", playlistId: source.youtubeId } as const);

  const summary = await ingestRef(ref, { limit, skipCaptions: false });

  await db.update(sources).set({ lastPolledAt: new Date() }).where(eq(sources.id, source.id));

  return {
    sourceId: source.id,
    title: source.title,
    kind: source.kind,
    videos: summary.videos.length,
    captions: {
      available: summary.captionCounts.available,
      none: summary.captionCounts.none,
      failed: summary.captionCounts.failed,
      skipped: summary.captionCounts.skipped,
    },
    error: null,
  };
}

/**
 * Recent batches, by processing status.
 *
 * Nothing records a batch id at submission time — `analyses.batch_id` is only
 * written when results are collected — so the Anthropic API is the ledger. Only
 * the last 24 hours are considered, which is the API's own batch ceiling.
 *
 * This assumes the API key is dedicated to this app. A key shared with another
 * project would see that project's batches here; results are still keyed by
 * `custom_id`, so nothing is mis-attributed, but an unrelated in-flight batch
 * would postpone a submission by one run.
 */
async function recentBatches(): Promise<Array<{ id: string; status: string }>> {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const page = await anthropic().messages.batches.list({ limit: 50 });
  return page.data
    .filter((b) => new Date(b.created_at).getTime() >= cutoff)
    .map((b) => ({ id: b.id, status: b.processing_status }));
}

async function inFlightBatchIds(): Promise<string[]> {
  const batches = await recentBatches();
  return batches.filter((b) => b.status === "in_progress").map((b) => b.id);
}

/**
 * Write the results of every batch that has ended but was never collected.
 *
 * Without this the cron would submit work forever and never read any of it back
 * — the CLI relied on a human running `backfill.ts --collect <id>`.
 */
async function collectFinishedBatches(
  model: AnalysisModel,
  onProgress: (event: PollEvent) => void,
): Promise<Array<{ batchId: string; outcome: BatchOutcome }>> {
  const ended = (await recentBatches()).filter((b) => b.status === "ended").map((b) => b.id);
  if (ended.length === 0) return [];

  const written = await db
    .selectDistinct({ batchId: analyses.batchId })
    .from(analyses)
    .where(inArray(analyses.batchId, ended));
  const seen = new Set(written.map((r) => r.batchId));

  const collected: Array<{ batchId: string; outcome: BatchOutcome }> = [];
  for (const batchId of ended) {
    if (seen.has(batchId)) continue;
    const outcome = await collectBatchResults(batchId, { model });
    // A batch belonging to another app writes nothing here: its custom_ids
    // don't carry the `video-` prefix, so every entry is skipped.
    if (outcome.succeeded + outcome.failed + outcome.expired === 0) continue;
    collected.push({ batchId, outcome });
    onProgress({ phase: "collected", batchId, outcome });
  }
  return collected;
}
