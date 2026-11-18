import "server-only";
import { z } from "zod";

/** The shapes Claude must answer in. Enforced by structured outputs and validated again here. */

export const extractSchema = z.object({
  pages: z.array(
    z.object({
      page: z.number().int(),
      passages: z.array(
        z.object({
          kind: z.enum(["text", "handwriting", "diagram", "table", "equation"]),
          text: z.string(),
        }),
      ),
    }),
  ),
});

const topicType = z.enum(["memorization", "application", "concept"]);

export const topicsSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      type: topicType,
      passages: z.array(z.string()),
    }),
  ),
});

export const locateTopicSchema = z.object({
  found: z.boolean(),
  summary: z.string(),
  type: topicType,
  passages: z.array(z.string()),
});

export const flashcardsSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      passage: z.string(),
      quote: z.string(),
    }),
  ),
});

export const problemsSchema = z.object({
  problems: z.array(
    z.object({
      kind: z.enum(["mcq", "short", "worked"]),
      question: z.string(),
      options: z.array(z.string()),
      correctOption: z.number().int(),
      answer: z.string(),
      explanation: z.string(),
      steps: z.array(z.string()),
      passage: z.string(),
      quote: z.string(),
    }),
  ),
});

export const solutionsSchema = z.object({
  solutions: z.array(
    z.object({
      id: z.string(),
      answerable: z.boolean(),
      optionIndex: z.number().int(),
      answer: z.string(),
    }),
  ),
});

export const verdictsSchema = z.object({
  verdicts: z.array(z.object({ id: z.string(), agree: z.boolean() })),
});

export const gradesSchema = z.object({
  grades: z.array(z.object({ id: z.string(), correct: z.boolean(), feedback: z.string() })),
});

export const explanationSchema = z.object({ explanation: z.string() });
