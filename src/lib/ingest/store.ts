import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sources, videos, type Source, type Video } from "@/db/schema";
import type { ChannelMetadata, PlaylistMetadata, VideoMetadata } from "@/lib/youtube/data-api";

/**
 * Idempotent writes for videos and sources (PLAN.md §3: "Every ingest script
 * uses idempotent upsert on youtube_id so it is safe to re-run").
 *
 * Every upsert re-selects by the natural key afterwards rather than trusting
 * insertId. On MySQL, ON DUPLICATE KEY UPDATE reports insertId 0 when the row
 * already existed, so trusting it would silently attach transcripts to video id
 * 0 on every re-run — exactly the bug that makes a re-runnable script not
 * actually re-runnable.
 */

export async function upsertVideoFromMetadata(
  meta: VideoMetadata,
  sourceId: number | null,
): Promise<Video> {
  const values = {
    youtubeId: meta.youtubeId,
    sourceId,
    title: meta.title,
    channelTitle: meta.channelTitle || null,
    publishedAt: meta.publishedAt,
    durationSeconds: meta.durationSeconds,
    viewCount: meta.viewCount,
    thumbnailUrl: meta.thumbnailUrl,
  };

  await db
    .insert(videos)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        title: values.title,
        channelTitle: values.channelTitle,
        publishedAt: values.publishedAt,
        durationSeconds: values.durationSeconds,
        // View count is the one field worth refreshing on re-ingest; the rest
        // rarely change and caption_status must NOT be reset here or every
        // re-run would re-probe videos already known to have no captions.
        viewCount: values.viewCount,
        thumbnailUrl: values.thumbnailUrl,
        // Only claim a video for a source if it does not already belong to one.
        ...(sourceId !== null ? { sourceId } : {}),
      },
    });

  const row = await findVideoByYoutubeId(meta.youtubeId);
  if (!row) throw new Error(`Upserted video ${meta.youtubeId} but could not read it back`);
  return row;
}

export async function findVideoByYoutubeId(youtubeId: string): Promise<Video | null> {
  const [row] = await db.select().from(videos).where(eq(videos.youtubeId, youtubeId)).limit(1);
  return row ?? null;
}

export async function upsertChannelSource(channel: ChannelMetadata): Promise<Source> {
  return upsertSource({
    kind: "channel",
    youtubeId: channel.channelId,
    title: channel.title,
    url: channel.handle
      ? `https://www.youtube.com/@${channel.handle}`
      : `https://www.youtube.com/channel/${channel.channelId}`,
  });
}

export async function upsertPlaylistSource(playlist: PlaylistMetadata): Promise<Source> {
  return upsertSource({
    kind: "playlist",
    youtubeId: playlist.playlistId,
    title: playlist.title,
    url: `https://www.youtube.com/playlist?list=${playlist.playlistId}`,
  });
}

async function upsertSource(input: {
  kind: "channel" | "playlist";
  youtubeId: string;
  title: string;
  url: string;
}): Promise<Source> {
  await db
    .insert(sources)
    .values(input)
    // Deliberately does not touch `active` or `last_polled_at`: re-adding a
    // source the user paused should not silently un-pause it, and must not
    // rewind the poll cursor.
    .onDuplicateKeyUpdate({ set: { title: input.title, url: input.url } });

  const [row] = await db
    .select()
    .from(sources)
    .where(eq(sources.youtubeId, input.youtubeId))
    .limit(1);
  if (!row) throw new Error(`Upserted source ${input.youtubeId} but could not read it back`);
  return row;
}
