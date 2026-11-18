import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { SetupIncompleteError } from "@/server/errors";
import { guardPool, POOL_SETTINGS, withStrictSsl } from "./pool";
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
    if (!connectionString) throw new SetupIncompleteError("the database");
    pool = new pg.Pool({ ...POOL_SETTINGS, connectionString: withStrictSsl(connectionString) });
    // Asks Vercel to keep the instance awake until idle connections have been closed...
    attachDatabasePool(pool);
    // ...and, because an instance can still be paused with connections open,
    // checks any connection that has sat unused before trusting it again.
    guardPool(pool);
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

/** True when the server has a database connection configured. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
