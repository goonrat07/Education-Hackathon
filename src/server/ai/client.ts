import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  AI_DAILY_CALL_CEILING,
  AI_DAILY_CALL_LIMIT,
  AI_EFFORT,
  AI_MAX_RETRIES,
  AI_MAX_TOKENS,
  AI_MODELS,
  AI_REFUSAL_FALLBACK,
  AI_TIMEOUT_SECONDS,
  type AiTask,
} from "@/config/ai";
import { logAiCall, reserveAiCall } from "@/server/data/usage";
import { SYSTEM_PROMPT } from "./prompts";

/** Claude is not reachable: no key configured, or the key was rejected. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Claude is rate limited or overloaded right now; trying again later should work. */
export class AiBusyError extends Error {
  constructor() {
    super("Claude is busy right now");
    this.name = "AiBusyError";
  }
}

/** Claude declined the request. */
export class AiRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super("Claude declined this request");
    this.name = "AiRefusalError";
  }
}

/** Claude answered, but the answer could not be used. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** Claude would not accept what was sent: an unreadable or oversized file, or too much text at once. */
export class AiInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInputError";
  }
}

export type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

/** Who is asking, so the call counts against the right student's day. */
export interface AiContext {
  userId: string;
  /** The student's local date. */
  today: string;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiUnavailableError("ANTHROPIC_API_KEY is not set on the server");
  }
  // Rate-limit, overload and connection failures are retried with backoff before giving up.
  client ??= new Anthropic({ maxRetries: AI_MAX_RETRIES });
  return client;
}

/** True when the server has a Claude key configured. */
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Everything Claude read for a call: fresh input plus what was written to or read from the prompt cache. */
export function totalInputTokens(usage: {
  input_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): number {
  return usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
}

/** The parts of a finished message that decide what its answer is worth. */
interface FinishedMessage {
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  content: Array<{ type: string; text?: string }>;
}

/**
 * Reads Claude's answer out of a finished message. How the message ended is
 * checked before its text is trusted: an answer that was cut off or refused
 * carries broken or partial JSON, and that must not be mistaken for a bad answer.
 *
 * @param parse turns the answer text into the expected shape, throwing when it does not fit
 */
export function readAnswer<T>(message: FinishedMessage, parse: (text: string) => T): T {
  if (message.stop_reason === "refusal") {
    throw new AiRefusalError(message.stop_details?.category ?? null);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiOutputError("Claude ran out of room before finishing its answer. Try again.");
  }
  if (message.stop_reason === "model_context_window_exceeded") {
    throw new AiOutputError("These materials are too long for Claude to read in one go.");
  }
  const text = message.content.find((block) => block.type === "text")?.text ?? "";
  if (!text.trim()) throw new AiOutputError("Claude's answer came back empty. Try again.");
  try {
    return parse(text);
  } catch {
    throw new AiOutputError("Claude's answer was not in the expected shape. Try again.");
  }
}

/**
 * Turns a failure from the Anthropic SDK into one of this app's own errors,
 * so every caller can tell the student what happened. This app's own errors
 * and anything unrecognized pass through unchanged.
 */
export function toAiError(error: unknown, task: AiTask): Error {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiUnavailableError("The Claude API key was rejected");
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return new AiBusyError();
  }
  if (error instanceof Anthropic.APIError && (error.status === 400 || error.status === 413 || error.status === 422)) {
    return new AiInputError(
      task === "extract"
        ? "Claude couldn't read this file. It may be password-protected, damaged or too large. Export it again as a PDF, or add photos of the pages instead."
        : "Claude couldn't take in everything this step sends it. Try again; if it keeps happening, this test may hold too much material.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 500) : String(error).slice(0, 500);
}

/**
 * The only way this app calls Claude. Counts the call against the student's
 * daily limit first, asks for an answer in the given shape, and returns it
 * parsed and validated.
 */
export async function runClaude<T>(
  ctx: AiContext,
  task: AiTask,
  content: ContentBlock[],
  schema: z.ZodType<T>,
): Promise<T> {
  const anthropic = getClient();
  await reserveAiCall(ctx.userId, ctx.today, AI_DAILY_CALL_LIMIT, {
    day: new Date().toISOString().slice(0, 10),
    limit: AI_DAILY_CALL_CEILING,
  });

  const model = AI_MODELS[task];
  const started = Date.now();
  const log = (ok: boolean, usage?: Anthropic.Beta.BetaUsage, error?: string) =>
    logAiCall(ctx.userId, {
      task,
      model,
      inputTokens: usage ? totalInputTokens(usage) : 0,
      outputTokens: usage?.output_tokens ?? 0,
      durationMs: Date.now() - started,
      ok,
      error,
    }).catch(() => undefined);

  const format = betaZodOutputFormat(schema);
  try {
    // create(), not parse(): parse() reads the answer text before anything
    // else, so a cut-off or refused answer would fail there with a generic error.
    const message = await anthropic.beta.messages.create(
      {
        model,
        max_tokens: AI_MAX_TOKENS[task],
        ...(AI_REFUSAL_FALLBACK.enabled
          ? { betas: [AI_REFUSAL_FALLBACK.beta], fallbacks: AI_REFUSAL_FALLBACK.fallbacks }
          : {}),
        system: [{ type: "text", text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content }],
        output_config: { effort: AI_EFFORT[task], format },
      },
      { timeout: AI_TIMEOUT_SECONDS[task] * 1000 },
    );
    const answer = readAnswer(message, (text) => format.parse(text));
    await log(true, message.usage);
    return answer;
  } catch (error) {
    await log(false, undefined, describe(error));
    throw toAiError(error, task);
  }
}
