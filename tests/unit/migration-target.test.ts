import { describe, expect, it } from "vitest";
import { migrationTarget } from "@/db/migration-target";

const URL = "postgres://u:p@host/db";
const DIRECT = "postgres://u:p@direct-host/db";

describe("migrationTarget", () => {
  it("migrates the local database when run on a developer's machine", () => {
    expect(migrationTarget({ DATABASE_URL: URL })).toEqual({ url: URL });
  });

  it("prefers the direct connection when the host offers one", () => {
    expect(migrationTarget({ DATABASE_URL: URL, DATABASE_URL_UNPOOLED: DIRECT })).toEqual({ url: DIRECT });
  });

  it("migrates on a production build on Vercel", () => {
    expect(migrationTarget({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: URL })).toEqual({ url: URL });
  });

  it("never migrates on a preview build, even if it can see a database", () => {
    const target = migrationTarget({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: URL });
    expect(target).toEqual({ skip: expect.stringContaining("preview") });
  });

  it("never migrates on a Vercel build that does not say which environment it is", () => {
    expect(migrationTarget({ VERCEL: "1", DATABASE_URL: URL })).toHaveProperty("skip");
  });

  it("skips when no database is configured", () => {
    expect(migrationTarget({})).toHaveProperty("skip");
    expect(migrationTarget({ DATABASE_URL: "" })).toHaveProperty("skip");
  });
});
