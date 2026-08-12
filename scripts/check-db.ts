/**
 * PR-02 done-when: "DB connects".
 *
 * Run against the Remote MySQL host locally, or over SSH on the Hostinger box.
 * tsx does NOT auto-load .env (drizzle-kit does), so export the var first:
 *
 *   export DATABASE_URL='mysql://user:pass@host:3306/dbname'
 *   npm run db:check
 */

import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";

async function main(): Promise<void> {
  // Redact the password before printing — this output ends up pasted into chats.
  const target = redact(process.env.DATABASE_URL ?? "");
  console.log(`Connecting to ${target || "(DATABASE_URL not set)"}`);

  const started = Date.now();
  const [rows] = await db.execute(
    sql`select version() as version, database() as db, @@session.time_zone as tz, now() as now`,
  );
  const info = rowsOf(rows)[0] ?? {};

  console.log(`Connected in ${Date.now() - started}ms`);
  console.log(`  MySQL     ${String(info["version"] ?? "?")}`);
  console.log(`  Database  ${String(info["db"] ?? "?")}`);
  console.log(`  Session TZ ${String(info["tz"] ?? "?")}`);
  console.log(`  Server now ${String(info["now"] ?? "?")}`);

  const [tables] = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = database() order by table_name`,
  );
  const names = rowsOf(tables).map((t) => String(t["table_name"] ?? t["TABLE_NAME"] ?? ""));
  console.log(
    names.length > 0
      ? `  Tables    ${names.length}: ${names.join(", ")}`
      : "  Tables    none yet — run `npm run db:migrate` (PR-03).",
  );
}

/**
 * db.execute() is typed as the union of every mysql2 result shape, including
 * ResultSetHeader for writes. A SELECT always yields rows, so narrow once here
 * rather than casting at each call site.
 */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  return Array.isArray(result) ? (result as Array<Record<string, unknown>>) : [];
}

function redact(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]*)@/, "//$1:***@");
}

main()
  .then(async () => {
    await closeDb();
    console.log("\nOK");
  })
  .catch(async (err) => {
    console.error("\nDatabase check FAILED");
    console.error(err instanceof Error ? err.message : err);
    console.error(
      "\nCommon causes:\n" +
        "  ECONNREFUSED   — DATABASE_URL unset (tsx does not read .env), so mysql2\n" +
        "                   silently fell back to localhost. Export it explicitly.\n" +
        "  Access denied  — your public IP is not whitelisted in hPanel → Remote MySQL,\n" +
        "                   or your ISP rotated it. Re-add the current IP.\n" +
        "  ERR_INVALID_URL— the value contains 'DATABASE_URL=' inside it (a paste slip\n" +
        "                   in hPanel's env var form). The Value field takes the raw URL only.",
    );
    await closeDb().catch(() => {});
    process.exit(1);
  });
