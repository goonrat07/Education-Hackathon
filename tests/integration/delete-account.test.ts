import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import { deleteAccount } from "@/server/data/account";
import { createUser, OWNED_TABLES, resetDb, seedStudentData } from "../support/db";

async function rowsFor(userId: string): Promise<number> {
  let total = 0;
  for (const table of OWNED_TABLES) {
    const rows = await getDb().select().from(table).where(eq(table.userId, userId));
    total += rows.length;
  }
  return total;
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("deleteAccount", () => {
  it("removes every row that belongs to the account, including the account itself", async () => {
    const leaving = await createUser("leaving");
    await seedStudentData(leaving);
    await getDb().insert(schema.session).values({
      id: "s1",
      userId: leaving,
      token: "tok",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    expect(await rowsFor(leaving)).toBeGreaterThan(0);

    await deleteAccount(leaving);

    expect(await rowsFor(leaving)).toBe(0);
    expect(await getDb().select().from(schema.user).where(eq(schema.user.id, leaving))).toEqual([]);
    expect(await getDb().select().from(schema.session).where(eq(schema.session.userId, leaving))).toEqual([]);
  });

  it("leaves other accounts untouched", async () => {
    const leaving = await createUser("leaving");
    const staying = await createUser("staying");
    await seedStudentData(leaving);
    await seedStudentData(staying);
    const before = await rowsFor(staying);

    await deleteAccount(leaving);

    expect(await rowsFor(staying)).toBe(before);
    expect(await getDb().select().from(schema.user).where(eq(schema.user.id, staying))).toHaveLength(1);
  });
});
