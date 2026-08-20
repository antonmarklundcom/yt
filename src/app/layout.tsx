import type { Metadata } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  // Template so every page's own title reads as "<page> · YT Intel" without
  // each route repeating the suffix (PR-18).
  title: {
    default: "YouTube Intelligence Workspace",
    template: "%s · YT Intel",
  },
  description: "Private research workspace — read digests instead of watching videos.",
  // Private tool on a non-obvious subdomain (PLAN.md §0). Keep it out of indexes.
  robots: { index: false, follow: false },
};

// The header reads spendStatus() on every request (the counter must never go
// stale), which also means this whole tree can't be statically generated at
// build time on a machine with no DATABASE_URL.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
