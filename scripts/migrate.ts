import path from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Next.js loads env files itself; this script runs outside it.
config({ path: [".env.development.local", ".env.local"], quiet: true });

/**
 * Applies pending SQL migrations. Runs before `next build` so every deploy
 * brings the database up to date, and from `npm run db:migrate` locally.
 */
async function main() {
  // Neon's pooled connection cannot run migrations' session-level statements reliably.
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.log("migrate: DATABASE_URL is not set, skipping migrations");
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(process.cwd(), "src/db/migrations"),
    });
    console.log("migrate: database is up to date");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migrate: failed", err);
  process.exit(1);
});
