import { translator, type Locale } from "@/lib/i18n";
import { formatUsd, type SpendStatus } from "@/lib/spend";

/**
 * Renders the cap, not just the spend (docs/HANDOFF-SONNET.md §6, PR-08 row) —
 * "$3.40" alone tells you nothing without the ceiling it is measured against.
 */
export function SpendMeter({ status, locale }: { status: SpendStatus; locale: Locale }) {
  const t = translator(locale);
  const pct = Math.min(100, Math.round(status.fraction * 100));
  const barColor = status.overCap
    ? "bg-[var(--color-danger)]"
    : status.fraction > 0.8
      ? "bg-[var(--color-warn)]"
      : "bg-[var(--color-accent)]";

  return (
    <div className="flex flex-col gap-1.5" title={`${formatUsd(status.monthToDateUsd)} / ${formatUsd(status.capUsd)} ${t("spend.tooltip")}`}>
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="font-medium text-[var(--color-ink)]">
          {formatUsd(status.monthToDateUsd)}
        </span>
        <span className="text-[var(--color-ink-muted)]">/ {formatUsd(status.capUsd)}</span>
      </div>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--color-surface)]">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
