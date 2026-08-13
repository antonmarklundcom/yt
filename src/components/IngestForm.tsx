"use client";

import { useActionState, useState } from "react";
import { submitIngest, type IngestFormResult } from "@/lib/ingest.actions";

const initialState: IngestFormResult | null = null;

export function IngestForm() {
  const [state, formAction, pending] = useActionState(submitIngest, initialState);
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-[var(--color-ink-muted)]">
          Video, playlist or channel URL (or @handle)
        </span>
        <input
          type="text"
          name="url"
          required
          placeholder="https://youtube.com/watch?v=…"
          className="surface-border rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => setShowTranscript((v) => !v)}
        className="w-fit text-xs text-[var(--color-accent)] hover:underline"
      >
        {showTranscript ? "Cancel manual transcript" : "No captions? Paste a transcript instead"}
      </button>

      {showTranscript && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--color-ink-muted)]">
            Transcript text (single video URL above required)
          </span>
          <textarea
            name="transcript"
            rows={8}
            placeholder="Paste the transcript…"
            className="surface-border rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Working…" : "Ingest & analyse"}
      </button>

      {state && !state.ok && <p className="text-sm text-[var(--color-danger)]">{state.error}</p>}
      {state && state.ok && <p className="text-sm text-[var(--color-accent)]">{state.message}</p>}
    </form>
  );
}
