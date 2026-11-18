import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AiBusyError,
  AiInputError,
  AiOutputError,
  AiRefusalError,
  AiUnavailableError,
  readAnswer,
  toAiError,
} from "@/server/ai/client";

const schema = z.object({ cards: z.array(z.object({ front: z.string() })) });
const parse = (text: string) => schema.parse(JSON.parse(text));
const GOOD = '{"cards":[{"front":"What is a mole?"}]}';

function message(stop_reason: string | null, text: string | null, category: string | null = null) {
  return {
    stop_reason,
    stop_details: category ? { category } : null,
    content: text === null ? [] : [{ type: "text", text }],
  };
}

describe("readAnswer", () => {
  it("returns the parsed answer of a message that ended normally", () => {
    expect(readAnswer(message("end_turn", GOOD), parse)).toEqual({ cards: [{ front: "What is a mole?" }] });
  });

  it("reads the answer that follows Claude's thinking", () => {
    const withThinking = {
      stop_reason: "end_turn",
      stop_details: null,
      content: [
        { type: "thinking", thinking: "…" },
        { type: "text", text: GOOD },
      ],
    };
    expect(readAnswer(withThinking, parse).cards).toHaveLength(1);
  });

  it("reports an answer cut off by the output limit, although its JSON is broken", () => {
    const cutOff = message("max_tokens", '{"cards":[{"front":"What is a mo');
    expect(() => readAnswer(cutOff, parse)).toThrow(AiOutputError);
    expect(() => readAnswer(cutOff, parse)).toThrow(/ran out of room/);
  });

  it("reports a refusal with its category, even when partial text came with it", () => {
    const refused = message("refusal", '{"cards":[', "cyber");
    try {
      readAnswer(refused, parse);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AiRefusalError);
      expect((error as AiRefusalError).category).toBe("cyber");
    }
  });

  it("reports materials that are too long for Claude to read at once", () => {
    expect(() => readAnswer(message("model_context_window_exceeded", null), parse)).toThrow(/too long/);
  });

  it("reports an answer that is not valid JSON", () => {
    expect(() => readAnswer(message("end_turn", "Here are your cards!"), parse)).toThrow(AiOutputError);
  });

  it("reports an answer that does not fit the expected shape", () => {
    expect(() => readAnswer(message("end_turn", '{"cards":"none"}'), parse)).toThrow(/expected shape/);
  });

  it("reports an empty answer", () => {
    expect(() => readAnswer(message("end_turn", null), parse)).toThrow(AiOutputError);
  });
});

describe("toAiError", () => {
  const headers = new Headers();
  const body = { type: "error", error: { type: "x", message: "m" } };

  it("treats a rejected key as Claude not being connected", () => {
    expect(toAiError(new Anthropic.AuthenticationError(401, body, "bad key", headers), "extract")).toBeInstanceOf(
      AiUnavailableError,
    );
    expect(toAiError(new Anthropic.PermissionDeniedError(403, body, "no", headers), "extract")).toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("treats rate limits, overload, dropped connections and timeouts as busy", () => {
    expect(toAiError(new Anthropic.RateLimitError(429, body, "slow down", headers), "solve")).toBeInstanceOf(AiBusyError);
    expect(toAiError(new Anthropic.InternalServerError(529, body, "overloaded", headers), "solve")).toBeInstanceOf(
      AiBusyError,
    );
    expect(toAiError(new Anthropic.APIConnectionError({ message: "reset" }), "solve")).toBeInstanceOf(AiBusyError);
    expect(toAiError(new Anthropic.APIConnectionTimeoutError(), "solve")).toBeInstanceOf(AiBusyError);
  });

  it("treats a file Claude cannot accept as a problem with the file", () => {
    const error = toAiError(new Anthropic.BadRequestError(400, body, "Could not process PDF", headers), "extract");
    expect(error).toBeInstanceOf(AiInputError);
    expect(error.message).toMatch(/file/);
  });

  it("treats any other request Claude cannot accept as a problem with what was sent", () => {
    const tooLarge = new Anthropic.APIError(413, body, "request too large", headers);
    expect(toAiError(tooLarge, "topics")).toBeInstanceOf(AiInputError);
    expect(toAiError(new Anthropic.BadRequestError(400, body, "prompt is too long", headers), "topics").message).not.toMatch(
      /file/,
    );
  });

  it("passes this app's own errors and anything unknown through unchanged", () => {
    const refusal = new AiRefusalError(null);
    const bug = new TypeError("boom");
    expect(toAiError(refusal, "grade")).toBe(refusal);
    expect(toAiError(bug, "grade")).toBe(bug);
  });
});
