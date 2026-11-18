import "server-only";
import type { TopicType } from "@/config/study";
import type { PassageWithFile } from "@/server/data/passages";
import { runClaude, type AiContext } from "./client";
import {
  labelPassages,
  LOCATE_TOPIC_INSTRUCTIONS,
  passagesBlock,
  TOPICS_INSTRUCTIONS,
  type LabeledPassage,
} from "./prompts";
import { locateTopicSchema, topicsSchema } from "./schemas";

export interface FoundTopic {
  name: string;
  summary: string;
  type: TopicType;
  passageIds: string[];
}

/** Turns the labels Claude cited into passage ids, dropping any it made up. */
function resolveLabels(labels: string[], labeled: LabeledPassage[]): string[] {
  const byLabel = new Map(labeled.map((l) => [l.label.toLowerCase(), l.passage.id]));
  const ids = new Set<string>();
  for (const label of labels) {
    const id = byLabel.get(label.trim().toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Works out the topics a test covers from everything the student uploaded. */
export async function findTopics(
  ctx: AiContext,
  test: { className: string; name: string },
  passages: PassageWithFile[],
): Promise<FoundTopic[]> {
  if (passages.length === 0) return [];
  const labeled = labelPassages(passages);
  const result = await runClaude(
    ctx,
    "topics",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: TOPICS_INSTRUCTIONS(test) },
    ],
    topicsSchema,
  );

  const seen = new Set<string>();
  const topics: FoundTopic[] = [];
  for (const topic of result.topics) {
    const name = topic.name.trim();
    const passageIds = resolveLabels(topic.passages, labeled);
    // A topic with no real passage behind it has nothing to study from.
    if (!name || passageIds.length === 0 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    topics.push({ name, summary: topic.summary.trim(), type: topic.type, passageIds });
  }
  return topics;
}

/** Finds the passages for a topic the student typed in. Null when the materials do not cover it. */
export async function locateTopic(
  ctx: AiContext,
  test: { className: string; name: string },
  passages: PassageWithFile[],
  topicName: string,
): Promise<Omit<FoundTopic, "name"> | null> {
  if (passages.length === 0) return null;
  const labeled = labelPassages(passages);
  const result = await runClaude(
    ctx,
    "topics",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: LOCATE_TOPIC_INSTRUCTIONS(test, topicName) },
    ],
    locateTopicSchema,
  );
  const passageIds = resolveLabels(result.passages, labeled);
  if (!result.found || passageIds.length === 0) return null;
  return { summary: result.summary.trim(), type: result.type, passageIds };
}
