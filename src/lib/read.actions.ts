"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { videos } from "@/db/schema";

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
