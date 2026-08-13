function buildHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/?${next.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const params = new URLSearchParams(
    Object.entries(searchParams).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return (
    <nav className="flex items-center justify-center gap-4 pt-4 text-sm">
      {page > 1 ? (
        <a href={buildHref(params, page - 1)} className="text-[var(--color-ink)] hover:text-[var(--color-accent)]">
          ← Previous
        </a>
      ) : (
        <span className="text-[var(--color-ink-muted)]">← Previous</span>
      )}
      <span className="text-[var(--color-ink-muted)]">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <a href={buildHref(params, page + 1)} className="text-[var(--color-ink)] hover:text-[var(--color-accent)]">
          Next →
        </a>
      ) : (
        <span className="text-[var(--color-ink-muted)]">Next →</span>
      )}
    </nav>
  );
}
