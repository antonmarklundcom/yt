import { renameSource } from "@/lib/sources.actions";

/**
 * An always-editable title field rather than an edit mode — one input and one
 * button beats a pencil icon, a state flag and a cancel path for a field that
 * is edited perhaps twice in a source's life.
 */
export function SourceTitleForm({ id, title }: { id: number; title: string }) {
  return (
    <form action={renameSource.bind(null, id)} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`source-title-${id}`}>
        Source title
      </label>
      <input
        id={`source-title-${id}`}
        name="title"
        defaultValue={title}
        maxLength={512}
        className="surface-border w-full min-w-48 max-w-md rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] px-2 py-1 text-sm font-medium text-[var(--color-ink)] focus:outline-none"
      />
      <button
        type="submit"
        className="text-xs text-[var(--color-accent)] hover:underline"
      >
        Save title
      </button>
    </form>
  );
}
