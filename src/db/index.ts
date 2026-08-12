import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pool for the whole process, created on first use.
 *
 * Lazy rather than eager because importing this module must not require
 * DATABASE_URL. Anything that transitively imports the schema — a unit test for
 * pure logic, a type-only import in a UI component — would otherwise throw at
 * import time on a machine with no database credentials.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would leak a
 * pool per reload and exhaust Hostinger's per-user connection cap within a few
 * saves. Stashing it on globalThis is the standard workaround.
 */
const globalForDb = globalThis as unknown as {
  __ytIntelPool?: mysql.Pool;
  __ytIntelDb?: MySql2Database<typeof schema>;
};

function createPool(): mysql.Pool {
  return mysql.createPool({
    uri: env.databaseUrl,
    connectionLimit: env.dbConnectionLimit,
    // Store and read UTC everywhere. Hostinger's MySQL default session timezone
    // is not UTC, and published_at comparisons silently drift without this.
    timezone: "Z",
    // A dead pooled connection surfaces as a confusing query error otherwise.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
}

export function getPool(): mysql.Pool {
  if (!globalForDb.__ytIntelPool) globalForDb.__ytIntelPool = createPool();
  return globalForDb.__ytIntelPool;
}

function getDb(): MySql2Database<typeof schema> {
  if (!globalForDb.__ytIntelDb) {
    globalForDb.__ytIntelDb = drizzle(getPool(), { schema, mode: "default" });
  }
  return globalForDb.__ytIntelDb;
}

/**
 * Proxy so `db.select(...)` reads exactly as it would with a plain instance
 * while still deferring construction to the first actual query.
 */
export const db: MySql2Database<typeof schema> = new Proxy(
  {} as MySql2Database<typeof schema>,
  {
    get(_target, prop, receiver) {
      const instance = getDb();
      const value = Reflect.get(instance as object, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);

export { schema };

/** Scripts must close the pool or the process hangs after the work is done. */
export async function closeDb(): Promise<void> {
  const pool = globalForDb.__ytIntelPool;
  if (!pool) return; // never connected — nothing to close
  globalForDb.__ytIntelPool = undefined;
  globalForDb.__ytIntelDb = undefined;
  await pool.end();
}
