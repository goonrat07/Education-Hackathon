import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

// No request runs longer than this (see maxDuration on the routes), so an older lock is stale.
const LOCK_SECONDS = 300;
const POLL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Takes the lock if nobody holds it (or the holder's lock has expired). */
async function acquire(userId: string, key: string, seconds = LOCK_SECONDS): Promise<boolean> {
  const db = getDb();
  await db
    .delete(schema.workLocks)
    .where(and(eq(schema.workLocks.userId, userId), eq(schema.workLocks.key, key), lt(schema.workLocks.expiresAt, new Date())));
  const rows = await db
    .insert(schema.workLocks)
    .values({ userId, key, expiresAt: sql`now() + make_interval(secs => ${seconds})` })
    .onConflictDoNothing()
    .returning({ key: schema.workLocks.key });
  return rows.length > 0;
}

async function release(userId: string, key: string): Promise<void> {
  await getDb()
    .delete(schema.workLocks)
    .where(and(eq(schema.workLocks.userId, userId), eq(schema.workLocks.key, key)));
}

/**
 * True the first time it is asked about a job, then false until `seconds`
 * have passed. For work worth trying now and then but not on every visit,
 * such as writing more questions for a topic that came up short last time.
 */
export async function notTriedLately(userId: string, key: string, seconds: number): Promise<boolean> {
  return acquire(userId, key, seconds);
}

/**
 * Runs `work` unless another request is already doing the same job for this
 * student. In that case it waits for the other request and then returns
 * whatever `alreadyDone` finds, so the job (and its AI calls) happens once.
 *
 * @param alreadyDone checks whether the result now exists; called before working and while waiting
 */
export async function onlyOnce<T>(
  userId: string,
  key: string,
  alreadyDone: () => Promise<T | null>,
  work: () => Promise<T>,
): Promise<T> {
  const existing = await alreadyDone();
  if (existing !== null) return existing;

  const deadline = Date.now() + LOCK_SECONDS * 1000;
  while (!(await acquire(userId, key))) {
    await sleep(POLL_MS);
    const done = await alreadyDone();
    if (done !== null) return done;
    if (Date.now() > deadline) break;
  }
  try {
    // The other request may have finished between our last look and taking the lock.
    const done = await alreadyDone();
    if (done !== null) return done;
    return await work();
  } finally {
    await release(userId, key);
  }
}
