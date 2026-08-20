import { and, asc, desc, eq, getTableColumns, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyses, videos, type Analysis, type CaptionStatus, type Video } from "@/db/schema";

export const DIGEST_PAGE_SIZE = 24;

/**
 * Read-state filter (PR-19). "unread" is `read_at is null`; "pinned" is the
 * flag. They are one control rather than two checkboxes because the useful
 * question is always "show me one of these", never "show me both at once".
 */
export type ReadFilter = "unread" | "pinned";

/** Sort orders offered by the feed. `published` stays the default. */
export type DigestSort = "published" | "added" | "views";

export type DigestQuery = {
  q?: string;
  status?: CaptionStatus;
  filter?: ReadFilter;
  sort?: DigestSort;
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
const FILTER_VALUES: ReadFilter[] = ["unread", "pinned"];
const SORT_VALUES: DigestSort[] = ["published", "added", "views"];

export function parseCaptionStatus(value: string | undefined): CaptionStatus | undefined {
  return STATUS_VALUES.find((s) => s === value);
}

export function parseReadFilter(value: string | undefined): ReadFilter | undefined {
  return FILTER_VALUES.find((f) => f === value);
}

export function parseDigestSort(value: string | undefined): DigestSort | undefined {
  return SORT_VALUES.find((s) => s === value);
}

/**
 * Free-text match across the title and the stored analysis (PR-21).
 *
 * EXISTS over `analyses` rather than a join: the table is append-only, so a
 * join would multiply feed rows by the number of attempts per video and break
 * both the COUNT and the LIMIT/OFFSET paging.
 *
 * `takeaways` and `ideas` are JSON columns; MySQL will not LIKE them directly,
 * hence the CAST. That searches the raw JSON — keys and punctuation included —
 * which is exactly what §9's "raw JSON of takeaways/ideas" asks for and is
 * good enough for a private tool. Nothing here is interpolated: `like()` and
 * the `sql` template both parameterise their values.
 */
function matchesQuery(q: string) {
  const needle = `%${q}%`;
  return or(
    like(videos.title, needle),
    sql`exists (
      select 1 from ${analyses} a
      where a.video_id = ${videos.id}
        and a.status = 'ok'
        and (
          a.summary like ${needle}
          or cast(a.takeaways as char) like ${needle}
          or cast(a.ideas as char) like ${needle}
        )
    )`,
  );
}

function orderFor(sort: DigestSort | undefined) {
  switch (sort) {
    case "added":
      return [desc(videos.createdAt), desc(videos.id)];
    case "views":
      // Nulls sort last: a video whose view count was never fetched is not the
      // most-watched thing in the corpus.
      return [asc(isNull(videos.viewCount)), desc(videos.viewCount), desc(videos.id)];
    default:
      return [desc(videos.publishedAt), desc(videos.id)];
  }
}

/**
 * Paginates in SQL (LIMIT/OFFSET + a COUNT), not in memory — the corpus grows
 * without bound (docs/HANDOFF-SONNET.md §6, PR-09 row).
 */
export async function listDigestVideos(query: DigestQuery): Promise<DigestPage> {
  const page = Math.max(1, query.page ?? 1);
  const conditions = [
    query.q ? matchesQuery(query.q) : undefined,
    query.status ? eq(videos.captionStatus, query.status) : undefined,
    query.filter === "unread" ? isNull(videos.readAt) : undefined,
    query.filter === "pinned" ? eq(videos.pinned, true) : undefined,
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
    // The id tiebreaker is not cosmetic: published_at and view_count are both
    // nullable and both repeat, and without a unique last key MySQL is free to
    // order ties differently per page, which drops or duplicates rows across
    // LIMIT/OFFSET boundaries.
    .orderBy(...orderFor(query.sort))
    .limit(DIGEST_PAGE_SIZE)
    .offset((clampedPage - 1) * DIGEST_PAGE_SIZE);

  return { videos: rows, total, page: clampedPage, totalPages };
}

/**
 * First-open marks a video read.
 *
 * `read_at is null` in the WHERE is what makes it "first read" rather than
 * "last opened" — re-reading an analysis is free and expected, and a timestamp
 * that moved every time would make the unread filter the only thing the column
 * could answer. Deliberately not a server action: this runs during the video
 * page's render, and revalidatePath() is illegal there.
 */
export async function markVideoRead(videoId: number, at: Date = new Date()): Promise<void> {
  await db
    .update(videos)
    .set({ readAt: at })
    .where(and(eq(videos.id, videoId), isNull(videos.readAt)));
}
