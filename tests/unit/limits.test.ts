import { describe, expect, it } from "vitest";
import { MAX_TEST_DAYS_AHEAD } from "@/config/study";
import { expectedChunkBytes, UPLOAD_CHUNK_BYTES } from "@/config/uploads";
import { addDays } from "@/lib/dates";
import { testDateProblem } from "@/lib/test-date";

const MB = 1024 * 1024;

describe("expectedChunkBytes", () => {
  it("is a full piece for every piece but the last", () => {
    expect(expectedChunkBytes(5 * MB, 0)).toBe(UPLOAD_CHUNK_BYTES);
    expect(expectedChunkBytes(5 * MB, 1)).toBe(UPLOAD_CHUNK_BYTES);
  });

  it("is whatever is left for the last piece", () => {
    expect(expectedChunkBytes(5 * MB, 2)).toBe(1 * MB);
    expect(expectedChunkBytes(1, 0)).toBe(1);
    expect(expectedChunkBytes(4 * MB, 1)).toBe(UPLOAD_CHUNK_BYTES);
  });

  it("is null for a piece the file does not have", () => {
    expect(expectedChunkBytes(5 * MB, 3)).toBeNull();
    expect(expectedChunkBytes(1, 1)).toBeNull();
    expect(expectedChunkBytes(4 * MB, 2)).toBeNull();
    expect(expectedChunkBytes(5 * MB, -1)).toBeNull();
    expect(expectedChunkBytes(5 * MB, 1.5)).toBeNull();
    expect(expectedChunkBytes(5 * MB, Number.NaN)).toBeNull();
  });
});

describe("testDateProblem", () => {
  const TODAY = "2026-11-18";

  it("accepts today and any day up to a year ahead", () => {
    expect(testDateProblem(TODAY, TODAY)).toBeNull();
    expect(testDateProblem("2026-11-25", TODAY)).toBeNull();
    expect(testDateProblem(addDays(TODAY, MAX_TEST_DAYS_AHEAD), TODAY)).toBeNull();
  });

  it("rejects a date that has passed", () => {
    expect(testDateProblem("2026-11-17", TODAY)).toMatch(/passed/);
  });

  it("rejects a date more than a year ahead, such as a mistyped year", () => {
    expect(testDateProblem(addDays(TODAY, MAX_TEST_DAYS_AHEAD + 1), TODAY)).toMatch(/year/);
    expect(testDateProblem("2062-11-25", TODAY)).toMatch(/year/);
    expect(testDateProblem("9999-12-31", TODAY)).toMatch(/year/);
  });

  it("rejects something that is not a date", () => {
    expect(testDateProblem("2026-13-40", TODAY)).toMatch(/date/);
    expect(testDateProblem("soon", TODAY)).toMatch(/date/);
  });
});
