import type { CaptionStatus } from "@/db/schema";

const STATUS_OPTIONS: { value: CaptionStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "available", label: "Captioned" },
  { value: "unknown", label: "Not probed" },
  { value: "none", label: "No captions" },
  { value: "failed", label: "Fetch failed" },
];

/**
 * Plain GET form — no client JS required, works with the URL as the only
 * state, and search engines never see it anyway (robots: noindex, PLAN.md §0).
 */
export function DigestFilters({ q, status }: { q: string; status: string }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search titles…"
        className="surface-border w-64 rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none"
      />
      <select
        name="status"
        defaultValue={status}
        className="surface-border rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] focus:outline-none"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] transition-opacity hover:opacity-90"
      >
        Filter
      </button>
    </form>
  );
}
