/**
 * Environment access.
 *
 * Everything here is read lazily. Reading env at module scope would make
 * `next build` fail on a machine that has no database credentials, which is
 * exactly the machine CI runs on — and PLAN.md §6 requires every PR to build.
 */

class MissingEnvError extends Error {
  constructor(name: string, hint: string) {
    super(`Missing required environment variable ${name}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name, hint);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

export const env = {
  /** mysql://user:pass@host:3306/dbname — hPanel → Databases. */
  get databaseUrl(): string {
    return required(
      "DATABASE_URL",
      "Format: mysql://user:pass@host:3306/dbname. Live app uses localhost; " +
        "local dev needs the Remote MySQL host and your IP whitelisted in hPanel.",
    );
  },

  /**
   * Hostinger MySQL caps concurrent connections per user, and this app also runs
   * tsx scripts alongside the web process. 8 leaves room for both.
   */
  get dbConnectionLimit(): number {
    return optionalNumber("DB_CONNECTION_LIMIT", 8);
  },

  get nodeEnv(): string {
    return optional("NODE_ENV", "development");
  },

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  },
} as const;

/**
 * Fail fast with every problem at once rather than one per run — used by scripts
 * and by the deploy smoke check, never at import time.
 */
export function assertEnv(names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "See .env.example for where each value comes from.",
    );
  }
}
