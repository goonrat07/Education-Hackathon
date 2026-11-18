import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import { getCheck } from "@/server/data/checks";
import { createFile, getFile, getFileBytes, listFiles, putChunk } from "@/server/data/files";
import { getItem, listStudyItems } from "@/server/data/items";
import { getPassage, listPassages } from "@/server/data/passages";
import { getStoredPlan } from "@/server/data/plans";
import { getSession } from "@/server/data/sessions";
import { deleteTest, getTest, listTests, updateTest } from "@/server/data/tests";
import { createTopic, deleteTopic, listTopics, mergeTopics, updateTopic } from "@/server/data/topics";
import { createUser, resetDb, seedStudentData, type Seeded } from "../support/db";

let owner: string;
let other: string;
let seeded: Seeded;

beforeEach(async () => {
  await resetDb();
  owner = await createUser("owner");
  other = await createUser("other");
  seeded = await seedStudentData(owner);
});

afterAll(async () => {
  await closeDb();
});

describe("the owner can read their own data", () => {
  it("finds the test, file, passage, topic, item, session, check and plan", async () => {
    expect(await getTest(owner, seeded.testId)).not.toBeNull();
    expect(await listTests(owner)).toHaveLength(1);
    expect(await getFile(owner, seeded.fileId)).not.toBeNull();
    expect((await getFileBytes(owner, seeded.fileId))?.toString()).toBe("hello");
    expect(await getPassage(owner, seeded.passageId)).not.toBeNull();
    expect(await listTopics(owner, seeded.testId)).toHaveLength(1);
    expect(await getItem(owner, seeded.itemId)).not.toBeNull();
    expect(await getSession(owner, seeded.sessionId)).not.toBeNull();
    expect(await getCheck(owner, seeded.checkId)).not.toBeNull();
    expect(await getStoredPlan(owner, seeded.testId)).not.toBeNull();
  });
});

describe("a second account cannot read the first account's data", () => {
  it("sees no tests", async () => {
    expect(await listTests(other)).toEqual([]);
    expect(await getTest(other, seeded.testId)).toBeNull();
  });

  it("sees no files or file contents", async () => {
    expect(await listFiles(other, seeded.testId)).toEqual([]);
    expect(await getFile(other, seeded.fileId)).toBeNull();
    expect(await getFileBytes(other, seeded.fileId)).toBeNull();
  });

  it("sees no passages", async () => {
    expect(await listPassages(other, seeded.testId)).toEqual([]);
    expect(await getPassage(other, seeded.passageId)).toBeNull();
  });

  it("sees no topics", async () => {
    expect(await listTopics(other, seeded.testId)).toEqual([]);
  });

  it("sees no cards or questions", async () => {
    expect(await listStudyItems(other, seeded.topicId)).toEqual([]);
    expect(await getItem(other, seeded.itemId)).toBeNull();
    expect(await getItem(other, seeded.checkItemId)).toBeNull();
  });

  it("sees no sessions, checks or plans", async () => {
    expect(await getSession(other, seeded.sessionId)).toBeNull();
    expect(await getCheck(other, seeded.checkId)).toBeNull();
    expect(await getStoredPlan(other, seeded.testId)).toBeNull();
  });
});

describe("a second account cannot change the first account's data", () => {
  it("cannot edit or delete the test", async () => {
    expect(await updateTest(other, seeded.testId, { name: "Hacked" })).toBeNull();
    expect(await deleteTest(other, seeded.testId)).toBe(false);
    expect((await getTest(owner, seeded.testId))?.name).toBe("Unit 4");
  });

  it("cannot add a file to the test or write into its files", async () => {
    const file = await createFile(other, seeded.testId, {
      name: "x.pdf",
      mime: "application/pdf",
      sizeBytes: 3,
      source: "notes",
    });
    expect(file).toBeNull();
    expect(await putChunk(other, seeded.fileId, 0, Buffer.from("evil!"))).toBe(false);
    expect((await getFileBytes(owner, seeded.fileId))?.toString()).toBe("hello");
  });

  it("cannot add, edit, merge or delete topics", async () => {
    expect(await createTopic(other, seeded.testId, { name: "X", summary: "", type: "concept" }, [])).toBeNull();
    expect(await updateTopic(other, seeded.topicId, { name: "Hacked", confidence: 5 })).toBeNull();
    expect(await deleteTopic(other, seeded.topicId)).toBe(false);
    expect(await mergeTopics(other, seeded.topicId, seeded.topicId)).toBe(false);
    const [topic] = await listTopics(owner, seeded.testId);
    expect(topic.name).toBe("The mole");
    expect(topic.confidence).toBe(3);
  });

  it("cannot attach a topic of their own to someone else's passages", async () => {
    const [ownTest] = await getDb()
      .insert(schema.tests)
      .values({ userId: other, className: "Bio", name: "Quiz", testDate: "2026-12-01", minutesPerDay: 20 })
      .returning();
    const topic = await createTopic(other, ownTest.id, { name: "Mine", summary: "", type: "concept" }, [
      seeded.passageId,
    ]);
    expect(topic).not.toBeNull();
    const links = await getDb()
      .select()
      .from(schema.topicPassages)
      .where(eq(schema.topicPassages.topicId, topic!.id));
    expect(links).toEqual([]);
  });
});
