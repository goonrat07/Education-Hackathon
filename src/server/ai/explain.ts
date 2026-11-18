import "server-only";
import { runClaude, type AiContext } from "./client";
import { EXPLAIN_INSTRUCTIONS } from "./prompts";
import { explanationSchema } from "./schemas";

/**
 * Writes the short "why your plan looks like this" note. The plan itself is
 * built by src/lib/plan.ts; Claude only puts it into words.
 */
export async function explainPlan(ctx: AiContext, facts: unknown): Promise<string> {
  const result = await runClaude(
    ctx,
    "explain",
    [{ type: "text", text: EXPLAIN_INSTRUCTIONS(JSON.stringify(facts, null, 1)) }],
    explanationSchema,
  );
  return result.explanation.trim();
}
