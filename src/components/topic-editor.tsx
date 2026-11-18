"use client";

import { useState } from "react";
import { ConfidenceRating } from "@/components/confidence-rating";
import { LevelMark } from "@/components/level-mark";
import { RichText } from "@/components/rich-text";
import { SourceLink } from "@/components/source-panel";
import { TOPIC_TYPES, type TopicType } from "@/config/study";
import { api, messageFrom } from "@/lib/api";
import type { PassageRef, TopicDto } from "@/lib/dto";
import { MODES, modeForType } from "@/lib/modes";

const TYPE_HELP: Record<TopicType, string> = {
  memorization: "facts to remember",
  application: "a method to carry out",
  concept: "an idea to explain",
};

interface SourceGroup {
  key: string;
  label: string;
  passageIds: string[];
}

/** A topic's passages grouped by the page they are on, in reading order. */
function sourceGroups(topic: TopicDto, refs: Map<string, PassageRef>): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const id of topic.passageIds) {
    const ref = refs.get(id);
    if (!ref) continue;
    const key = `${ref.fileId}:${ref.page}`;
    const isPdf = ref.fileName.toLowerCase().endsWith(".pdf");
    const group = groups.get(key) ?? { key, label: isPdf ? `${ref.fileName}, page ${ref.page}` : ref.fileName, passageIds: [] };
    group.passageIds.push(id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function TopicRow({
  topic,
  others,
  refs,
  showLevel,
  onUpdated,
  onRemoved,
  onMerged,
}: {
  topic: TopicDto;
  others: TopicDto[];
  refs: Map<string, PassageRef>;
  showLevel: boolean;
  onUpdated: (topic: TopicDto) => void;
  onRemoved: (id: string) => void;
  onMerged: (sourceId: string, targetId: string) => void;
}) {
  const [panel, setPanel] = useState<"none" | "rename" | "merge" | "delete">("none");
  const [draftName, setDraftName] = useState(topic.name);
  const [mergeInto, setMergeInto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(change: Partial<Pick<TopicDto, "name" | "type" | "confidence">>) {
    const before = topic;
    onUpdated({ ...topic, ...change });
    setError(null);
    try {
      await api(`/api/topics/${topic.id}`, { method: "PATCH", body: change });
    } catch (e) {
      onUpdated(before);
      setError(messageFrom(e));
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(messageFrom(e));
    } finally {
      setBusy(false);
    }
  }

  const groups = sourceGroups(topic, refs);
  const headingId = `topic-${topic.id}`;

  return (
    <li className="py-5 ruled-bottom" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          {panel === "rename" ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = draftName.trim();
                if (name.length < 2) return;
                void patch({ name });
                setPanel("none");
              }}
            >
              <div className="min-w-0 flex-1">
                <label htmlFor={`rename-${topic.id}`} className="field-label">
                  Topic name
                </label>
                <input
                  id={`rename-${topic.id}`}
                  className="field"
                  autoFocus
                  maxLength={80}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-ink btn-sm">
                Save name
              </button>
              <button type="button" className="btn btn-paper btn-sm" onClick={() => setPanel("none")}>
                Cancel
              </button>
            </form>
          ) : (
            <h3 id={headingId} className="text-lg leading-snug">
              {showLevel ? <LevelMark level={topic.level}>{topic.name}</LevelMark> : topic.name}
            </h3>
          )}
          {topic.summary && (
            <p className="mt-1.5 max-w-[62ch] text-ink-soft">
              <RichText text={topic.summary} />
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <label htmlFor={`type-${topic.id}`} className="text-pencil">
              Type
            </label>
            <select
              id={`type-${topic.id}`}
              value={topic.type}
              onChange={(e) => void patch({ type: e.target.value as TopicType })}
              className="rounded-[3px] border-0 border-b-2 border-rule bg-sheet py-0.5 pl-1 pr-6 font-semibold"
            >
              {TOPIC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <span className="text-pencil">
              {TYPE_HELP[topic.type]}, studied with {MODES[modeForType(topic.type)].label.toLowerCase()}
            </span>
          </div>

          {groups.length > 0 ? (
            <ul className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" aria-label="Where this topic comes from">
              <li className="text-pencil" aria-hidden="true">
                From
              </li>
              {groups.map((group) => (
                <li key={group.key}>
                  <SourceLink passageId={group.passageIds[0]} highlight={group.passageIds}>
                    {group.label}
                  </SourceLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-redpen">No passages from your files are linked to this topic.</p>
          )}
        </div>

        <div className="shrink-0">
          <p className="mb-1.5 text-sm text-pencil" id={`conf-${topic.id}`}>
            How well do you know this?
          </p>
          <ConfidenceRating
            value={topic.confidence}
            onChange={(confidence) => void patch({ confidence })}
            label={`Confidence in ${topic.name}, 1 is lost, 5 is could teach it`}
          />
          <p className="mt-1 flex justify-between text-xs text-pencil">
            <span>lost</span>
            <span>could teach it</span>
          </p>
        </div>
      </div>

      {panel === "none" && (
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <button
            type="button"
            className="link link-quiet"
            onClick={() => {
              setDraftName(topic.name);
              setPanel("rename");
            }}
          >
            Rename
          </button>
          {others.length > 0 && (
            <button type="button" className="link link-quiet" onClick={() => setPanel("merge")}>
              Merge
            </button>
          )}
          <button type="button" className="link link-quiet" onClick={() => setPanel("delete")}>
            Delete
          </button>
        </p>
      )}

      {panel === "merge" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!mergeInto) return;
            void run(async () => {
              await api(`/api/topics/${topic.id}/merge`, { body: { intoTopicId: mergeInto } });
              onMerged(topic.id, mergeInto);
            });
          }}
        >
          <div>
            <label htmlFor={`merge-${topic.id}`} className="field-label">
              Merge &ldquo;{topic.name}&rdquo; into
            </label>
            <select
              id={`merge-${topic.id}`}
              className="field"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              required
            >
              <option value="">Choose a topic</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-ink btn-sm" disabled={busy || !mergeInto}>
            {busy ? "Merging…" : "Merge topics"}
          </button>
          <button type="button" className="btn btn-paper btn-sm" onClick={() => setPanel("none")}>
            Cancel
          </button>
        </form>
      )}

      {panel === "delete" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Delete &ldquo;{topic.name}&rdquo;? Its cards, questions and history go with it.</span>
          <button
            type="button"
            className="btn btn-sm border-redpen bg-redpen text-paper"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/api/topics/${topic.id}`, { method: "DELETE" });
                onRemoved(topic.id);
              })
            }
          >
            {busy ? "Deleting…" : "Delete topic"}
          </button>
          <button type="button" className="btn btn-paper btn-sm" onClick={() => setPanel("none")}>
            Keep it
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-redpen">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The topic list a student can edit: rate confidence, rename, change type,
 * merge, delete, and add a topic (which must be covered by their materials).
 */
export function TopicEditor({
  testId,
  topics,
  passages,
  showLevels = false,
  onChange,
  onPassagesStale,
}: {
  testId: string;
  topics: TopicDto[];
  passages: PassageRef[];
  showLevels?: boolean;
  onChange: (topics: TopicDto[]) => void;
  /** Called after a change that may have linked passages the page does not know about yet. */
  onPassagesStale?: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const refs = new Map(passages.map((p) => [p.id, p]));

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name.length < 2) return;
    setAdding(true);
    setAddError(null);
    try {
      const { topic } = await api<{ topic: TopicDto }>(`/api/tests/${testId}/topics`, { body: { name } });
      onChange([...topics, topic]);
      onPassagesStale?.();
      setNewName("");
    } catch (e) {
      setAddError(messageFrom(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <ul className="ruled-top">
        {topics.map((topic) => (
          <TopicRow
            key={topic.id}
            topic={topic}
            others={topics.filter((t) => t.id !== topic.id)}
            refs={refs}
            showLevel={showLevels}
            onUpdated={(updated) => onChange(topics.map((t) => (t.id === updated.id ? updated : t)))}
            onRemoved={(id) => onChange(topics.filter((t) => t.id !== id))}
            onMerged={(sourceId, targetId) => {
              const source = topics.find((t) => t.id === sourceId);
              onChange(
                topics
                  .filter((t) => t.id !== sourceId)
                  .map((t) =>
                    t.id === targetId && source
                      ? {
                          ...t,
                          passageIds: [...new Set([...t.passageIds, ...source.passageIds])],
                          level: (Math.min(t.level, source.level) as TopicDto["level"]),
                          confidence:
                            t.confidence === null
                              ? source.confidence
                              : source.confidence === null
                                ? t.confidence
                                : Math.min(t.confidence, source.confidence),
                          summary: t.summary || source.summary,
                        }
                      : t,
                  ),
              );
            }}
          />
        ))}
      </ul>

      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="new-topic" className="field-label">
            Missing a topic? Add it
          </label>
          <input
            id="new-topic"
            className="field"
            maxLength={80}
            placeholder="Percent yield"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-paper" disabled={adding || newName.trim().length < 2}>
          {adding ? "Looking in your files…" : "Add topic"}
        </button>
      </form>
      {adding && <div className="working-line mt-3 max-w-md" />}
      {addError && (
        <p role="alert" className="mt-2 text-sm text-redpen">
          {addError}
        </p>
      )}
    </div>
  );
}
