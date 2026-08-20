import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="surface-border surface-card flex flex-col items-start gap-4 p-8">
        <div>
          <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
            404
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">Page not found</h1>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nothing lives at this URL.
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
