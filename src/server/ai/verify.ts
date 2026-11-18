import "server-only";
import { answersAgree } from "@/lib/grounding";
import { answerText, promptText, type McqContent } from "@/lib/items";
import { runClaude, type AiContext } from "./client";
import type { Candidate } from "./generate";
import { JUDGE_INSTRUCTIONS, passagesBlock, SOLVE_INSTRUCTIONS, type LabeledPassage } from "./prompts";
import { solutionsSchema, verdictsSchema } from "./schemas";

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A question as the second solver sees it: the prompt and options, never the answer. */
function blindQuestion(id: string, candidate: Candidate): string {
  const prompt = xml(promptText(candidate.kind, candidate.content));
  if (candidate.kind === "mcq") {
    const options = (candidate.content as McqContent).options
      .map((option, i) => `<option index="${i}">${xml(option)}</option>`)
      .join("\n");
    return `<question id="${id}" type="multiple choice">\n${prompt}\n${options}\n</question>`;
  }
  return `<question id="${id}">\n${prompt}\n</question>`;
}

/**
 * Solves every candidate a second time, in a call that never sees the first
 * answer, and returns only the candidates where the two answers agree.
 * Anything that disagrees, or that the second solver calls unanswerable or
 * ambiguous, is discarded and never reaches the student.
 */
export async function keepVerified(
  ctx: AiContext,
  labeled: LabeledPassage[],
  candidates: Candidate[],
): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((_, i) => `q${i + 1}`);
  const questions = candidates.map((c, i) => blindQuestion(ids[i], c)).join("\n");

  const solved = await runClaude(
    ctx,
    "solve",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: SOLVE_INSTRUCTIONS(questions) },
    ],
    solutionsSchema,
  );
  const solutionById = new Map(solved.solutions.map((s) => [s.id.trim(), s]));

  const agreed = new Set<number>();
  const undecided: Array<{ index: number; second: string }> = [];
  candidates.forEach((candidate, index) => {
    const solution = solutionById.get(ids[index]);
    if (!solution || !solution.answerable) return;
    if (candidate.kind === "mcq") {
      if (solution.optionIndex === (candidate.content as McqContent).correctIndex) agreed.add(index);
      return;
    }
    const verdict = answersAgree(answerText(candidate.kind, candidate.content), solution.answer);
    if (verdict === "yes") agreed.add(index);
    else if (verdict === "unsure") undecided.push({ index, second: solution.answer });
  });

  if (undecided.length > 0) {
    const entries = undecided
      .map(({ index, second }) => {
        const c = candidates[index];
        return `<entry id="${ids[index]}">\n<question>${xml(promptText(c.kind, c.content))}</question>\n<answer_a>${xml(answerText(c.kind, c.content))}</answer_a>\n<answer_b>${xml(second)}</answer_b>\n</entry>`;
      })
      .join("\n");
    const judged = await runClaude(ctx, "judge", [{ type: "text", text: JUDGE_INSTRUCTIONS(entries) }], verdictsSchema);
    const agreeById = new Map(judged.verdicts.map((v) => [v.id.trim(), v.agree]));
    for (const { index } of undecided) {
      if (agreeById.get(ids[index]) === true) agreed.add(index);
    }
  }

  return candidates.filter((_, index) => agreed.has(index));
}
