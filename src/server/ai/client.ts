import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  AI_DAILY_CALL_LIMIT,
  AI_EFFORT,
  AI_MAX_TOKENS,
  AI_MODELS,
  AI_REFUSAL_FALLBACK,
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
  // Rate-limit and overload responses are retried with backoff before giving up.
  client ??= new Anthropic({ maxRetries: 4 });
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
  await reserveAiCall(ctx.userId, ctx.today, AI_DAILY_CALL_LIMIT);

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

  try {
    const message = await anthropic.beta.messages.parse({
      model,
      max_tokens: AI_MAX_TOKENS[task],
      ...(AI_REFUSAL_FALLBACK.enabled
        ? { betas: [AI_REFUSAL_FALLBACK.beta], fallbacks: AI_REFUSAL_FALLBACK.fallbacks }
        : {}),
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      messages: [{ role: "user", content }],
      output_config: { effort: AI_EFFORT[task], format: betaZodOutputFormat(schema) },
    });

    if (message.stop_reason === "refusal") {
      throw new AiRefusalError(message.stop_details?.category ?? null);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiOutputError("Claude ran out of room before finishing its answer");
    }
    if (message.parsed_output === null || message.parsed_output === undefined) {
      throw new AiOutputError("Claude's answer was not in the expected shape");
    }
    await log(true, message.usage);
    return message.parsed_output as T;
  } catch (error) {
    await log(false, undefined, describe(error));
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new AiUnavailableError("The Claude API key was rejected");
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      throw new AiBusyError();
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new AiBusyError();
    }
    throw error;
  }
}
