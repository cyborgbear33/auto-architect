import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.ts";

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
}

export function createDb(databaseUrl: string): DbHandle {
  // Silence benign server NOTICEs (e.g. "IF NOT EXISTS … skipping" from migrator).
  const sql = postgres(databaseUrl, { max: 10, onnotice: () => undefined });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
