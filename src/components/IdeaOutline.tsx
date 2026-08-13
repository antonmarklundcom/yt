"use client";

import { useState, useTransition } from "react";
import type { OutlinePayload } from "@/lib/analysis/contract";
import { generateOutlineAction } from "@/lib/outline.actions";

function toPlainText(payload: OutlinePayload): string {
  return [
    `HOOK\n${payload.hook}`,
    `RE-HOOK\n${payload.rehook}`,
    `TEACHING POINTS\n${payload.teaching_points.map((t) => `- ${t}`).join("\n")}`,
    `TWIST\n${payload.twist}`,
    `CTA\n${payload.cta}`,
  ].join("\n\n");
}

export function IdeaOutline({
  analysisId,
  ideaIndex,
  videoId,
  outline,
}: {
  analysisId: number;
  ideaIndex: number;
  videoId: number;
  outline: OutlinePayload | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!outline) {
    return (
      <div className="mt-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await generateOutlineAction(analysisId, ideaIndex, videoId);
              if (!result.ok) setError(result.error);
            })
          }
          className="surface-border rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate outline"}
        </button>
        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="surface-border mt-3 flex flex-col gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3 text-xs">
      <OutlineField label="Hook" value={outline.hook} />
      <OutlineField label="Re-hook" value={outline.rehook} />
      <div>
        <p className="text-[var(--color-ink-muted)]">Teaching points</p>
        <ul className="mt-0.5 list-disc pl-4 text-[var(--color-ink)]">
          {outline.teaching_points.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      <OutlineField label="Twist" value={outline.twist} />
      <OutlineField label="CTA" value={outline.cta} />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(toPlainText(outline));
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="mt-1 w-fit rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 font-medium text-[var(--color-accent-ink)]"
      >
        {copied ? "Copied" : "Copy outline"}
      </button>
    </div>
  );
}

function OutlineField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--color-ink-muted)]">{label}</p>
      <p className="text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
