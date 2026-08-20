import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyses, transcripts, videos, type Analysis, type Video } from "@/db/schema";
import { analysisPromptVersion, ANALYSIS_PROMPT_VERSION, type AnalysisPayload } from "./contract";
import { parseAnalysisResponse } from "./parse";
import {
  DEFAULT_MODEL,
  estimateCostUsd,
  toCostString,
  type AnalysisModel,
  type TokenUsage,
} from "./pricing";
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { recordSpend } from "@/lib/spend";

/**
 * The analysis pipeline (PLAN.md §5 row 06): transcript -> Haiku 4.5 ->
 * validated JSON -> analyses row, with tokens and cost recorded per row.
 */

/** ~2,500 output tokens expected (PLAN.md §1); the headroom absorbs long videos. */
export const MAX_OUTPUT_TOKENS = 8_000;

let cachedClient: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cachedClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Missing ANTHROPIC_API_KEY. Create a key at console.anthropic.com. See .env.example.",
      );
    }
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export type AnalyzeOptions = {
  model?: AnalysisModel;
  /** Analyse again even when a successful analysis already exists. */
  force?: boolean;
  /**
   * Output language (PR-22b). Absent or "en" produces byte-identical prompts to
   * every analysis already stored, and keeps prompt_version at 1. Nothing sets
   * this yet — there is no UI and no setting.
   */
  language?: string;
};

export type AnalyzeResult =
  | { status: "ok"; analysis: Analysis; payload: AnalysisPayload; costUsd: number }
  | { status: "failed"; analysis: Analysis; error: string; costUsd: number }
  | { status: "skipped"; why: "already-analysed" | "no-transcript" };

export async function analyzeVideo(
  video: Video,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const promptVersion = analysisPromptVersion(options.language);

  if (!options.force) {
    const [existing] = await db
      .select({ id: analyses.id })
      .from(analyses)
      .where(and(eq(analyses.videoId, video.id), eq(analyses.status, "ok")))
      .orderBy(desc(analyses.id))
      .limit(1);
    // "Analyse once, store forever" (PLAN.md §1.3) — re-reading a stored
    // analysis costs $0, so never pay twice by accident.
    if (existing) return { status: "skipped", why: "already-analysed" };
  }

  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, video.id))
    .limit(1);
  if (!transcript || !transcript.content.trim()) {
    return { status: "skipped", why: "no-transcript" };
  }

  let response: Anthropic.Message;

  try {
    response = await anthropic().messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Cache the fixed template (PLAN.md §1.4). Note this silently no-ops on
      // Haiku 4.5 below a 4096-token prefix — cacheWriteTokens in the stored
      // row is what tells you whether it engaged.
      system: [
        {
          type: "text",
          text: ANALYSIS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Structured outputs constrain the model to the §4 shape rather than
      // merely asking for it. The defensive parser stays as a backstop.
      output_config: { format: { type: "json_schema", schema: ANALYSIS_JSON_SCHEMA } },
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            title: video.title,
            channelTitle: video.channelTitle,
            durationSeconds: video.durationSeconds,
            transcript: transcript.content,
            language: options.language,
          }),
        },
      ],
    });
  } catch (err) {
    // An API-level failure produces no usage, so it costs nothing and must not
    // write a cost row — but it must still be recorded, or the backfill retries
    // it forever with no trace of why.
    const message = err instanceof Error ? err.message : String(err);
    const row = await insertAnalysis({
      videoId: video.id,
      model,
      promptVersion,
      status: "failed",
      error: `api error: ${message}`.slice(0, 1024),
      usage: EMPTY_USAGE,
      costUsd: 0,
    });
    return { status: "failed", analysis: row, error: message, costUsd: 0 };
  }

  const usage = readUsage(response);
  const costUsd = estimateCostUsd(model, usage);
  const raw = textOf(response);

  if (response.stop_reason === "max_tokens") {
    // Truncated JSON parses as garbage; naming the real cause saves a debugging
    // session when it happens on an unusually long transcript.
    const row = await insertAnalysis({
      videoId: video.id,
      model,
      promptVersion,
      status: "failed",
      error: `response hit max_tokens (${MAX_OUTPUT_TOKENS}); output truncated`,
      rawResponse: raw,
      usage,
      costUsd,
    });
    return { status: "failed", analysis: row, error: "max_tokens", costUsd };
  }

  const parsed = parseAnalysisResponse(raw);
  if (!parsed.ok) {
    // PLAN.md §4: store the raw response and mark the row failed rather than
    // crashing the batch.
    const row = await insertAnalysis({
      videoId: video.id,
      model,
      promptVersion,
      status: "failed",
      error: parsed.error.slice(0, 1024),
      rawResponse: raw,
      usage,
      costUsd,
    });
    return { status: "failed", analysis: row, error: parsed.error, costUsd };
  }

  const row = await insertAnalysis({
    videoId: video.id,
    model,
    promptVersion,
    status: "ok",
    payload: parsed.payload,
    rawResponse: raw,
    usage,
    costUsd,
  });

  return { status: "ok", analysis: row, payload: parsed.payload, costUsd };
}

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * `input_tokens` is the uncached remainder only — the full prompt size is the
 * sum of all three. Recording them separately is what makes the stored cost
 * auditable against the bill.
 */
