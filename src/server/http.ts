import "server-only";
import { ZodError, type z } from "zod";
import { AI_DAILY_CALL_LIMIT } from "@/config/ai";
import { AiBusyError, AiOutputError, AiRefusalError, AiUnavailableError } from "@/server/ai/client";
import { AiLimitError } from "@/server/data/usage";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { UnauthorizedError } from "@/server/session";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function fail(status: number, error: string, code?: string): Response {
  return Response.json({ error, code }, { status });
}

/** Turns anything thrown by a handler into a JSON error the browser can show. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return fail(401, "Sign in to continue.", "unauthorized");
  if (error instanceof NotFoundError) return fail(404, "That could not be found.", "not_found");
  if (error instanceof InvalidRequestError) return fail(400, error.message, "invalid");
  if (error instanceof ZodError) return fail(400, "Some of what was sent is missing or not valid.", "invalid");
  if (error instanceof AiLimitError) {
    return fail(
      429,
      `You've used all ${AI_DAILY_CALL_LIMIT} of today's AI requests. They reset at midnight.`,
      "ai_limit",
    );
  }
  if (error instanceof AiUnavailableError) {
    return fail(503, "Claude isn't connected on this server yet, so this step can't run.", "ai_unavailable");
  }
  if (error instanceof AiBusyError) return fail(503, "Claude is busy right now. Give it a minute and try again.", "ai_busy");
  if (error instanceof AiRefusalError) {
    return fail(422, "Claude declined to work with this material.", "ai_refusal");
  }
  if (error instanceof AiOutputError) return fail(502, error.message, "ai_output");
  console.error("Unhandled route error", error);
  return fail(500, "Something went wrong on our side. Try again.", "server_error");
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
