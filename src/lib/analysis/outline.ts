import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analyses, outlines, videos, type Outline } from "@/db/schema";
import { anthropic, readUsage, MAX_OUTPUT_TOKENS } from "./run";
import type { OutlinePayload } from "./contract";
import { buildOutlineUserPrompt, OUTLINE_JSON_SCHEMA, OUTLINE_SYSTEM_PROMPT } from "./outline-prompt";
import { parseOutlineResponse } from "./outline-parse";
import { DEFAULT_MODEL, estimateCostUsd, toCostString, type AnalysisModel } from "./pricing";
import { assertWithinCap, recordSpend } from "@/lib/spend";

/**
 * PR-13: not yet built, per docs/HANDOFF-SONNET.md §3. Same shape as the
 * analysis pipeline (run.ts) — one Anthropic call, structured outputs,
 * defensive parse, record cost via recordSpend — but writes to `outlines`,
 * unique on (analysis_id, idea_index): regenerating replaces, not accumulates.
 */

/** Fixed estimate — outline input is a few sentences, not a transcript. */
const ESTIMATED_INPUT_TOKENS = 400;
const ESTIMATED_OUTPUT_TOKENS = 700;

export function estimateOutlineCostUsd(model: AnalysisModel): number {
  return estimateCostUsd(model, {
    inputTokens: ESTIMATED_INPUT_TOKENS,
    outputTokens: ESTIMATED_OUTPUT_TOKENS,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
}

export type GenerateOutlineResult =
  | { status: "ok"; outline: Outline; payload: OutlinePayload; costUsd: number }
  | { status: "failed"; error: string };

export async function generateOutline(
  analysisId: number,
  ideaIndex: number,
  options: { model?: AnalysisModel } = {},
): Promise<GenerateOutlineResult> {
  const model = options.model ?? DEFAULT_MODEL;

  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  if (!analysis || analysis.status !== "ok") {
    return { status: "failed", error: "Analysis not found or not successful." };
  }

  const idea = analysis.ideas?.[ideaIndex];
  if (!idea) return { status: "failed", error: "No idea at that index." };

  const [video] = await db.select().from(videos).where(eq(videos.id, analysis.videoId)).limit(1);
  if (!video) return { status: "failed", error: "Source video not found." };

  await assertWithinCap(estimateOutlineCostUsd(model));

  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: OUTLINE_SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTLINE_JSON_SCHEMA } },
      messages: [
        {
          role: "user",
          content: buildOutlineUserPrompt({
            videoTitle: video.title,
            ideaTitle: idea.title,
            ideaPremise: idea.premise,
            ideaWhyNow: idea.why_now,
          }),
        },
      ],
    });
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  const usage = readUsage(response);
  const costUsd = estimateCostUsd(model, usage);
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseOutlineResponse(raw);
  if (!parsed.ok) {
    await recordSpend(costUsd);
    return { status: "failed", error: parsed.error };
  }

  const outline = await upsertOutline({
    analysisId,
    ideaIndex,
    payload: parsed.payload,
    rawResponse: raw,
    model,
    costUsd,
  });
  await recordSpend(costUsd);

  return { status: "ok", outline, payload: parsed.payload, costUsd };
}

async function upsertOutline(input: {
  analysisId: number;
  ideaIndex: number;
  payload: OutlinePayload;
  rawResponse: string;
  model: AnalysisModel;
  costUsd: number;
}): Promise<Outline> {
  await db
    .insert(outlines)
    .values({
      analysisId: input.analysisId,
      ideaIndex: input.ideaIndex,
      content: input.payload,
      rawResponse: input.rawResponse,
      model: input.model,
      costUsd: toCostString(input.costUsd),
    })
    .onDuplicateKeyUpdate({
      set: {
        content: input.payload,
        rawResponse: input.rawResponse,
        model: input.model,
        costUsd: toCostString(input.costUsd),
      },
    });

  const [row] = await db
    .select()
    .from(outlines)
    .where(and(eq(outlines.analysisId, input.analysisId), eq(outlines.ideaIndex, input.ideaIndex)))
    .limit(1);
  if (!row) throw new Error("Upserted outline but could not read it back");
  return row;
}
