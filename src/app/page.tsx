/**
 * Placeholder shell. The real dashboard is PR-08 (Sonnet track) — this exists so
 * PR-02 satisfies its done-when ("`npm run build` passes") without pre-empting
 * the UI track's scope.
 *
 * Deliberately static: no database call at render time, so the build succeeds on
 * a machine with no DATABASE_URL.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium tracking-widest text-[var(--color-accent)] uppercase">
          Scaffold
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-balance">
          YouTube Intelligence Workspace
        </h1>
      </div>
      <p className="text-[var(--color-ink-muted)] leading-relaxed">
        Next.js, Drizzle and the MySQL pool are wired up. The dashboard, digest feed
        and analysis views land in PR-08 onward.
      </p>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Verify the database connection with{" "}
        <code className="rounded bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[var(--color-ink)]">
          npm run db:check
        </code>
        .
      </p>
    </main>
  );
}
