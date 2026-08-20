export type ResultTone = "success" | "info" | "error";

const CLASS: Record<ResultTone, string> = {
  success: "border-[var(--color-accent)] text-[var(--color-accent)]",
  info: "border-[var(--color-border-subtle)] text-[var(--color-ink)]",
  error: "border-[var(--color-danger)] text-[var(--color-danger)]",
};

const PREFIX: Record<ResultTone, string> = {
  success: "Done",
  info: "Note",
  error: "Failed",
};

/**
 * One shape per outcome (PR-21). Colour alone does not carry the distinction —
 * the prefix does, and `aria-live` makes the result reach a screen reader at
 * all, since it appears without any focus change.
 */
export function ResultMessage({ tone, children }: { tone: ResultTone; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-[var(--radius-sm)] border-l-2 bg-[var(--color-surface)] px-3 py-2 text-sm ${CLASS[tone]}`}
    >
      <span className="font-medium">{PREFIX[tone]}: </span>
      {children}
    </p>
  );
}
