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
 * Output language (PLAN.md §9 PR-22b) — preparation, not a feature.
 *
 * English is the only language the owner needs today, so there is no UI and no
 * setting. What this buys is that adding one later is a one-line change rather
 * than a change to every prompt builder and their stored-version accounting.
 *
 * The value is a plain language name ("Swedish", "Spanish"), not a BCP-47 tag:
 * it is interpolated into an instruction a model reads, and "sv-SE" is a worse
 * instruction than "Swedish".
 */
export const DEFAULT_PROMPT_LANGUAGE = "en";

export function isDefaultLanguage(language: string | undefined): boolean {
  return language === undefined || language === DEFAULT_PROMPT_LANGUAGE;
}

/**
 * Version 1 is English, and stays byte-identical to everything already stored.
 * Anything else is version 2 — a prompt carrying a language instruction.
 *
 * Which language is not recorded. `analyses` has no column for it, and adding
 * one is a schema change this PR is not approved to make; the version at least
 * marks the row as not-the-English-prompt so it is never silently compared
 * against version 1 output. Whoever adds the UI adds the column.
 */
export function analysisPromptVersion(language?: string): number {
  return isDefaultLanguage(language) ? ANALYSIS_PROMPT_VERSION : ANALYSIS_PROMPT_VERSION + 1;
}

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

/**
 * `outlines` has no prompt_version column, so this is currently informational —
 * it exists so the two prompt families answer the same question the same way,
 * and so the column, when it arrives, has something to store.
 */
export function outlinePromptVersion(language?: string): number {
  return isDefaultLanguage(language) ? OUTLINE_PROMPT_VERSION : OUTLINE_PROMPT_VERSION + 1;
}
