/**
 * Dashboard shell landing state (PR-08). The real digest feed — video cards,
 * filter/search, pagination — is PR-09's scope. This is what renders on day
 * one, when the corpus is genuinely empty (docs/HANDOFF-SONNET.md §1).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        Digest
      </p>
      <h1 className="text-2xl font-semibold text-balance text-[var(--color-ink)]">
        Nothing ingested yet
      </h1>
      <p className="max-w-md text-[var(--color-ink-muted)] leading-relaxed">
        Add a channel, playlist or single video from{" "}
        <span className="text-[var(--color-ink)]">Ingest</span> and its analysis will
        appear here.
      </p>
    </main>
  );
}
