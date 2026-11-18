/**
 * Which database a run of the migration script should change, if any.
 *
 * Migrations run before every build. On Vercel only a production build is
 * allowed to change the database: a preview build of an unmerged branch must
 * never alter the tables the live site is using. Off Vercel (a developer's
 * machine) the configured database is migrated.
 */
export function migrationTarget(
  env: Record<string, string | undefined>,
): { url: string } | { skip: string } {
  // Neon's pooled connection cannot run migrations' session-level statements reliably.
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) return { skip: "DATABASE_URL is not set" };
  if (env.VERCEL === "1" && env.VERCEL_ENV !== "production") {
    return { skip: `this is a ${env.VERCEL_ENV ?? "non-production"} build, and only production builds change the database` };
  }
  return { url };
}
