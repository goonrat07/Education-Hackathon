import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McqContent } from "@/lib/items";
import type { ContentBlock } from "@/server/ai/client";
import { generateCheckQuestions, generateFlashcards, generatePractice } from "@/server/ai/generate";
import { labelPassages } from "@/server/ai/prompts";
import { keepVerified } from "@/server/ai/verify";
import type { PassageWithFile } from "@/server/data/passages";

// Claude is the one thing these tests cannot call for real. Everything around
// it (what it is sent, and what happens to what it returns) is the real code.
const calls: Array<{ task: string; text: string }> = [];
let script: Record<string, unknown[]> = {};

vi.mock("@/server/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/client")>()),
  runClaude: vi.fn(async (_ctx: unknown, task: string, content: ContentBlock[]) => {
    calls.push({ task, text: content.map((b) => (b.type === "text" ? b.text : "")).join("\n") });
    const next = script[task]?.shift();
    if (next === undefined) throw new Error(`The test did not script a "${task}" answer`);
    return next;
  }),
}));

const ctx = { userId: "u", today: "2026-11-18" };
const topic = { name: "Molar mass", summary: "Add up atomic masses.", type: "application" };

function passage(id: string, text: string): PassageWithFile {
  return {
    id,
    userId: "u",
    testId: "t",
    fileId: "f",
    page: 1,
    position: 0,
    kind: "text",
    text,
    fileName: "guide.pdf",
    fileSource: "teacher",
    fileMime: "application/pdf",
  } as PassageWithFile;
}

const labeled = labelPassages([
  passage("p1", "Example 1. Molar mass of water, H2O: 2(1.008) + 16.00 = 18.02 g/mol."),
  passage("p2", "The mass in grams of one mole of a substance. Its unit is g/mol."),
]);

function problem(overrides: Record<string, unknown>) {
  return {
    kind: "short",
    question: "What is the molar mass of water?",
    options: [],
    correctOption: -1,
    answer: "18.02 g/mol",
    explanation: "Add two hydrogens and one oxygen.",
    steps: [],
    passage: "P1",
    quote: "2(1.008) + 16.00 = 18.02 g/mol",
    ...overrides,
  };
}

const solveCall = () => calls.find((c) => c.task === "solve")!;

beforeEach(() => {
  calls.length = 0;
  script = {};
});

describe("grounding: what Claude writes has to quote the student's materials", () => {
  it("keeps a problem whose quote is word for word in the passage it cites", async () => {
    script.generate = [{ problems: [problem({})] }];
    const candidates = await generatePractice(ctx, topic, labeled, [], { mcq: 0, short: 1, worked: 0 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "short", passageId: "p1" });
  });

  it("drops a problem whose quote is not in the passage", async () => {
    script.generate = [{ problems: [problem({ quote: "Water has a molar mass of 18.02 grams per mole" })] }];
    expect(await generatePractice(ctx, topic, labeled, [], { mcq: 0, short: 1, worked: 0 })).toEqual([]);
  });

  it("drops a problem that quotes a different passage than the one it cites", async () => {
    script.generate = [{ problems: [problem({ passage: "P2" })] }];
    expect(await generatePractice(ctx, topic, labeled, [], { mcq: 0, short: 1, worked: 0 })).toEqual([]);
  });

  it("drops a problem that cites a passage that does not exist", async () => {
    script.generate = [{ problems: [problem({ passage: "P9" })] }];
    expect(await generatePractice(ctx, topic, labeled, [], { mcq: 0, short: 1, worked: 0 })).toEqual([]);
  });

  it("drops a flashcard whose quote was made up", async () => {
    script.generate = [
      {
        cards: [
          { front: "Unit of molar mass?", back: "g/mol", passage: "P2", quote: "Its unit is g/mol" },
          { front: "Who discovered the mole?", back: "Avogadro", passage: "P2", quote: "Avogadro discovered the mole" },
        ],
      },
    ];
    const cards = await generateFlashcards(ctx, topic, labeled, [], 12);
    expect(cards.map((c) => (c.content as { front: string }).front)).toEqual(["Unit of molar mass?"]);
  });

  it("drops a question the student has already seen", async () => {
    script.generate = [{ problems: [problem({})] }];
    const seen = ["what is the molar mass of water"];
    expect(await generateCheckQuestions(ctx, topic, labeled, seen, 6)).toEqual([]);
  });

  it("drops a multiple-choice question without exactly four different options", async () => {
    script.generate = [
      {
        problems: [
          problem({ kind: "mcq", options: ["18.02 g/mol", "16.00 g/mol", "18.02 g/mol", "20 g/mol"], correctOption: 0 }),
          problem({ kind: "mcq", question: "Another?", options: ["a", "b", "c"], correctOption: 0 }),
        ],
      },
    ];
    expect(await generatePractice(ctx, topic, labeled, [], { mcq: 2, short: 0, worked: 0 })).toEqual([]);
  });
});

