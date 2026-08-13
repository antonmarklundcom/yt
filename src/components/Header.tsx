import Link from "next/link";
import { spendStatus } from "@/lib/spend";
import { SpendMeter } from "./SpendMeter";

const NAV = [
  { href: "/", label: "Digest" },
  { href: "/sources", label: "Sources" },
  { href: "/ingest", label: "Ingest" },
];

export async function Header() {
  const status = await spendStatus();

  return (
    <header className="surface-border sticky top-0 z-10 border-x-0 border-t-0 bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">
            YT Intel
          </Link>
          <nav className="flex items-center gap-5">
            {NAV.map((item) => (
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
        <SpendMeter status={status} />
      </div>
    </header>
  );
}
