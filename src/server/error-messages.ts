import "server-only";
import { ZodError } from "zod";
import { AI_DAILY_CALL_LIMIT } from "@/config/ai";
import { AiBusyError, AiOutputError, AiRefusalError, AiUnavailableError } from "@/server/ai/client";
import { AiCeilingError, AiLimitError } from "@/server/data/usage";
import {
  InvalidRequestError,
  NoMaterialError,
  NotFoundError,
  SetupIncompleteError,
  UnauthorizedError,
} from "@/server/errors";

export interface ErrorDescription {
  /** HTTP status for the response. */
  status: number;
  /** Short machine-readable name the browser can act on. */
  code: string;
  /** What to tell the student. */
  message: string;
}

/** What a failure means, in words a student can act on. Anything unrecognized is a plain server error. */
export function describeError(error: unknown): ErrorDescription {
  const as = (status: number, code: string, message: string): ErrorDescription => ({ status, code, message });

  if (error instanceof SetupIncompleteError) {
    return as(503, "setup_incomplete", "Study Coach isn't fully set up yet: its database isn't connected.");
  }
  if (error instanceof UnauthorizedError) return as(401, "unauthorized", "Sign in to continue.");
  if (error instanceof NotFoundError) return as(404, "not_found", "That could not be found.");
  if (error instanceof NoMaterialError) return as(400, "no_material", error.message);
  if (error instanceof InvalidRequestError) return as(400, "invalid", error.message);
  if (error instanceof ZodError) return as(400, "invalid", "Some of what was sent is missing or not valid.");
  if (error instanceof AiLimitError) {
    return as(429, "ai_limit", `You've used all ${AI_DAILY_CALL_LIMIT} of today's AI requests. They reset at midnight.`);
  }
  if (error instanceof AiCeilingError) {
    return as(
      429,
      "ai_ceiling",
      "Study Coach has used all the AI requests it allows in one day, across everyone using it. They reset tomorrow.",
    );
  }
  if (error instanceof AiUnavailableError) {
    return as(503, "ai_unavailable", "Claude isn't connected on this server yet, so this step can't run.");
  }
  if (error instanceof AiBusyError) {
    return as(503, "ai_busy", "Claude is busy right now. Give it a minute and try again.");
  }
  if (error instanceof AiRefusalError) return as(422, "ai_refusal", "Claude declined to work with this material.");
  if (error instanceof AiOutputError) return as(502, "ai_output", error.message);
  return as(500, "server_error", "Something went wrong on our side. Try again.");
}
