import type Anthropic from "@anthropic-ai/sdk";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { transcripts, videos, type Video } from "@/db/schema";
import { assertWithinCap, estimateBatchCostUsd } from "@/lib/spend";
import { parseAnalysisResponse } from "./parse";
import { DEFAULT_MODEL, estimateCostUsd, type AnalysisModel } from "./pricing";
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { anthropic, insertAnalysis, MAX_OUTPUT_TOKENS, readUsage } from "./run";

/**
 * Batch API path for the nightly poller (PLAN.md §1.2).
 *
 * The channel/playlist job is inherently asynchronous — nobody is waiting on
 * it — so accepting batch latency buys a flat 50% discount. This alone halves
 * the running cost, which is why the poller uses this path and the interactive
 * /api/analyze route does not.
 */

const CUSTOM_ID_PREFIX = "video-";

export type BatchSubmission = {
  batchId: string;
  videoIds: number[];
  estimatedUsd: number;
};

export type BatchOutcome = {
  succeeded: number;
  failed: number;
  expired: number;
  actualUsd: number;
};

/**
 * Build and submit a batch, refusing up front if it would breach the cap.
 *
 * The cap is checked against the whole batch before submission: once requests
 * are in flight there is no partial-cancel that gets you a partial refund, so
 * "check halfway through" is not a real option.
 */
export async function submitAnalysisBatch(
  videoList: Video[],
  options: { model?: AnalysisModel } = {},
): Promise<BatchSubmission | null> {
  const model = options.model ?? DEFAULT_MODEL;
  if (videoList.length === 0) return null;

  const rows = await db
    .select({ videoId: transcripts.videoId, content: transcripts.content, wordCount: transcripts.wordCount })
    .from(transcripts)
    .where(inArray(transcripts.videoId, videoList.map((v) => v.id)));

  const byVideoId = new Map(rows.map((r) => [r.videoId, r]));
  const usable = videoList.filter((v) => {
    const t = byVideoId.get(v.id);
    return t && t.content.trim().length > 0;
  });
  if (usable.length === 0) return null;

  const estimatedUsd = estimateBatchCostUsd(
    usable.map((v) => byVideoId.get(v.id)?.wordCount ?? 0),
    model,
    { batch: true },
  );

  // Throws SpendCapExceededError before a single request is sent.
  await assertWithinCap(estimatedUsd);

  const requests = usable.map((video) => {
    const transcript = byVideoId.get(video.id)!;
    return {
      custom_id: `${CUSTOM_ID_PREFIX}${video.id}`,
      params: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [
          {
            type: "text" as const,
            text: ANALYSIS_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        output_config: { format: { type: "json_schema" as const, schema: ANALYSIS_JSON_SCHEMA } },
        messages: [
          {
            role: "user" as const,
            content: buildUserPrompt({
              title: video.title,
              channelTitle: video.channelTitle,
              durationSeconds: video.durationSeconds,
              transcript: transcript.content,
            }),
          },
        ],
      },
    };
  });

  const batch = await anthropic().messages.batches.create({ requests });

  return { batchId: batch.id, videoIds: usable.map((v) => v.id), estimatedUsd };
}

export async function batchStatus(batchId: string): Promise<Anthropic.Messages.MessageBatch> {
  return anthropic().messages.batches.retrieve(batchId);
}

/**
 * Wait for a batch to finish.
 *
 * Most batches complete within an hour; the API's own ceiling is 24. The
 * default timeout here is deliberately shorter than that — a cron-invoked
 * process should give up and let the next run collect the results rather than
 * hold a connection open for a day.
 */
export async function awaitBatch(
  batchId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number; onPoll?: (s: string) => void } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 30 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const batch = await batchStatus(batchId);
    options.onPoll?.(batch.processing_status);
    if (batch.processing_status === "ended") return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/**
 * Read a finished batch and write one analyses row per result.
 *
 * Results arrive in arbitrary order, so everything is keyed by custom_id —
 * never by position. Getting this wrong would attach each analysis to the
 * wrong video, which no later check would catch.
 */
export async function collectBatchResults(
  batchId: string,
  options: { model?: AnalysisModel } = {},
): Promise<BatchOutcome> {
  const model = options.model ?? DEFAULT_MODEL;
  const outcome: BatchOutcome = { succeeded: 0, failed: 0, expired: 0, actualUsd: 0 };

  for await (const entry of await anthropic().messages.batches.results(batchId)) {
    const videoId = parseCustomId(entry.custom_id);
    if (videoId === null) continue;

    if (entry.result.type !== "succeeded") {
      // errored / canceled / expired — record it so the backfill can see why
      // this video has no analysis instead of silently retrying forever.
      const reason =
        entry.result.type === "errored"
          ? `batch error: ${entry.result.error.type}`
          : `batch ${entry.result.type}`;
      await insertAnalysis({
        videoId,
        model,
        status: "failed",
        error: reason.slice(0, 1024),
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        batchId,
      });
      if (entry.result.type === "expired") outcome.expired += 1;
      else outcome.failed += 1;
      continue;
    }

    const message = entry.result.message;
    const usage = readUsage(message);
    const costUsd = estimateCostUsd(model, usage, { batch: true });
    outcome.actualUsd += costUsd;

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseAnalysisResponse(raw);
    if (!parsed.ok) {
      await insertAnalysis({
        videoId,
        model,
        status: "failed",
        error: parsed.error.slice(0, 1024),
        rawResponse: raw,
        usage,
        costUsd,
        batchId,
      });
      outcome.failed += 1;
      continue;
    }

    await insertAnalysis({
      videoId,
      model,
      status: "ok",
      payload: parsed.payload,
      rawResponse: raw,
      usage,
      costUsd,
      batchId,
    });
    outcome.succeeded += 1;
  }

  return outcome;
}

function parseCustomId(customId: string): number | null {
  if (!customId.startsWith(CUSTOM_ID_PREFIX)) return null;
  const id = Number(customId.slice(CUSTOM_ID_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Look up the videos a batch covered, for reporting. */
export async function videosByIds(ids: number[]): Promise<Video[]> {
  if (ids.length === 0) return [];
  return db.select().from(videos).where(inArray(videos.id, ids));
}

export async function videoById(id: number): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return row ?? null;
}
