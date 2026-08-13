import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { videos, type CaptionStatus, type Video } from "@/db/schema";

export const DIGEST_PAGE_SIZE = 24;

export type DigestQuery = {
  q?: string;
  status?: CaptionStatus;
  page?: number;
};

export type DigestPage = {
  videos: Video[];
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
    .select()
    .from(videos)
    .where(where)
    .orderBy(desc(videos.publishedAt), desc(videos.id))
    .limit(DIGEST_PAGE_SIZE)
    .offset((clampedPage - 1) * DIGEST_PAGE_SIZE);

  return { videos: rows, total, page: clampedPage, totalPages };
}
