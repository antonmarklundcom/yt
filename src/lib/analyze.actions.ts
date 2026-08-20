"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transcripts, videos } from "@/db/schema";
import { analyzeVideo } from "@/lib/analysis/run";
import { DEFAULT_MODEL, isAnalysisModel } from "@/lib/analysis/pricing";
import {
  assertWithinCap,
  estimateAnalysisCostUsd,
  formatUsd,
  SpendCapExceededError,
} from "@/lib/spend";

/**
 * Analysis from the UI (PLAN.md §9 PR-17).
 *
 * `analyzeVideo()` has existed since PR-06 and nothing in the app called it —
 * the only way to analyse a stored video was the CLI backfill. This is the
 * missing wire, not new pipeline code: the estimate/cap/analyse sequence is the
 * same one `submitIngest` already performs for a single-video paste.
 */

export type AnalyzeActionResult = { ok: true; message: string } | { ok: false; error: string };

export type AnalyzeActionOptions = {
  /** Model id; anything unrecognised falls back to the default rather than throwing. */
  model?: string;
  /** Re-analyse a video that already has a successful analysis. */
  force?: boolean;
};

export async function analyzeVideoAction(
  videoId: number,
  options: AnalyzeActionOptions = {},
): Promise<AnalyzeActionResult> {
  const model = options.model && isAnalysisModel(options.model) ? options.model : DEFAULT_MODEL;

  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return { ok: false, error: "No such video." };

    const [transcript] = await db
      .select({ wordCount: transcripts.wordCount })
      .from(transcripts)
      .where(eq(transcripts.videoId, videoId))
      .limit(1);
    if (!transcript) {
      return { ok: false, error: "No stored transcript, so there is nothing to analyse." };
    }

    // The cap is checked before the call, not after the bill (PR-07).
    await assertWithinCap(estimateAnalysisCostUsd(transcript.wordCount, model));

    const result = await analyzeVideo(video, { model, force: options.force });

    revalidatePath("/");
    revalidatePath(`/video/${videoId}`);

    if (result.status === "ok") {
      return { ok: true, message: `Analysed for ${formatUsd(result.costUsd)}.` };
    }
    if (result.status === "skipped") {
      return result.why === "already-analysed"
        ? { ok: true, message: "Already analysed — nothing was spent." }
        : { ok: false, error: "No stored transcript, so there is nothing to analyse." };
    }
    return { ok: false, error: result.error };
  } catch (err) {
    if (err instanceof SpendCapExceededError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Analysis failed." };
  }
}
