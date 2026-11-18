import "server-only";
import type { z } from "zod";
import { describeError } from "@/server/error-messages";
import { InvalidRequestError, NotFoundError } from "@/server/errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Turns anything thrown by a handler into a JSON error the browser can show. */
export function errorResponse(error: unknown): Response {
  const { status, code, message } = describeError(error);
  if (code === "server_error") console.error("Unhandled route error", error);
  return Response.json({ error: message, code }, { status });
}

/** Wraps a route handler so every failure becomes a JSON error response. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return errorResponse(error);
  }
}

/** Reads and validates a JSON request body. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InvalidRequestError("The request body was not valid JSON.");
  }
  return schema.parse(raw);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a path id is a UUID before it reaches the database; anything else is simply not found. */
export function id(value: string): string {
  if (!UUID.test(value)) throw new NotFoundError();
  return value.toLowerCase();
}
