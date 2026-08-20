import Link from "next/link";
import { spendStatus } from "@/lib/spend";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n";
import { LocaleToggle } from "./LocaleToggle";
import { SpendMeter } from "./SpendMeter";

export async function Header() {
  const [status, locale] = await Promise.all([spendStatus(), getLocale()]);
  const t = translator(locale);

  const nav = [
    { href: "/", label: t("nav.digest") },
    { href: "/sources", label: t("nav.sources") },
    { href: "/ingest", label: t("nav.ingest") },
  ];

  return (
    <header className="surface-border sticky top-0 z-10 border-x-0 border-t-0 bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">
            {t("app.name")}
          </Link>
          <nav className="flex items-center gap-5">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <LocaleToggle locale={locale} />
          <SpendMeter status={status} locale={locale} />
        </div>
      </div>
    </header>
  );
}
