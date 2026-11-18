import "server-only";
import type { PassageWithFile } from "@/server/data/passages";

/**
 * Prompt text. The system prompt is the same for every call; each job adds
 * its own instructions after the student's passages.
 */

export const SYSTEM_PROMPT = `You work inside Study Coach, an app that helps middle and high school students study for an upcoming test from their own class materials: handouts from their teacher and notes they took themselves.

The student will be tested on what is in those materials, so they are your only source. Everything you write (topics, cards, questions, answers, explanations, feedback) has to be supported by the passages you are given. Do not add facts, examples, or terminology from your own knowledge, even when you are sure they are correct: a fact that is not in the materials may not be what the teacher taught, and the student cannot check it against their notes. When the materials do not contain enough to do what is asked, return fewer items instead of filling the gap.

Students read your words directly, on a phone or a Chromebook, often late in the evening. Write plainly and briefly, at the reading level of the materials themselves.

Notation: write mathematics as LaTeX between single dollar signs, like $x^2 + 3x = 10$ or $\\frac{1}{2}$. Write chemical formulas and equations with mhchem inside dollar signs, like $\\ce{H2O}$ or $\\ce{2H2 + O2 -> 2H2O}$. Everything else is plain text: no Markdown, no headings, no bullet characters, no bold.`;

export interface LabeledPassage {
  label: string;
  passage: PassageWithFile;
}

/** Gives each passage a short label (P1, P2, …) that Claude uses to cite it. */
export function labelPassages(passages: PassageWithFile[]): LabeledPassage[] {
  return passages.map((passage, i) => ({ label: `P${i + 1}`, passage }));
}

