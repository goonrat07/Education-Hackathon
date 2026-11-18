import type pg from "pg";

/**
 * Keeps a connection pool honest on a server that can be paused.
 *
 * On Vercel a server instance is frozen between requests and woken for the
 * next one, sometimes before the pool's own idle timer has had a chance to
 * close what it holds. A connection that was open across such a pause may
 * have been closed by the database in the meantime, and the pool cannot know:
 * it would hand the dead connection to the next request, whose first query
 * then fails with "Connection terminated unexpectedly".
 *
 * So a connection that has sat unused for longer than `trustIdleMs` is asked a
 * trivial question before it is handed out. If it does not answer, it is
 * thrown away and another one is taken, until a live or brand-new connection
 * turns up. Connections used a moment ago are trusted and cost nothing extra.
 */
export function guardPool(pool: pg.Pool, options: { trustIdleMs?: number } = {}): pg.Pool {
  const trustIdleMs = options.trustIdleMs ?? DEFAULT_TRUST_IDLE_MS;
  const lastReturned = new WeakMap<object, number>();

  // The database closing an idle connection is reported here. With no listener,
  // Node treats it as an unhandled error and the whole process goes down.
  pool.on("error", (error) => {
    console.warn(`A database connection was closed while idle: ${error.message}`);
  });
  pool.on("release", (_error, client) => {
    if (client) lastReturned.set(client, Date.now());
  });

  const take = pool.connect.bind(pool) as () => Promise<pg.PoolClient>;

  async function takeLive(): Promise<pg.PoolClient> {
    // At most every connection the pool holds can be stale; the one after that is new.
    const attempts = (pool.options.max ?? 10) + 1;
    for (let attempt = 0; ; attempt++) {
      const client = await take();
      const returnedAt = lastReturned.get(client);
      const trusted = returnedAt === undefined || Date.now() - returnedAt <= trustIdleMs;
      if (trusted || attempt >= attempts) return client;
      if (await answers(client)) return client;
      // Dead: destroy it rather than putting it back.
      client.release(true);
    }
  }

  type Callback = (
    error: Error | undefined,
    client: pg.PoolClient | undefined,
    done: (destroy?: boolean | Error) => void,
  ) => void;

  // pg's own pool.query() calls connect() with a callback; everything else awaits it.
  function connect(): Promise<pg.PoolClient>;
  function connect(callback: Callback): void;
  function connect(callback?: Callback): Promise<pg.PoolClient> | void {
    const live = takeLive();
    if (!callback) return live;
    live.then(
      (client) => callback(undefined, client, client.release.bind(client)),
      (error: Error) => callback(error, undefined, () => undefined),
    );
  }
  pool.connect = connect as pg.Pool["connect"];
  return pool;
}

/** A connection unused for longer than this is checked before it is used again. */
const DEFAULT_TRUST_IDLE_MS = 2000;

/** How long a connection gets to answer the check. A dead one usually fails at once. */
const ANSWER_WITHIN_MS = 2000;

/** True when the connection answers a trivial query in time. */
async function answers(client: pg.PoolClient): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.query("select 1"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("no answer")), ANSWER_WITHIN_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * pg already verifies the server's certificate in full for `sslmode=require`
 * (and `prefer`, `verify-ca`), and prints a long warning on every start saying
 * that a future version will not. Asking for `verify-full` by name keeps
 * today's behavior, keeps it after that change, and keeps the warning out of
 * the logs. Connection strings without those modes are returned as they are.
 */
export function withStrictSsl(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}
