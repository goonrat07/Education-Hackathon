import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Db | null = null;

/**
 * Lazily creates the connection pool so importing this module never needs a
 * database (the build prerenders pages without one).
 */
export function getDb(): Db {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 5000 });
    // Lets Vercel close idle connections before a function instance is suspended.
    attachDatabasePool(pool);
    db = drizzle(pool, { schema });
  }
  return db;
}

/** Closes the pool. Used by tests and scripts so the process can exit. */
export async function closeDb(): Promise<void> {
  const p = pool;
  pool = null;
  db = null;
  if (p) await p.end();
}

export { schema };
