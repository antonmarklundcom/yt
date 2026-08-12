import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube Intelligence Workspace",
  description: "Private research workspace — read digests instead of watching videos.",
  // Private tool on a non-obvious subdomain (PLAN.md §0). Keep it out of indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
