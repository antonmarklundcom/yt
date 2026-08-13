import { desc } from "drizzle-orm";
import { db } from "@/db";
import { sources, type Source } from "@/db/schema";

export async function listSources(): Promise<Source[]> {
  return db.select().from(sources).orderBy(desc(sources.createdAt));
}