describe("verification: every answer is solved a second time without seeing the first", () => {
  async function candidates(...problems: Array<Record<string, unknown>>) {
    script.generate = [{ problems: problems.map(problem) }];
    return generatePractice(ctx, topic, labeled, [], { mcq: 3, short: 2, worked: 2 });
  }

  it("never shows the second solver the first answer, its explanation, its steps or its quote", async () => {
    const made = await candidates(
      {
        kind: "worked",
        question: "Find the molar mass of ammonia.",
        answer: "17.03 g/mol",
        steps: ["Count one nitrogen and three hydrogens.", "Add 14.01 and 3.024 to get the SECRETSTEP total."],
        explanation: "SECRETEXPLANATION",
      },
      { kind: "mcq", question: "Unit of molar mass?", options: ["g/mol", "mol/g", "g", "amu"], correctOption: 0, passage: "P2", quote: "Its unit is g/mol", explanation: "SECRETWHY" },
    );
    script.solve = [{ solutions: [] }];
    await keepVerified(ctx, labeled, made);

    const sent = solveCall().text;
    expect(sent).toContain("Find the molar mass of ammonia.");
    expect(sent).toContain("mol/g"); // options are shown
    expect(sent).not.toContain("17.03");
    expect(sent).not.toContain("SECRETSTEP");
    expect(sent).not.toContain("SECRETEXPLANATION");
    expect(sent).not.toContain("SECRETWHY");
    // The quote would give the answer away: it only appears where the passage itself has it.
    expect(sent.split("2(1.008) + 16.00 = 18.02 g/mol").length - 1).toBe(1);
    expect(sent).not.toMatch(/correct(Index|Option)/);
  });

  it("keeps an item when the second answer is the same", async () => {
    const made = await candidates({});
    script.solve = [{ solutions: [{ id: "q1", answerable: true, optionIndex: -1, answer: "18.02 g/mol" }] }];
    expect(await keepVerified(ctx, labeled, made)).toHaveLength(1);
  });

  it("drops an item when the second answer is a different number", async () => {
    const made = await candidates({});
    script.solve = [{ solutions: [{ id: "q1", answerable: true, optionIndex: -1, answer: "17.01 g/mol" }] }];
    expect(await keepVerified(ctx, labeled, made)).toEqual([]);
    expect(calls.some((c) => c.task === "judge")).toBe(false);
  });

  it("drops a multiple-choice item when the second solver picks another option", async () => {
    const made = await candidates({
      kind: "mcq",
      question: "Unit of molar mass?",
      options: ["g/mol", "mol/g", "g", "amu"],
      correctOption: 0,
      passage: "P2",
      quote: "Its unit is g/mol",
    });
    const right = (made[0].content as McqContent).correctIndex;
    script.solve = [{ solutions: [{ id: "q1", answerable: true, optionIndex: (right + 1) % 4, answer: "x" }] }];
    expect(await keepVerified(ctx, labeled, made)).toEqual([]);
  });

  it("drops an item the second solver calls unanswerable, even if its answer matches", async () => {
    const made = await candidates({});
    script.solve = [{ solutions: [{ id: "q1", answerable: false, optionIndex: -1, answer: "18.02 g/mol" }] }];
    expect(await keepVerified(ctx, labeled, made)).toEqual([]);
  });

  it("drops an item the second solver did not answer at all", async () => {
    const made = await candidates({}, { question: "What is the unit of molar mass?", answer: "g/mol", passage: "P2", quote: "Its unit is g/mol" });
    script.solve = [{ solutions: [{ id: "q2", answerable: true, optionIndex: -1, answer: "g/mol" }] }];
    const kept = await keepVerified(ctx, labeled, made);
    expect(kept.map((c) => (c.content as { question: string }).question)).toEqual(["What is the unit of molar mass?"]);
  });

  it("asks a judge when the two answers are worded differently, and drops the item if the judge says they differ", async () => {
    const made = await candidates(
      { question: "Why add 16.00?", answer: "Because water has one oxygen atom." },
      { question: "Why two times 1.008?", answer: "Because water has two hydrogen atoms." },
    );
    script.solve = [
      {
        solutions: [
          { id: "q1", answerable: true, optionIndex: -1, answer: "Oxygen contributes 16.00 once." },
          { id: "q2", answerable: true, optionIndex: -1, answer: "Hydrogen is diatomic in nature." },
        ],
      },
    ];
    script.judge = [{ verdicts: [{ id: "q1", agree: true }, { id: "q2", agree: false }] }];
    const kept = await keepVerified(ctx, labeled, made);
    expect(kept.map((c) => (c.content as { question: string }).question)).toEqual(["Why add 16.00?"]);
  });

  it("drops an item the judge gave no verdict on", async () => {
    const made = await candidates({ question: "Why add 16.00?", answer: "Because water has one oxygen atom." });
    script.solve = [{ solutions: [{ id: "q1", answerable: true, optionIndex: -1, answer: "Oxygen contributes 16.00 once." }] }];
    script.judge = [{ verdicts: [] }];
    expect(await keepVerified(ctx, labeled, made)).toEqual([]);
  });

  it("makes no call at all when there is nothing to verify", async () => {
    expect(await keepVerified(ctx, labeled, [])).toEqual([]);
    expect(calls).toEqual([]);
  });
});
