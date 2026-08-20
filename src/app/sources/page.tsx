import type { Metadata } from "next";
import { AddSourceForm } from "@/components/AddSourceForm";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { SourceTitleForm } from "@/components/SourceTitleForm";
import { removeSource, setSourceActive } from "@/lib/sources.actions";
import { listSourcesWithCounts } from "@/lib/sources";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sources" };

const BUTTON =
  "surface-border rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)]";

export default async function SourcesPage() {
  const rows = await listSourcesWithCounts();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        Sources
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">
        Tracked channels &amp; playlists
      </h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)] leading-relaxed">
        Active sources are polled hourly by cron (
        <code className="text-[var(--color-ink)]">/api/cron/poll</code>) — new uploads are ingested
        and analysed in a batch without anyone opening this page. Pausing a source stops the poll
        but keeps its videos and its position in the queue.
      </p>

      <div className="surface-border surface-card mt-6 p-5">
        <AddSourceForm />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-ink-muted)]">Nothing tracked yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((source) => (
            <li key={source.id} className="surface-border surface-card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <SourceTitleForm id={source.id} title={source.title} />
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    {source.kind === "channel" ? "Channel" : "Playlist"} ·{" "}
                    {source.active ? "Active" : "Paused"} · {source.videoCount} video
                    {source.videoCount === 1 ? "" : "s"} · last polled{" "}
                    {source.lastPolledAt ? formatDate(source.lastPolledAt) : "never"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <form action={setSourceActive.bind(null, source.id, !source.active)}>
                    <button type="submit" className={BUTTON}>
                      {source.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={removeSource.bind(null, source.id)}>
                    <ConfirmSubmitButton
                      message={`Stop tracking "${source.title}"? Its videos and analyses are kept — only the source row is removed.`}
                      className={`${BUTTON} text-[var(--color-danger)] hover:border-[var(--color-danger)]`}
                    >
                      Remove
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