function escapeAttribute(value: string): string {
  return value.replace(/[<>"&]/g, " ");
}

/** The passages as a block Claude can cite from. */
export function passagesBlock(labeled: LabeledPassage[]): string {
  const body = labeled
    .map(({ label, passage }) => {
      const from = passage.fileSource === "teacher" ? "teacher material" : "student's own notes";
      return `<passage id="${label}" file="${escapeAttribute(passage.fileName)}" page="${passage.page}" from="${from}" kind="${passage.kind}">\n${passage.text}\n</passage>`;
    })
    .join("\n");
  return `<passages>\n${body}\n</passages>`;
}

export function avoidBlock(prompts: string[]): string {
  if (prompts.length === 0) return "";
  const lines = prompts.slice(-60).map((p) => `- ${p.replace(/\s+/g, " ").slice(0, 200)}`);
  return `\n\nThe student has already seen these. Write different ones: do not repeat any of them, and do not ask the same thing in other words.\n<already_seen>\n${lines.join("\n")}\n</already_seen>`;
}

const GROUNDING_RULE = `For each one, cite the single passage it is based on by its id, and copy a short quote from that passage, word for word (5 to 25 words), that contains or directly supports the answer. The quote is checked against the passage by a program, so it has to be an exact, continuous excerpt of that one passage.`;

export const EXTRACT_INSTRUCTIONS = (file: { name: string; source: "teacher" | "notes" }, pageNote: string) =>
  `This is "${file.name}", ${file.source === "teacher" ? "material the teacher handed out" : "the student's own notes"} for an upcoming test. ${pageNote}

Read every page and write out what is on it as a list of passages, in reading order. Later steps build flashcards and practice questions from these passages and show them to the student next to the original page, so they need to be faithful and self-contained.

How to split and write passages:
- One passage is one unit of content: a heading with the paragraph or bullet list under it, one definition, one worked example, one table, one diagram. Aim for one to six sentences each. Keep a worked example together with its steps.
- Copy the wording as it is written. Fix nothing, summarize nothing, and add nothing. Keep the student's abbreviations and spelling.
- Handwriting: transcribe it as text. If a word cannot be read, write [illegible] in its place rather than guessing.
- Diagrams, graphs and drawings: describe what is shown precisely enough to study from, including every label, arrow, axis and relationship, starting with "Diagram:".
- Tables: write each row on its own line with cells separated by " | ".
- Equations and formulas: write them in the notation described above.
- Skip page numbers, running headers and footers, and decoration.

For each passage give its kind: "text" for printed text, "handwriting" for handwritten text, "diagram" for a described figure, "table", or "equation" when the passage is mainly a formula or equation.`;

export const TOPICS_INSTRUCTIONS = (test: { className: string; name: string }) =>
  `These passages are everything the student uploaded for their ${test.className} test, "${test.name}".

Work out the topics this test covers. Teacher material shows what will be tested; the student's notes fill in detail. A topic is one thing a student can study in a single 10 to 15 minute sitting: narrow enough to finish, broad enough to be worth a session. Most tests come out at 4 to 10 topics. Do not make a topic for anything the passages barely mention.

For each topic give:
- name: a short title the student would recognize from class (2 to 6 words).
- summary: one or two sentences saying what the student needs to know or be able to do, using only what the passages say.
- type: "memorization" when it is mostly facts to recall (vocabulary, definitions, dates, names, formulas to know by heart); "application" when it is a procedure to carry out (solve, calculate, balance, convert, translate, apply a rule); "concept" when it is an idea to understand and explain (why something happens, how parts relate, comparing things).
- passages: the ids of every passage that belongs to this topic. A passage can belong to more than one topic. Every passage with testable content should end up in at least one.`;

export const LOCATE_TOPIC_INSTRUCTIONS = (test: { className: string; name: string }, topicName: string) =>
  `These passages are everything the student uploaded for their ${test.className} test, "${test.name}".

The student wants to add a topic called "${topicName}". Find the passages that cover it.

If the passages do cover it, set found to true and give a one or two sentence summary of what the student needs to know (using only what the passages say), the type ("memorization" for facts to recall, "application" for a procedure to carry out, "concept" for an idea to understand and explain), and the ids of every passage that belongs to it.

If nothing in the passages covers it, set found to false, leave summary empty and passages empty, and use type "concept". Do not stretch: a topic the materials only mention in passing is not covered.`;

export const FLASHCARDS_INSTRUCTIONS = (topic: { name: string; summary: string }, count: number, avoid: string[]) =>
  `These are the passages for the topic "${topic.name}" (${topic.summary}).

Write up to ${count} flashcards that cover what a student has to remember about this topic. The front asks for exactly one thing (a term, a definition, a value, a name, a step). The back is the answer alone, as short as it can be while still complete, usually a few words or one sentence. Cover the whole topic rather than several cards on the same fact, and write fewer cards if the passages do not hold ${count} separate facts.

${GROUNDING_RULE}${avoidBlock(avoid)}`;

const PROBLEM_KINDS = `Kinds of problem:
- "mcq": a multiple-choice question with exactly four options, one correct. Wrong options should be mistakes a student could really make, not jokes. Put the correct option in a different position each time. Set correctOption to its position (0 for the first option) and answer to the text of the correct option. Leave steps empty.
- "short": a question answered in a sentence or two, or with a single value. Set answer to a model answer a teacher would accept. Leave options and steps empty and set correctOption to -1.
- "worked": a multi-step problem. Set steps to the full solution, one step per entry, each step showing what is done and why. Set answer to the final answer alone, in its simplest form with its unit if it has one (for example "0.50 mol"), with no explanation. Leave options empty and set correctOption to -1.

For every problem, explanation is one or two sentences telling a student who got it wrong why the answer is what it is.`;

const NEW_PROBLEM_RULE = `Questions should make the student use what the passages teach, not just spot a sentence. Where the passages show a method or a worked example, write new problems of the same kind with different numbers or a different case, solvable with exactly the method and the facts the passages give. Every value needed to solve a problem must be stated in the problem or in the passages.`;

export const PRACTICE_INSTRUCTIONS = (
  topic: { name: string; summary: string; type: string },
  mix: { mcq: number; short: number; worked: number },
  avoid: string[],
) =>
  `These are the passages for the ${topic.type} topic "${topic.name}" (${topic.summary}).

Write practice problems for this topic: ${mix.mcq} of kind "mcq", ${mix.short} of kind "short" and ${mix.worked} of kind "worked". Write fewer of a kind if the passages cannot support that many.

${NEW_PROBLEM_RULE}

${PROBLEM_KINDS}

${GROUNDING_RULE}${avoidBlock(avoid)}`;

export const CHECK_INSTRUCTIONS = (
  topic: { name: string; summary: string; type: string },
  count: number,
  avoid: string[],
) =>
  `These are the passages for the ${topic.type} topic "${topic.name}" (${topic.summary}).

Write ${count} questions for a quick check that shows whether the student has learned this topic. Use a mix of kind "mcq" and kind "short" only. Each question should take under a minute and test a different part of the topic. A short question must have one clearly correct answer that can be given in a few words, a sentence, or a single value.

${NEW_PROBLEM_RULE}

${PROBLEM_KINDS}

${GROUNDING_RULE}${avoidBlock(avoid)}`;

export const SOLVE_INSTRUCTIONS = (questions: string) =>
  `These are passages from a student's class materials, followed by questions written from them.

Answer each question yourself, using only the passages. For a multiple-choice question, set optionIndex to the position of the option you choose (0 for the first) and answer to that option's text. For any other question, set optionIndex to -1 and answer to your answer alone: for a calculation, the final value in its simplest form with its unit; otherwise a few words or one sentence.

Set answerable to false when a question cannot be answered from the passages, is ambiguous, has more than one defensible answer, or (for multiple choice) has no correct option or more than one. Still give your best answer in that case.

<questions>
${questions}
</questions>`;

export const JUDGE_INSTRUCTIONS = (pairs: string) =>
  `Each entry below has a question and two answers to it that were written independently. Decide for each entry whether the two answers agree.

They agree when they give the same result or state the same facts, even if the wording, the level of detail, the rounding or the notation differs. They do not agree when they give different values, different units that are not equivalent, different named things, or when one contradicts or leaves out something the other treats as essential to answering the question.

<entries>
${pairs}
</entries>`;

export const GRADE_INSTRUCTIONS = (entries: string) =>
  `A student answered the questions below. Each entry has the question, the model answer written from the student's class materials, and what the student typed. The passages above are the materials the questions came from.

Mark each answer correct or not. An answer is correct when it shows the student knows what the model answer says: same value or same key idea, in any wording, with spelling mistakes ignored. It is not correct when it is wrong, when it leaves out the idea the question was asking for, or when it only restates the question. For a calculation, the final value has to match the model answer apart from reasonable rounding.

Write feedback of one or two sentences addressed to the student as "you". If they were right, confirm what they got right. If not, say what was missing or mistaken and what the materials say, without scolding.

<answers>
${entries}
</answers>`;

export const EXPLAIN_INSTRUCTIONS = (facts: string) =>
  `Below is a study plan that the app's planner built for a student, with the facts it was built from. The plan is final: your job is only to explain it.

Write three or four sentences, addressed to the student as "you", that tell them why the plan looks the way it does: which topics come first and why (the planner puts the weakest first, by level, latest check result and their own confidence rating), how earlier topics come back for review before the test, and, if the plan reports a shortage, that there is not enough time for everything and what it chose to prioritize. Use the topic names and numbers given. Do not give study advice, do not mention anything that is not in the facts, and do not describe a plan that differs from the one shown.

<plan_facts>
${facts}
</plan_facts>`;
