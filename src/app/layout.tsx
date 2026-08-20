import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { getLocale } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return {
    // Template so every page's own title reads as "<page> · YT Intel" without
    // each route repeating the suffix (PR-18).
    title: { default: t("app.title"), template: `%s \u00b7 ${t("app.name")}` },
    description: t("app.description"),
    // Private tool on a non-obvious subdomain (PLAN.md §0). Keep it out of indexes.
    robots: { index: false, follow: false },
  };
}

// The header reads spendStatus() on every request (the counter must never go
// stale), which also means this whole tree can't be statically generated at
// build time on a machine with no DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // lang must follow the chosen locale — it is what a screen reader uses to
  // pick a pronunciation, and a Swedish UI announced in English is unusable.
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
