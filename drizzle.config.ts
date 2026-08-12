import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit auto-loads .env. Plain `tsx` scripts do NOT — if a script throws
 * ECONNREFUSED right after a successful migration, its DATABASE_URL is undefined
 * and mysql2 is silently falling back to localhost. Export the var for the shell
 * session before running scripts.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
