import type { AnalysisState } from "@/lib/analysis/state";

const LABEL: Record<AnalysisState, string> = {
  analysed: "Analysed",
  failed: "Analysis failed",
  pending: "Pending analysis",
  unanalysable: "",
};

const CLASS: Record<AnalysisState, string> = {
  analysed: "bg-[var(--color-accent-ink)] text-[var(--color-accent)]",
  failed: "bg-[color-mix(in_srgb,var(--color-danger)_18%,transparent)] text-[var(--color-danger)]",
  pending: "bg-[var(--color-surface)] text-[var(--color-ink-muted)]",
  unanalysable: "",
};

/**
 * Sits next to the caption badge. `unanalysable` renders nothing — the caption
 * badge already says why, and two muted badges saying the same thing is noise.
 */
export function AnalysisBadge({ state }: { state: AnalysisState }) {
  if (state === "unanalysable") return null;
  return (
    <span
      className={`surface-border inline-flex w-fit items-center rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium ${CLASS[state]}`}
    >
      {LABEL[state]}
    </span>
  );
}
