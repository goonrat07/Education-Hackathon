import { execFileSync } from "node:child_process";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { guardPool, withStrictSsl } from "@/db/pool";

const URL = process.env.DATABASE_URL!;
const pools: pg.Pool[] = [];

function pool(trustIdleMs: number): pg.Pool {
  const created = guardPool(new pg.Pool({ connectionString: URL, max: 3, idleTimeoutMillis: 60_000 }), { trustIdleMs });
  pools.push(created);
  return created;
}

async function backend(p: pg.Pool): Promise<number> {
  const { rows } = await p.query("select pg_backend_pid() as pid");
  return rows[0].pid;
}

/**
 * Ends a connection from the database's side while this process is blocked
 * and cannot react. That is how a paused server instance finds its
 * connections when it wakes: closed, with nothing having told it yet.
 */
function closedDuringPause(pid: number, pauseMs: number): void {
  execFileSync("psql", [URL, "-q", "-c", `select pg_terminate_backend(${pid})`, "-c", `select pg_sleep(${pauseMs / 1000})`], {
    stdio: "ignore",
  });
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.end()));
});

describe("a guarded pool", () => {
  it("replaces a connection the database closed while the server was paused", async () => {
    const p = pool(200);
    const before = await backend(p);
    closedDuringPause(before, 400);

    // The very next query, before the pool has had a chance to notice anything.
    const after = await backend(p);
    expect(after).not.toBe(before);
  });

  it("does the same for a transaction", async () => {
    const p = pool(200);
    const before = await backend(p);
    closedDuringPause(before, 400);

    const client = await p.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query("select pg_backend_pid() as pid");
      await client.query("commit");
      expect(rows[0].pid).not.toBe(before);
    } finally {
      client.release();
    }
  });

  it("replaces every stale connection, not only the first", async () => {
    const p = pool(200);
    const [a, b] = await Promise.all([backend(p), backend(p)]);
    expect(a).not.toBe(b);
    execFileSync("psql", [URL, "-q", "-c", `select pg_terminate_backend(${a})`, "-c", `select pg_terminate_backend(${b})`, "-c", "select pg_sleep(0.4)"], { stdio: "ignore" });

    const again = await Promise.all([backend(p), backend(p)]);
    expect(again).not.toContain(a);
    expect(again).not.toContain(b);
  });

  it("keeps using a healthy connection that only sat idle", async () => {
    const p = pool(100);
    const before = await backend(p);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await backend(p)).toBe(before);
  });

  it("survives the database closing a connection that nobody is using", async () => {
    const p = pool(200);
    const before = await backend(p);
    const other = pool(200);
    await other.query("select pg_terminate_backend($1)", [before]);
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Without an error listener on the pool this would have crashed the process.
    expect(await backend(p)).not.toBe(before);
  });
});

describe("withStrictSsl", () => {
  it("spells out the verification that pg already applies to sslmode=require", () => {
    expect(withStrictSsl("postgres://u:p@host/db?sslmode=require")).toBe("postgres://u:p@host/db?sslmode=verify-full");
    expect(withStrictSsl("postgres://u:p@host/db?sslmode=require&channel_binding=require")).toBe(
      "postgres://u:p@host/db?sslmode=verify-full&channel_binding=require",
    );
    expect(withStrictSsl("postgres://u:p@host/db?foo=1&sslmode=prefer")).toBe("postgres://u:p@host/db?foo=1&sslmode=verify-full");
  });

  it("leaves other connection strings alone", () => {
    expect(withStrictSsl("postgres://u:p@localhost:5432/db")).toBe("postgres://u:p@localhost:5432/db");
    expect(withStrictSsl("postgres://u:p@host/db?sslmode=disable")).toBe("postgres://u:p@host/db?sslmode=disable");
    expect(withStrictSsl("postgres://u:p@host/db?sslmode=verify-full")).toBe("postgres://u:p@host/db?sslmode=verify-full");
  });
});
