/**
 * Cap on failed logins PER ACCOUNT (normalised email).
 *
 * Deliberately not keyed on client IP: X-Forwarded-For is spoofable and behind a
 * proxy every user can share one address. In-memory (single Node process, like
 * the rest of this app); expired entries are pruned and the map is bounded.
 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

type Entry = { failures: number; resetAt: number };
const attempts = new Map<string, Entry>();

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
  while (attempts.size >= MAX_TRACKED_KEYS) {
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
}

export function loginKey(email: string): string {
  return email.trim().toLowerCase();
}

/** True once the account has hit the failure cap inside the window. */
export function isLoginBlocked(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return entry.failures >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now) {
    entry.failures += 1;
    return;
  }
  if (attempts.size >= MAX_TRACKED_KEYS) prune(now);
  attempts.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
}

export function resetLoginFailures(key: string): void {
  attempts.delete(key);
}

export function trackedLoginKeys(): number {
  return attempts.size;
}
