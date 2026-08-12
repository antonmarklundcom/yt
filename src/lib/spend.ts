import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { spendLog } from "@/db/schema";
import { MODEL_RATES, type AnalysisModel } from "@/lib/analysis/pricing";

/**
 * Spend accounting and the hard monthly cap (PLAN.md §5 row 07).
 *
 * PLAN.md §0 replaced the per-video cost-approval modal with "a monthly spend
 * counter + hard cap", on the reasoning that a modal per $0.02 video is
 * friction protecting nothing. That only holds if the cap is real — so this
 * refuses to *start* work that would exceed it, rather than noticing afterwards.
 */

const DEFAULT_CAP_USD = 25;

export function monthlyCapUsd(): number {
  const raw = process.env.MONTHLY_SPEND_CAP_USD;
  if (raw === undefined || raw === "") return DEFAULT_CAP_USD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `MONTHLY_SPEND_CAP_USD must be a non-negative number, got "${raw}". ` +
        "Set it to 0 to block all spend.",
    );
  }
  return parsed;
}

/** UTC day key, matching spend_log.day. The pool runs at timezone "Z". */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function utcMonthRange(at: Date = new Date()): { start: string; end: string } {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  // Day 0 of the next month is the last day of this one — avoids month-length
  // and leap-year special cases entirely.
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: utcDay(start), end: utcDay(end) };
}

/**
 * Add to the running total for a UTC day.
 *
 * Increments in SQL rather than read-modify-write, so concurrent analyses (the
 * poller and an interactive run at the same time) cannot lose an update.
 */
export async function recordSpend(costUsd: number, at: Date = new Date()): Promise<void> {
  if (costUsd <= 0) return;
  const day = utcDay(at);
  const amount = costUsd.toFixed(6);

  await db
    .insert(spendLog)
    .values({ day, costUsd: amount })
    .onDuplicateKeyUpdate({
      set: { costUsd: sql`${spendLog.costUsd} + ${amount}` },
    });
}

export async function monthToDateUsd(at: Date = new Date()): Promise<number> {
  const { start, end } = utcMonthRange(at);
  const [row] = await db
    .select({ total: sql<string | null>`sum(${spendLog.costUsd})` })
    .from(spendLog)
    .where(and(gte(spendLog.day, start), lte(spendLog.day, end)));
  return Number(row?.total ?? 0) || 0;
}

export type SpendStatus = {
  monthToDateUsd: number;
  capUsd: number;
  remainingUsd: number;
  /** 0–1+, for the header meter the UI track renders. */
  fraction: number;
  overCap: boolean;
};

export async function spendStatus(at: Date = new Date()): Promise<SpendStatus> {
  const capUsd = monthlyCapUsd();
  const spent = await monthToDateUsd(at);
  return {
    monthToDateUsd: spent,
    capUsd,
    remainingUsd: Math.max(0, capUsd - spent),
    fraction: capUsd > 0 ? spent / capUsd : 1,
    overCap: spent >= capUsd,
  };
}

export class SpendCapExceededError extends Error {
  constructor(
    message: string,
    readonly status: SpendStatus,
    readonly estimatedUsd: number,
  ) {
    super(message);
    this.name = "SpendCapExceededError";
  }
}

/**
 * The gate. Throws if the estimated cost would push month-to-date past the cap.
 *
 * Checks the *whole* estimate up front rather than per item, because a batch is
 * submitted as one unit — discovering the cap halfway through is not something
 * you can act on once the requests are already in flight.
 */
export async function assertWithinCap(
  estimatedUsd: number,
  at: Date = new Date(),
): Promise<SpendStatus> {
  const status = await spendStatus(at);

  if (status.monthToDateUsd + estimatedUsd > status.capUsd) {
    throw new SpendCapExceededError(
      `Refusing to start: estimated $${estimatedUsd.toFixed(4)} would take ` +
        `month-to-date spend from $${status.monthToDateUsd.toFixed(4)} to ` +
        `$${(status.monthToDateUsd + estimatedUsd).toFixed(4)}, over the ` +
        `$${status.capUsd.toFixed(2)} cap (MONTHLY_SPEND_CAP_USD). ` +
        `Raise the cap, wait for the month to roll over, or process fewer videos.`,
      status,
      estimatedUsd,
    );
  }
  return status;
}

// ---------------------------------------------------------------------------
// estimation
// ---------------------------------------------------------------------------

/**
 * Tokens per word.
 *
 * PLAN.md §1 works from 5,000 spoken words to ~7,000 input tokens. Caption text
 * is unpunctuated and repetitive, which tokenises slightly worse than prose, so
 * the ratio is rounded up — an estimate that runs high makes the cap trip early,
 * which is the safe direction for a guard.
 */
const TOKENS_PER_WORD = 1.45;

/** PLAN.md §1: the structured analysis output is roughly 2,500 tokens. */
const ESTIMATED_OUTPUT_TOKENS = 2_500;

/** System prompt plus title/channel/duration framing. */
const PROMPT_OVERHEAD_TOKENS = 700;

export function estimateAnalysisCostUsd(
  wordCount: number,
  model: AnalysisModel,
  options: { batch?: boolean } = {},
): number {
  const rates = MODEL_RATES[model];
  const inputTokens = Math.ceil(wordCount * TOKENS_PER_WORD) + PROMPT_OVERHEAD_TOKENS;
  const cost =
    (inputTokens * rates.input + ESTIMATED_OUTPUT_TOKENS * rates.output) / 1_000_000;
  // PLAN.md §1.2: the Batch API is a flat 50% discount.
  return options.batch ? cost * 0.5 : cost;
}

export function estimateBatchCostUsd(
  wordCounts: number[],
  model: AnalysisModel,
  options: { batch?: boolean } = {},
): number {
  return wordCounts.reduce((sum, w) => sum + estimateAnalysisCostUsd(w, model, options), 0);
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}
