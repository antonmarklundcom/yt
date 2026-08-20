import type { Metadata } from "next";
import { IngestForm } from "@/components/IngestForm";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await getLocale())("ingest.eyebrow") };
}

export default async function IngestPage() {
  const locale = await getLocale();
  const t = translator(locale);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs font-medium tracking-widest text-[var(--color-accent)] uppercase">
        {t("ingest.eyebrow")}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{t("ingest.title")}</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)] leading-relaxed">
        {t("ingest.intro")}
      </p>
      <div className="surface-border surface-card mt-6 p-5">
        <IngestForm locale={locale} />
      </div>
    </main>
  );
}
