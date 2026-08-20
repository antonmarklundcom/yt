import type { Locale } from "@/lib/i18n";

/**
 * Formatting is locale-aware (PR-22). The hardcoded "en-US" here meant a
 * Swedish UI still rendered "Aug 20, 2026" and "1.2M" — the two places a
 * translated interface most visibly leaks its original language.
 *
 * The locale is passed in rather than read from a cookie: these are called from
 * client components too, and a formatter that quietly reaches for request state
 * cannot be.
 */
const INTL_LOCALE: Record<Locale, string> = { en: "en-US", sv: "sv-SE" };

function intl(locale: Locale | undefined): string {
  return INTL_LOCALE[locale ?? "en"];
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "\u2014";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDate(value: Date | string | null, locale?: Locale): string {
  if (!value) return "\u2014";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString(intl(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCompactNumber(value: number | null, locale?: Locale): string {
  if (value === null) return "\u2014";
  return new Intl.NumberFormat(intl(locale), { notation: "compact" }).format(value);
}
