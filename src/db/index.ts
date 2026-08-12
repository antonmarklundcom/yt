import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pool for the whole process.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would leak a
 * pool per reload and exhaust Hostinger's per-user connection cap within a few
 * saves. Stashing it on globalThis is the standard workaround.
 */
const globalForDb = globalThis as unknown as { __ytIntelPool?: mysql.Pool };

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

export const pool: mysql.Pool = globalForDb.__ytIntelPool ?? createPool();
if (!env.isProduction) globalForDb.__ytIntelPool = pool;

export const db = drizzle(pool, { schema, mode: "default" });

export { schema };

/** Scripts must close the pool or the process hangs after the work is done. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
