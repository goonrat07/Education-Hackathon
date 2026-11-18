import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "@/db";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Google sign-in is offered only when its credentials are configured. */
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

function baseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // Preview deployments get a URL per deployment.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (host?: string) => host && origins.add(`https://${host}`);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return [...origins];
}

function createAuth() {
  return betterAuth({
    baseURL: baseUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    socialProviders: googleEnabled
      ? { google: { clientId: googleClientId!, clientSecret: googleClientSecret! } }
      : {},
    // Counters live in Postgres because serverless instances share no memory.
    rateLimit: { enabled: true, storage: "database" },
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | null = null;

/** Lazily built so importing this module never touches the database. */
export function getAuth(): Auth {
  if (!auth) auth = createAuth();
  return auth;
}
