import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import type {
  AnalysisGap,
  AnalysisHook,
  AnalysisIdea,
  AnalysisTimelineEntry,
  OutlinePayload,
} from "@/lib/analysis/contract";

/**
 * PLAN.md §3 — schema. This is the interface the Opus and Sonnet tracks share;
 * see docs/HANDOFF-SONNET.md for the frozen version.
 *
 * Conventions:
 * - Surrogate int PKs everywhere. Joins are on integers, not 36-byte strings.
 * - youtube_id is the natural key and is uniquely indexed, so every ingest path
 *   can use onDuplicateKeyUpdate and stay safe to re-run (PLAN.md §3).
 * - Money is decimal, never float. A float cost column silently drifts once you
 *   are summing thousands of $0.02 rows against a hard cap.
 * - Timestamps are UTC; the pool sets timezone "Z".
 */

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/**
 * Exactly one row in v1 — auth is HTTP basic at the Hostinger level (PLAN.md §0).
 * The table and the role enum exist from day one so multi-user (§8) is a feature
 * rather than a migration, and so role checks are never retrofitted.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: mysqlEnum("role", ["admin", "user"]).notNull().default("user"),
  /**
   * [PR-23] bcrypt hash, null until a password is set.
   *
   * Nullable rather than required because the seed has always created the row
   * from ADMIN_EMAIL alone, and a NOT NULL column would have made this
   * migration destructive on an existing database. A null hash simply cannot
   * log in — verification never compares against it.
   */
  passwordHash: varchar("password_hash", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// sources — tracked channels and playlists
// ---------------------------------------------------------------------------

export const sources = mysqlTable(
  "sources",
  {
    id: int("id").autoincrement().primaryKey(),
    kind: mysqlEnum("kind", ["channel", "playlist"]).notNull(),
    /** Channel ID (UC…) or playlist ID (PL…, UU…). */
    youtubeId: varchar("youtube_id", { length: 64 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    lastPolledAt: timestamp("last_polled_at"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sources_youtube_id_idx").on(t.youtubeId),
    // The poller's only query: active sources, least recently polled first.
    index("sources_active_polled_idx").on(t.active, t.lastPolledAt),
  ],
);

// ---------------------------------------------------------------------------
// videos
// ---------------------------------------------------------------------------

/**
 * caption_status is the pipeline's state machine (PR-05):
 *   unknown   — not probed yet
 *   available — captions fetched, transcript row exists
 *   none      — the video genuinely has no captions; skipped forever (PLAN.md §0)
 *   failed    — probing broke for a reason that may not recur; safe to retry
 *
 * The none/failed split is load-bearing. Collapsing them either retries videos
 * that will never have captions, or permanently drops videos that hit a
 * transient block.
 */
export const videos = mysqlTable(
  "videos",
  {
    id: int("id").autoincrement().primaryKey(),
    youtubeId: varchar("youtube_id", { length: 16 }).notNull(),
    /** Null for videos added directly by URL rather than discovered via a source. */
    sourceId: int("source_id"),
    title: varchar("title", { length: 512 }).notNull(),
    channelTitle: varchar("channel_title", { length: 255 }),
    publishedAt: timestamp("published_at"),
    durationSeconds: int("duration_seconds"),
    viewCount: bigint("view_count", { mode: "number" }),
    thumbnailUrl: varchar("thumbnail_url", { length: 512 }),
    captionStatus: mysqlEnum("caption_status", ["unknown", "available", "none", "failed"])
      .notNull()
      .default("unknown"),
    captionCheckedAt: timestamp("caption_checked_at"),

    /**
     * [PR-19] Read tracking. Columns rather than a join table because v1 is
     * single-user (PLAN.md §0) — a `video_reads` table would carry a user_id
     * that is always the same value, and every feed query would pay for a join
     * to learn it. Multi-user (§8) turns these into that table; until then this
     * is the honest shape.
     *
     * read_at is null for unread, and is set once — on first open — so it means
     * "when this was first read", not "when it was last touched".
     */
    readAt: timestamp("read_at"),
    pinned: boolean("pinned").notNull().default(false),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("videos_youtube_id_idx").on(t.youtubeId),
    index("videos_source_idx").on(t.sourceId),
    // The feed orders by published_at desc; the backfill scans by caption_status.
    index("videos_published_idx").on(t.publishedAt),
    index("videos_caption_status_idx").on(t.captionStatus),
    // The feed's unread and pinned filters, and the "added" sort order.
    index("videos_read_at_idx").on(t.readAt),
    index("videos_pinned_idx").on(t.pinned),
    index("videos_created_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// transcripts
// ---------------------------------------------------------------------------

/**
 * `source` records where the text came from. 'ai' exists in the enum but is
 * never written in v1 — audio transcription is a paid-tier feature (PLAN.md §0,
 * §8) and costs ~20x more. Having the value here means enabling it later is not
 * a migration; writing it in v1 would be a cost decision, not a code decision.
 */
export const transcripts = mysqlTable(
  "transcripts",
  {
    id: int("id").autoincrement().primaryKey(),
    videoId: int("video_id").notNull(),
    language: varchar("language", { length: 16 }),
    source: mysqlEnum("source", ["captions", "manual", "ai"]).notNull().default("captions"),
    wordCount: int("word_count").notNull().default(0),
    content: longtext("content").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("transcripts_video_id_idx").on(t.videoId)],
);

// ---------------------------------------------------------------------------
// analyses
// ---------------------------------------------------------------------------

/**
 * One row per analysis run. Analyses are never overwritten — re-analysing with a
 * different model or prompt_version inserts a new row, because "analyse once,
 * store forever" (PLAN.md §1.3) only holds if history is not destroyed.
 *
 * Columns marked [+§3] are additive extensions to PLAN.md §3, required by §4 and
 * flagged in the PR-03 description. Nothing in §3 was removed or retyped.
 */
export const analyses = mysqlTable(
  "analyses",
  {
    id: int("id").autoincrement().primaryKey(),
    videoId: int("video_id").notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    promptVersion: smallint("prompt_version").notNull().default(1),

    /** [+§3] §4 requires marking a row failed rather than crashing the batch. */
    status: mysqlEnum("status", ["ok", "failed"]).notNull().default("ok"),

    summary: text("summary"),
    /** [+§3] §4's contract includes `takeaways`, which §3 gave no column. */
    takeaways: json("takeaways").$type<string[]>(),
    /** §4's `hook` object. §3 names this column hook_breakdown. */
    hookBreakdown: json("hook_breakdown").$type<AnalysisHook>(),
    timeline: json("timeline").$type<AnalysisTimelineEntry[]>(),
    gaps: json("gaps").$type<AnalysisGap[]>(),
    ideas: json("ideas").$type<AnalysisIdea[]>(),

    /** [+§3] §4: "store raw response on parse failure". */
    rawResponse: longtext("raw_response"),
    /** [+§3] Why it failed — without this a failed row is undiagnosable. */
    error: varchar("error", { length: 1024 }),

    /** [+§3] Batch API request id (PR-07), null for interactive runs. */
    batchId: varchar("batch_id", { length: 128 }),

    inputTokens: int("input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    /** [+§3] Prompt caching splits input tokens; without these the cost is unauditable. */
    cacheReadTokens: int("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: int("cache_write_tokens").notNull().default(0),

    costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("analyses_video_idx").on(t.videoId),
    index("analyses_status_idx").on(t.status),
    index("analyses_batch_idx").on(t.batchId),
  ],
);

// ---------------------------------------------------------------------------
// batches
// ---------------------------------------------------------------------------

/**
 * One row per submitted Batch API job (PLAN.md §9 PR-15).
 *
 * Before this table the Anthropic API *was* the ledger: the poller called
 * `batches.list()` and filtered to the last 24 hours, because that is the API's
 * own batch ceiling. Two things were wrong with that. A run that submitted a
 * batch and then died — or an outage longer than a day — left a paid batch
 * that nothing would ever look at again, because it had aged out of the window
 * the poller inspected. And `list()` returns every batch on the API key, so a
 * key shared with another project postponed submissions here for reasons this
 * app could not see.
 *
 * Recording the id at submit time makes this app's own database the ledger.
 * Collection walks stored rows and retrieves each one by id, which has no
 * 24-hour horizon, so a stranded batch is recoverable for as long as the
 * provider keeps its results.
 *
 * `status` is this app's view of the job, not a mirror of the provider's:
 *   in_progress — submitted, results not ready
 *   ended       — provider finished it, we have not written the rows yet
 *   collected   — rows are in `analyses`; never looked at again
 *   canceled    — terminal, nothing to collect
 * Only `collected` and `canceled` are terminal, so anything else is retried by
 * the next poll run however long it has been sitting there.
 */
export const batches = mysqlTable(
  "batches",
  {
    id: int("id").autoincrement().primaryKey(),
    /** The provider's batch id (`msgbatch_…`). */
    providerBatchId: varchar("provider_batch_id", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["in_progress", "ended", "collected", "canceled"])
      .notNull()
      .default("in_progress"),
    /**
     * The model the batch was submitted with. Collection prices results against
     * this rather than against whatever the collecting run happens to default
     * to — otherwise a `--model sonnet` batch collected by a plain cron run
     * would be costed as Haiku and the spend counter would understate the bill.
     */
    model: varchar("model", { length: 64 }).notNull(),
    videoCount: int("video_count").notNull().default(0),
    estimatedUsd: decimal("estimated_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    collectedAt: timestamp("collected_at"),
  },
  (t) => [
    // Re-submitting the same provider id is impossible, and the unique index
    // makes recording a submission safely re-runnable.
    uniqueIndex("batches_provider_id_idx").on(t.providerBatchId),
    // The poller's only query: everything not yet terminal.
    index("batches_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// outlines
// ---------------------------------------------------------------------------

/**
 * Generated on demand from one idea in an analysis, so the five-part outline
 * never inflates the per-video analysis cost. idea_index points into
 * `analyses.ideas`.
 */
export const outlines = mysqlTable(
  "outlines",
  {
    id: int("id").autoincrement().primaryKey(),
    analysisId: int("analysis_id").notNull(),
    ideaIndex: smallint("idea_index").notNull(),

    /**
     * [+§3] Mirrors `analyses.status`. A generation that failed used to write
     * nothing at all, so the only record of a paid, failed call was a toast
     * that vanished on reload — undiagnosable after the fact. `content` is null
     * on a failed row; readers filter on status.
     */
    status: mysqlEnum("status", ["ok", "failed"]).notNull().default("ok"),
    /** [+§3] Why it failed. Same 1024-char budget as `analyses.error`. */
    error: varchar("error", { length: 1024 }),

    content: json("content").$type<OutlinePayload>(),
    /** Kept alongside the parsed form so a bad parse is still recoverable. */
    rawResponse: longtext("raw_response"),
    model: varchar("model", { length: 64 }),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One outline per idea — regenerating replaces rather than accumulates.
    // A failed row occupies that slot too, so a retry overwrites the failure
    // instead of stacking; a *successful* outline is never overwritten by a
    // later failure (see recordOutlineFailure in analysis/outline.ts).
    uniqueIndex("outlines_analysis_idea_idx").on(t.analysisId, t.ideaIndex),
  ],
);

// ---------------------------------------------------------------------------
// topics / video_topics
// ---------------------------------------------------------------------------

/**
 * Nothing in v1 reads these. They exist so PLAN.md §7 (cross-corpus topic
 * intelligence) is a filter over stored analyses rather than a re-ingest of the
 * entire corpus. Topics are assigned at analysis time and are entirely
 * open-ended — no topic is hardcoded anywhere (§7).
 */
export const topics = mysqlTable(
  "topics",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
  },
  (t) => [uniqueIndex("topics_slug_idx").on(t.slug)],
);

export const videoTopics = mysqlTable(
  "video_topics",
  {
    videoId: int("video_id").notNull(),
    topicId: int("topic_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.topicId] }),
    index("video_topics_topic_idx").on(t.topicId),
  ],
);

// ---------------------------------------------------------------------------
// spend_log
// ---------------------------------------------------------------------------

/**
 * One row per UTC day, incremented as analyses complete. Drives the header
 * counter and the hard monthly cap (PR-07).
 *
 * A daily rollup rather than a per-call ledger: the cap is monthly, the header
 * shows a month total, and summing 31 rows beats summing thousands of analysis
 * rows on every page load. The per-call detail is not lost — it lives on
 * analyses.cost_usd.
 */
export const spendLog = mysqlTable(
  "spend_log",
  {
    id: int("id").autoincrement().primaryKey(),
    /** UTC calendar day. */
    day: date("day", { mode: "string" }).notNull(),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  },
  (t) => [uniqueIndex("spend_log_day_idx").on(t.day)],
);

// ---------------------------------------------------------------------------
// relations
// ---------------------------------------------------------------------------

/**
 * No foreign key constraints are declared. Ingest is idempotent and inherently
 * out of order — a video can arrive before its source row is committed — and a
 * mid-batch FK violation would abort a whole poll run. Referential integrity is
 * enforced by the upsert paths; these relations exist for query ergonomics.
 */

export const sourcesRelations = relations(sources, ({ many }) => ({
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  source: one(sources, { fields: [videos.sourceId], references: [sources.id] }),
  transcript: one(transcripts, { fields: [videos.id], references: [transcripts.videoId] }),
  analyses: many(analyses),
  videoTopics: many(videoTopics),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  video: one(videos, { fields: [transcripts.videoId], references: [videos.id] }),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  video: one(videos, { fields: [analyses.videoId], references: [videos.id] }),
  outlines: many(outlines),
}));

export const outlinesRelations = relations(outlines, ({ one }) => ({
  analysis: one(analyses, { fields: [outlines.analysisId], references: [analyses.id] }),
}));

export const topicsRelations = relations(topics, ({ many }) => ({
  videoTopics: many(videoTopics),
}));

export const videoTopicsRelations = relations(videoTopics, ({ one }) => ({
  video: one(videos, { fields: [videoTopics.videoId], references: [videos.id] }),
  topic: one(topics, { fields: [videoTopics.topicId], references: [topics.id] }),
}));

// ---------------------------------------------------------------------------
// inferred types — import these rather than redeclaring row shapes in the UI
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type Outline = typeof outlines.$inferSelect;
export type NewOutline = typeof outlines.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type SpendLogRow = typeof spendLog.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;

export type CaptionStatus = Video["captionStatus"];
export type BatchStatus = Batch["status"];
export type SourceKind = Source["kind"];
