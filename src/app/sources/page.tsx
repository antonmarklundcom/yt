import type { Metadata } from "next";
import { AddSourceForm } from "@/components/AddSourceForm";
import { removeSource, setSourceActive } from "@/lib/sources.actions";
import { listSources } from "@/lib/sources";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage() {
  const rows = await listSources();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        Sources
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">
        Tracked channels &amp; playlists
      </h1>

      <div className="surface-border surface-card mt-6 p-5">
        <AddSourceForm />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-ink-muted)]">Nothing tracked yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((source) => (
            <li
              key={source.id}
              className="surface-border surface-card flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                  {source.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                  {source.kind === "channel" ? "Channel" : "Playlist"} ·{" "}
                  {source.active ? "Active" : "Paused"} · last polled{" "}
                  {source.lastPolledAt ? formatDate(source.lastPolledAt) : "never"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={setSourceActive.bind(null, source.id, !source.active)}>
                  <button
                    type="submit"
                    className="surface-border rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                  >
                    {source.active ? "Pause" : "Resume"}
                  </button>
                </form>
                <form action={removeSource.bind(null, source.id)}>
                  <button
                    type="submit"
                    className="surface-border rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] hover:border-[var(--color-danger)]"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
