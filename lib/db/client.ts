import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ledgerlensSql?: postgres.Sql; __ledgerlensDb?: Database };

/**
 * Single shared connection pool. On Supabase, use the pooled (transaction mode)
 * connection string; prepared statements are disabled for compatibility with it.
 */
export function getDb(): Database {
  if (globalForDb.__ledgerlensDb) return globalForDb.__ledgerlensDb;
  const { DATABASE_URL } = getEnv();
  const sql = postgres(DATABASE_URL, {
    max: process.env.VERCEL ? 3 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  globalForDb.__ledgerlensSql = sql;
  globalForDb.__ledgerlensDb = drizzle(sql, { schema });
  return globalForDb.__ledgerlensDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__ledgerlensSql?.end({ timeout: 5 });
  globalForDb.__ledgerlensSql = undefined;
  globalForDb.__ledgerlensDb = undefined;
}

export { schema };
