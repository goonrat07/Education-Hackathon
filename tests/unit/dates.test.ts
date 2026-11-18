import { describe, expect, it } from "vitest";
import { addDays, dateRange, daysBetween, isValidDate, isValidTimeZone, localDate } from "@/lib/dates";

describe("localDate", () => {
  const lateEveningPacific = new Date("2026-11-19T04:30:00Z");

  it("gives the student's calendar date, not the server's", () => {
    expect(localDate(lateEveningPacific, "America/Los_Angeles")).toBe("2026-11-18");
  });

  it("gives the UTC date for a UTC student", () => {
    expect(localDate(lateEveningPacific, "UTC")).toBe("2026-11-19");
  });

  it("falls back to UTC for a timezone that does not exist", () => {
    expect(localDate(lateEveningPacific, "Mars/Olympus")).toBe("2026-11-19");
  });
});

describe("addDays", () => {
  it("rolls over the end of a month", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("is not thrown off by the day clocks change", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("goes backwards with a negative count", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("daysBetween", () => {
  it("counts forward", () => {
    expect(daysBetween("2026-11-18", "2026-11-21")).toBe(3);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysBetween("2026-11-21", "2026-11-18")).toBe(-3);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-11-18", "2026-11-18")).toBe(0);
  });
});

describe("dateRange", () => {
  it("includes both ends", () => {
    expect(dateRange("2026-11-18", "2026-11-20")).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  });

  it("is empty when the end is before the start", () => {
    expect(dateRange("2026-11-20", "2026-11-18")).toEqual([]);
  });
});

describe("isValidTimeZone", () => {
  it("accepts a real zone", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
  });

  it("rejects a made-up zone", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("isValidDate", () => {
  it("accepts a real calendar date", () => {
    expect(isValidDate("2026-11-18")).toBe(true);
  });

  it("rejects a date that does not exist", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
  });

  it("rejects other formats", () => {
    expect(isValidDate("11/18/2026")).toBe(false);
  });
});
