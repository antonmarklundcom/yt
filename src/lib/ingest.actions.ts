"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transcripts, type Video } from "@/db/schema";
import { analyzeVideo } from "@/lib/analysis/run";
import { DEFAULT_MODEL } from "@/lib/analysis/pricing";
import { assertWithinCap, estimateAnalysisCostUsd, formatUsd, SpendCapExceededError } from "@/lib/spend";
import { ingestUrl } from "@/lib/ingest";
import { BULK_INGEST_LIMIT } from "@/lib/ingest/limits";
import { upsertVideoFromMetadata } from "@/lib/ingest/store";
import { parseYouTubeUrl } from "@/lib/youtube/url";
import { YouTubeDataClient } from "@/lib/youtube/data-api";

export type IngestFormResult = { ok: true; message: string } | { ok: false; error: string };

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function submitIngest(
  _prev: IngestFormResult | null,
  formData: FormData,
): Promise<IngestFormResult> {
  const url = String(formData.get("url") ?? "").trim();
  const transcriptText = String(formData.get("transcript") ?? "").trim();

  if (!url) return { ok: false, error: "Paste a YouTube URL." };
  const ref = parseYouTubeUrl(url);
  if (!ref) return { ok: false, error: "Not a recognisable YouTube URL." };

  try {
    if (ref.kind !== "video" && transcriptText) {
      return { ok: false, error: "A pasted transcript only applies to a single video URL." };
    }

    let video: Video;

    if (transcriptText) {
      // Manual transcript: store metadata only, skip the caption pipeline
      // entirely, and write the transcript with source='manual'.
      const client = new YouTubeDataClient();
      const resolved = await client.resolve(ref);
      if (!resolved || resolved.kind !== "video") {
        return { ok: false, error: "YouTube returned no such video." };
      }
      video = await upsertVideoFromMetadata(resolved.video, null);

      const words = wordCount(transcriptText);
      await db
        .insert(transcripts)
        .values({ videoId: video.id, language: null, source: "manual", wordCount: words, content: transcriptText })
        .onDuplicateKeyUpdate({ set: { source: "manual", wordCount: words, content: transcriptText } });
    } else if (ref.kind === "video") {
      const summary = await ingestUrl(url);
      const [stored] = summary.videos;
      if (!stored) return { ok: false, error: "Could not fetch this video's metadata." };
      video = stored;
    } else {
      // Playlist or channel: ingest and report a summary. No auto-analyse —
      // that could be dozens of paid API calls from one form submit.
      const summary = await ingestUrl(url, { limit: BULK_INGEST_LIMIT });
      revalidatePath("/");
      revalidatePath("/sources");
      return {
        ok: true,
        message:
          `Ingested ${summary.videos.length} video(s). Captions: ` +
          `${summary.captionCounts.available} available, ${summary.captionCounts.none} none, ` +
          `${summary.captionCounts.failed} failed. Analyse them from the digest feed.`,
      };
    }

    // Direct-analyse: only reachable for a single video (URL or manual paste).
    const [transcriptRow] = await db
      .select({ wordCount: transcripts.wordCount })
      .from(transcripts)
      .where(eq(transcripts.videoId, video.id))
      .limit(1);

    if (!transcriptRow) {
      revalidatePath("/");
      return { ok: true, message: `Ingested "${video.title}" — no transcript available to analyse.` };
    }

    const estimatedUsd = estimateAnalysisCostUsd(transcriptRow.wordCount, DEFAULT_MODEL);
    await assertWithinCap(estimatedUsd);

    const result = await analyzeVideo(video);
    revalidatePath("/");
    revalidatePath(`/video/${video.id}`);

    if (result.status === "ok") {
      return { ok: true, message: `Analysed "${video.title}" for ${formatUsd(result.costUsd)}.` };
    }
    if (result.status === "skipped") {
      return { ok: true, message: `"${video.title}" ingested — ${result.why.replace("-", " ")}.` };
    }
    return { ok: false, error: `Analysis failed: ${result.error}` };
  } catch (err) {
    if (err instanceof SpendCapExceededError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : "Ingest failed." };
  }
}
