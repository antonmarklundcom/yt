import type { CaptionStatus } from "@/db/schema";
import type { DigestSort, ReadFilter } from "@/lib/videos";

const STATUS_OPTIONS: { value: CaptionStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "available", label: "Captioned" },
  { value: "unknown", label: "Not probed" },
  { value: "none", label: "No captions" },
  { value: "failed", label: "Fetch failed" },
];

const FILTER_OPTIONS: { value: ReadFilter | ""; label: string }[] = [
  { value: "", label: "All videos" },
  { value: "unread", label: "Unread" },
  { value: "pinned", label: "Pinned" },
];

const SORT_OPTIONS: { value: DigestSort; label: string }[] = [
  { value: "published", label: "Newest published" },
  { value: "added", label: "Recently added" },
  { value: "views", label: "Most viewed" },
];

const SELECT_CLASS =
  "surface-border rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] focus:outline-none";

/**
 * Plain GET form — no client JS required, works with the URL as the only
 * state, and search engines never see it anyway (robots: noindex, PLAN.md §0).
 */
export function DigestFilters({
  q,
  status,
  filter,
  sort,
}: {
  q: string;
  status: string;
  filter: string;
  sort: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search titles…"
        className="surface-border w-64 rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none"
      />
      <select name="status" defaultValue={status} className={SELECT_CLASS}>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select name="filter" defaultValue={filter} className={SELECT_CLASS}>
        {FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select name="sort" defaultValue={sort} className={SELECT_CLASS}>
        {SORT_OPTIONS.map((opt) => (
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
