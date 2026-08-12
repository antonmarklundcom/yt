/**
 * PR-03 seed. Idempotent — safe to re-run (PLAN.md §3).
 *
 *   export DATABASE_URL='mysql://user:pass@host:3306/dbname'
 *   export ADMIN_EMAIL='you@example.com'
 *   npx tsx scripts/seed.ts
 *
 * tsx does not auto-load .env, so export the vars explicitly.
 */

import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { users } from "../src/db/schema";

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    throw new Error(
      "ADMIN_EMAIL is not set. v1 has a single user (PLAN.md §0); this row exists " +
        "so multi-user is a feature rather than a migration.",
    );
  }

  // Upsert on the unique email rather than insert-then-catch, so re-running
  // after changing the role actually applies the change.
  await db
    .insert(users)
    .values({ email, role: "admin" })
    .onDuplicateKeyUpdate({ set: { role: "admin" } });

  const [rows] = await db.execute(
    sql`select id, email, role, created_at from users order by id`,
  );
  const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];

  console.log(`Seeded. ${list.length} user row(s):`);
  for (const u of list) {
    console.log(`  #${String(u["id"])}  ${String(u["email"])}  ${String(u["role"])}`);
  }

  console.log(
    "\nNo topics are seeded on purpose — PLAN.md §7 requires topics to be " +
      "open-ended, so none is hardcoded anywhere. They are created at analysis time.",
  );
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (err) => {
    console.error("Seed FAILED:", err instanceof Error ? err.message : err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
