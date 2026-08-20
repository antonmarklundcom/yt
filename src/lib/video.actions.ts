"use server";

/** Per-video mutations from the UI: read state, pinning, and deletion. */

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { analyses, outlines, transcripts, videos } from "@/db/schema";
import { requireOwner } from "@/lib/auth/session";

/**
 * Pinning is the counterweight to an unbounded feed: the corpus only grows, and
 * without it the videos worth returning to sink below the fold within a week.
 */
export async function setVideoPinned(videoId: number, pinned: boolean): Promise<void> {
  await db.update(videos).set({ pinned }).where(eq(videos.id, videoId));
  revalidatePath("/");
  revalidatePath(`/video/${videoId}`);
}

/** Explicit unread, so a video opened by accident can be put back in the queue. */
export async function setVideoUnread(videoId: number): Promise<void> {
  await db.update(videos).set({ readAt: null }).where(eq(videos.id, videoId));
  revalidatePath("/");
  revalidatePath(`/video/${videoId}`);
}

/**
 * Delete a video and everything derived from it.
 *
 * Ordered children-first so a failure halfway leaves orphans that the next
 * attempt still finds by video_id, rather than a video row whose transcript and
 * analyses are unreachable. Outlines hang off analyses, not off the video, so
 * their ids have to be collected before the analyses rows go.
 */
export async function deleteVideo(videoId: number): Promise<void> {
  // Reading, pinning and marking unread are free and stay open to an employee.
  // Deleting destroys analyses the owner paid for, so it does not.
  await requireOwner("delete a video");

  const analysisRows = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(eq(analyses.videoId, videoId));
  const analysisIds = analysisRows.map((row) => row.id);

  if (analysisIds.length > 0) {
    await db.delete(outlines).where(inArray(outlines.analysisId, analysisIds));
  }
  await db.delete(analyses).where(eq(analyses.videoId, videoId));
  await db.delete(transcripts).where(eq(transcripts.videoId, videoId));
  await db.delete(videos).where(eq(videos.id, videoId));

  revalidatePath("/");
  redirect("/");
}
