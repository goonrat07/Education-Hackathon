import "server-only";
import { z } from "zod";
import { MAX_MINUTES_PER_DAY, MIN_MINUTES_PER_DAY, TOPIC_TYPES } from "@/config/study";
import { isValidDate } from "@/lib/dates";

/** Input rules shared by more than one route. */

export const testFields = {
  className: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  testDate: z.string().refine(isValidDate, "Not a valid date"),
  minutesPerDay: z.number().int().min(MIN_MINUTES_PER_DAY).max(MAX_MINUTES_PER_DAY),
};

export const topicType = z.enum(TOPIC_TYPES as [string, ...string[]]) as z.ZodType<(typeof TOPIC_TYPES)[number]>;
export const confidence = z.number().int().min(1).max(5);
