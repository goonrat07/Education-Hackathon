import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import { storedBytesForEveryone, storedBytesForUser } from "@/server/data/files";
import { countTests } from "@/server/data/tests";
import { createUser, resetDb, seedStudentData } from "../support/db";

let owner: string;

beforeEach(async () => {
  await resetDb();
  owner = await createUser("owner");
});

afterAll(async () => {
  await closeDb();
});

describe("what a student is storing", () => {
  it("counts only their own tests", async () => {
    const other = await createUser("other");
    await seedStudentData(owner);
    await seedStudentData(owner);
    await seedStudentData(other);
    expect(await countTests(owner)).toBe(2);
    expect(await countTests(other)).toBe(1);
  });

  it("adds up the declared size of only their own files", async () => {
    const other = await createUser("other");
    const mine = await seedStudentData(owner);
    await seedStudentData(other);
    await getDb().insert(schema.files).values({
      userId: owner,
      testId: mine.testId,
      source: "notes",
      name: "big.jpg",
      mime: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(await storedBytesForUser(owner)).toBe(1005);
    expect(await storedBytesForUser(other)).toBe(5);
  });

  it("adds up everyone's files for the app-wide ceiling", async () => {
    const other = await createUser("other");
    await seedStudentData(owner);
    await seedStudentData(other);
    expect(await storedBytesForEveryone()).toBe(10);
  });

  it("is zero for a new student", async () => {
    expect(await countTests(owner)).toBe(0);
    expect(await storedBytesForUser(owner)).toBe(0);
  });
});
