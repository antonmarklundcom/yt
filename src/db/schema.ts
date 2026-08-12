import { mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * PLAN.md §3 — schema.
 *
 * PR-02 defines `users` only, as the connectivity smoke test. PR-03 adds the
 * remaining tables, the migrations and the seed.
 *
 * v1 has exactly one user. The table exists from day one anyway so multi-user
 * (PLAN.md §8) is a feature rather than a migration, and so `role` never has to
 * be retrofitted through every permission check.
 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: mysqlEnum("role", ["admin", "user"]).notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
