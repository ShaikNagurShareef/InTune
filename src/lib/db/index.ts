import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const POOL_MAX = 5;

interface DbGlobals {
  intunePool?: Pool;
  intuneDb?: Db;
  intuneTestDb?: Db | null;
}
const globals = globalThis as DbGlobals;

export function getPool(): Pool {
  if (!globals.intunePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // Explicit verify-full keeps today's strict TLS and silences pg's sslmode deprecation warning.
    const url = connectionString.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
    globals.intunePool = new Pool({ connectionString: url, max: POOL_MAX });
  }
  return globals.intunePool;
}

export function db(): Db {
  if (globals.intuneTestDb) return globals.intuneTestDb;
  if (!globals.intuneDb) {
    globals.intuneDb = drizzle(getPool(), { schema }) as unknown as Db;
  }
  return globals.intuneDb;
}

/** Tests inject an in-process PGlite database. */
export function setTestDb(testDb: Db | null): void {
  globals.intuneTestDb = testDb;
}

export { schema };
