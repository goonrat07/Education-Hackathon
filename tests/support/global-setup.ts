import { execFileSync } from "node:child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://studycoach:studycoach@localhost:5432/studycoach_test";

/** Applies migrations to the test database once before the suite runs. */
export default function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
