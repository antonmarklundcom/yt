/**
 * PLAN.md §4 — the analysis contract. FROZEN.
 *
 * This is the interface the Opus track (PR-06 produces it) and the Sonnet track
 * (PR-10 renders it) share. Types live here rather than in the schema or the
 * prompt module because both of those depend on them, and because the UI track
 * needs to import them without pulling in a database connection.
 *
 * The model returns strict JSON in exactly this shape — no prose, no markdown
 * fences. PR-06 parses defensively and stores the raw response on failure
 * rather than crashing the batch.
 */

export type AnalysisHook = {
  technique: string;
  first_30s: string;
  why_it_works: string;
};

export type AnalysisTimelineEntry = {
  /** "MM:SS" or "HH:MM:SS". Kept as a string — it is a display label, not a duration. */
  ts: string;
  topic: string;
  beat: string;
};

export type AnalysisGap = {
  gap: string;
  counter_angle: string;
};

export type AnalysisIdea = {
  title: string;
  premise: string;
  why_now: string;
};

/** Exactly the JSON object the model returns. */
export type AnalysisPayload = {
  summary: string;
  takeaways: string[];
  hook: AnalysisHook;
  timeline: AnalysisTimelineEntry[];
  gaps: AnalysisGap[];
  ideas: AnalysisIdea[];
};

/**
 * Bump when the prompt changes in a way that alters the meaning of stored
 * output, so old analyses stay interpretable rather than silently mixing
 * conventions. Stored per row as `analyses.prompt_version`.
 */
export const ANALYSIS_PROMPT_VERSION = 1;

/**
 * The five-part outline structure (PLAN.md §4). Generated per idea, on demand —
 * separate call, separate table, so it never inflates the per-video analysis cost.
 */
export type OutlinePayload = {
  hook: string;
  rehook: string;
  teaching_points: string[];
  twist: string;
  cta: string;
};

export const OUTLINE_PROMPT_VERSION = 1;