export function readUsage(response: Anthropic.Message): TokenUsage {
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function insertAnalysis(input: {
  videoId: number;
  model: AnalysisModel;
  /** Defaults to the English prompt's version; see analysisPromptVersion(). */
  promptVersion?: number;
  status: "ok" | "failed";
  payload?: AnalysisPayload;
  rawResponse?: string;
  error?: string;
  usage: TokenUsage;
  costUsd: number;
  batchId?: string;
}): Promise<Analysis> {
  const { payload } = input;

  const [result] = await db.insert(analyses).values({
    videoId: input.videoId,
    model: input.model,
    promptVersion: input.promptVersion ?? ANALYSIS_PROMPT_VERSION,
    status: input.status,
    summary: payload?.summary ?? null,
    takeaways: payload?.takeaways ?? null,
    hookBreakdown: payload?.hook ?? null,
    timeline: payload?.timeline ?? null,
    gaps: payload?.gaps ?? null,
    ideas: payload?.ideas ?? null,
    rawResponse: input.rawResponse ?? null,
    error: input.error ?? null,
    batchId: input.batchId ?? null,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens,
    cacheWriteTokens: input.usage.cacheWriteTokens,
    costUsd: toCostString(input.costUsd),
  });

  // Analyses are append-only, so insertId is always a fresh row here — unlike
  // the upsert paths in the ingest layer, where it cannot be trusted.
  // Record spend from the same place the row is written, so no code path can
  // charge the account without the monthly counter seeing it (PR-07).
  await recordSpend(input.costUsd);

  const [row] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.id, result.insertId))
    .limit(1);
  if (!row) throw new Error(`Inserted analysis ${result.insertId} but could not read it back`);
  return row;
}

/**
 * Videos with a transcript and no successful analysis — the backfill's work list.
 *
 * NOT EXISTS rather than a LEFT JOIN: a video can have several analysis rows
 * (append-only, plus failed retries), and a join would emit one row per
 * analysis and need de-duplicating in code.
 */
/**
 * The same "pending" definition as findPendingVideos, restricted to an explicit
 * set of ids (PR-28).
 *
 * Bulk analysis takes its ids from a form, which is a public endpoint: the
 * filter is what stops a hand-edited request from re-paying for videos that are
 * already analysed, or from submitting ones with no transcript at all.
 */
export async function findPendingVideosByIds(ids: number[]): Promise<Video[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(videos)
    .where(
      and(
        inArray(videos.id, ids),
        eq(videos.captionStatus, "available"),
        sql`exists (select 1 from ${transcripts} where ${transcripts.videoId} = ${videos.id})`,
        sql`not exists (
          select 1 from ${analyses}
          where ${analyses.videoId} = ${videos.id} and ${analyses.status} = 'ok'
        )`,
      ),
    )
    .orderBy(desc(videos.publishedAt));
}

export async function findPendingVideos(limit = 50): Promise<Video[]> {
  return db
    .select()
    .from(videos)
    .where(
      and(
        eq(videos.captionStatus, "available"),
        sql`exists (select 1 from ${transcripts} where ${transcripts.videoId} = ${videos.id})`,
        sql`not exists (
          select 1 from ${analyses}
          where ${analyses.videoId} = ${videos.id} and ${analyses.status} = 'ok'
        )`,
      ),
    )
    .orderBy(desc(videos.publishedAt))
    .limit(limit);
}
