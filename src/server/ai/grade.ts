import "server-only";
import { answersAgree } from "@/lib/grounding";
import type { PassageWithFile } from "@/server/data/passages";
import { AiOutputError, runClaude, type AiContext } from "./client";
import { GRADE_INSTRUCTIONS, labelPassages, passagesBlock } from "./prompts";
import { gradesSchema } from "./schemas";

export interface ToGrade {
  id: string;
  question: string;
  modelAnswer: string;
  studentAnswer: string;
}

export interface Grade {
  correct: boolean;
  feedback: string;
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Grades typed answers. Blank answers and answers that plainly match (or are
 * a plainly different number) are settled without AI; the rest go to Claude
 * in one call with the passages the questions came from.
 */
export async function gradeAnswers(
  ctx: AiContext,
  passages: PassageWithFile[],
  entries: ToGrade[],
): Promise<Map<string, Grade>> {
  const grades = new Map<string, Grade>();
  const forClaude: ToGrade[] = [];

  for (const entry of entries) {
    const typed = entry.studentAnswer.trim();
    if (!typed) {
      grades.set(entry.id, { correct: false, feedback: "No answer given." });
      continue;
    }
    const verdict = answersAgree(typed, entry.modelAnswer);
    if (verdict === "yes") grades.set(entry.id, { correct: true, feedback: "" });
    else if (verdict === "no") grades.set(entry.id, { correct: false, feedback: "" });
    else forClaude.push({ ...entry, studentAnswer: typed.slice(0, 2000) });
  }
  if (forClaude.length === 0) return grades;

  const block = forClaude
    .map(
      (e) =>
        `<answer id="${e.id}">\n<question>${xml(e.question)}</question>\n<model_answer>${xml(e.modelAnswer)}</model_answer>\n<student_answer>${xml(e.studentAnswer)}</student_answer>\n</answer>`,
    )
    .join("\n");
  const result = await runClaude(
    ctx,
    "grade",
    [
      { type: "text", text: passagesBlock(labelPassages(passages)), cache_control: { type: "ephemeral" } },
      { type: "text", text: GRADE_INSTRUCTIONS(block) },
    ],
    gradesSchema,
  );
  const byId = new Map(result.grades.map((g) => [g.id.trim(), g]));
  for (const entry of forClaude) {
    const grade = byId.get(entry.id);
    if (!grade) throw new AiOutputError("Claude did not grade every answer");
    grades.set(entry.id, { correct: grade.correct, feedback: grade.feedback.trim() });
  }
  return grades;
}
