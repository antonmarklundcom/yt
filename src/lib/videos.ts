import { and, desc, eq, getTableColumns, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyses, videos, type Analysis, type CaptionStatus, type Video } from "@/db/schema";

export const DIGEST_PAGE_SIZE = 24;

export type DigestQuery = {
  q?: string;
  status?: CaptionStatus;
  page?: number;
};

/**
 * A feed row carries the state of its newest analysis (PR-17). This is a
 * correlated subquery rather than a join because `analyses` is append-only —
 * a join emits one row per attempt and would need de-duplicating in code, and
 * would break the SQL-side pagination the feed depends on.
 */
export type DigestVideo = Video & { analysisStatus: Analysis["status"] | null };

export type DigestPage = {
  videos: DigestVideo[];
  total: number;
  page: number;
  totalPages: number;
};

const STATUS_VALUES: CaptionStatus[] = ["unknown", "available", "none", "failed"];

export function parseCaptionStatus(value: string | undefined): CaptionStatus | undefined {
  return STATUS_VALUES.find((s) => s === value);
}

/**
 * Paginates in SQL (LIMIT/OFFSET + a COUNT), not in memory — the corpus grows
 * without bound (docs/HANDOFF-SONNET.md §6, PR-09 row).
 */
export async function listDigestVideos(query: DigestQuery): Promise<DigestPage> {
  const page = Math.max(1, query.page ?? 1);
  const conditions = [
    query.q ? like(videos.title, `%${query.q}%`) : undefined,
    query.status ? eq(videos.captionStatus, query.status) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const countRows = await db
    .select({ total: sql<number>`count(*)` })
    .from(videos)
    .where(where);
  const total = countRows[0]?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / DIGEST_PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const rows = await db
    .select({
      ...getTableColumns(videos),
      analysisStatus: sql<Analysis["status"] | null>`(
        select a.status from ${analyses} a
        where a.video_id = ${videos.id}
        order by a.id desc limit 1
      )`,
    })
    .from(videos)
    .where(where)
    .orderBy(desc(videos.publishedAt), desc(videos.id))
    .limit(DIGEST_PAGE_SIZE)
    .offset((clampedPage - 1) * DIGEST_PAGE_SIZE);

  return { videos: rows, total, page: clampedPage, totalPages };
}
