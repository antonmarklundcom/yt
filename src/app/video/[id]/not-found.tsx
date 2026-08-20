import Link from "next/link";

/**
 * Reached via notFound() for both a non-numeric id and an id with no row —
 * the same outcome from the reader's point of view.
 */
export default function VideoNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="surface-border surface-card flex flex-col items-start gap-4 p-8">
        <div>
          <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
            404
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">No such video</h1>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          This video is not in the workspace. It may have been removed, or the link may be wrong.
        </p>
        <Link
          href="/"
          className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] transition-opacity hover:opacity-90"
        >
          Back to the digest
        </Link>
      </div>
    </main>
  );
}
