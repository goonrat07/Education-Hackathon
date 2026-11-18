import path from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { migrationTarget } from "../src/db/migration-target";

// Next.js loads env files itself; this script runs outside it.
config({ path: [".env.development.local", ".env.local"], quiet: true });

/**
 * Applies pending SQL migrations. Runs before `next build` so every
 * production deploy brings the database up to date, and from
 * `npm run db:migrate` locally. Preview builds never change the database.
 */
async function main() {
  const target = migrationTarget(process.env);
  if ("skip" in target) {
    console.log(`migrate: skipping migrations (${target.skip})`);
    return;
  }
  const pool = new pg.Pool({ connectionString: target.url, max: 1 });
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
