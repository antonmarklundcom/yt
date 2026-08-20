"use client";

import { useActionState } from "react";
import { addSource, type AddSourceResult } from "@/lib/sources.actions";
import { ResultMessage } from "./ResultMessage";

const initialState: AddSourceResult | null = null;

export function AddSourceForm() {
  const [state, formAction, pending] = useActionState(addSource, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          name="url"
          required
          placeholder="Channel or playlist URL, or @handle"
          className="surface-border min-w-72 flex-1 rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Track"}
        </button>
      </div>
      {state && !state.ok && <ResultMessage tone="error">{state.error}</ResultMessage>}
      {state && state.ok && (
        <ResultMessage tone="success">
          Source added. It will be polled on the next hourly cron run.
        </ResultMessage>
      )}
    </form>
  );
}
