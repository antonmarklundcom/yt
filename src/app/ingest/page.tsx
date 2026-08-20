import type { Metadata } from "next";
import { IngestForm } from "@/components/IngestForm";

export const metadata: Metadata = { title: "Ingest" };

export default function IngestPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        Ingest
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">Add a URL</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)] leading-relaxed">
        A single video is ingested and analysed immediately. A playlist or channel is ingested
        (captions fetched, up to 25 videos) but not auto-analysed — run analysis from the digest
        feed afterward.
      </p>
      <div className="surface-border surface-card mt-6 p-5">
        <IngestForm />
      </div>
    </main>
  );
}
