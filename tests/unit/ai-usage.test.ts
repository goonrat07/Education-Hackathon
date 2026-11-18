import { describe, expect, it } from "vitest";
import { totalInputTokens } from "@/server/ai/client";

describe("totalInputTokens", () => {
  it("is the plain input count when nothing was cached", () => {
    expect(totalInputTokens({ input_tokens: 681 })).toBe(681);
    expect(totalInputTokens({ input_tokens: 681, cache_creation_input_tokens: null, cache_read_input_tokens: null })).toBe(681);
  });

  it("includes tokens written to the cache", () => {
    expect(totalInputTokens({ input_tokens: 40, cache_creation_input_tokens: 2600, cache_read_input_tokens: 0 })).toBe(2640);
  });

  it("includes tokens read from the cache", () => {
    expect(totalInputTokens({ input_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 2600 })).toBe(2640);
  });
});
