"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopicEditor } from "@/components/topic-editor";
import { api, messageFrom } from "@/lib/api";
import type { PassageRef, TestDto, TopicDto } from "@/lib/dto";
import { plural } from "@/lib/format";
import type { UploadedFile } from "@/lib/uploads-client";
import { Materials, rowFromFile, type MaterialRow } from "./materials";

function StepHeading({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline gap-3 text-xl">
      <span aria-hidden="true" className="font-display text-2xl font-bold tabular-nums text-pencil">
        {step}
      </span>
      {children}
    </h2>
  );
}

/**
 * Setting a test up, in order: add materials, check the topics, build the plan.
 */
export function SetupFlow({
  test,
  initialFiles,
  initialTopics,
  initialPassages,
  hasPlan,
  topicsLocked,
}: {
  test: TestDto;
  initialFiles: UploadedFile[];
  initialTopics: TopicDto[];
  initialPassages: PassageRef[];
  hasPlan: boolean;
  /** True once the student has studied: the topic list can be edited but not rebuilt. */
  topicsLocked: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<MaterialRow[]>(() => initialFiles.map(rowFromFile));
  const [topics, setTopics] = useState(initialTopics);
  const [passages, setPassages] = useState(initialPassages);
  const [finding, setFinding] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyFiles = rows.filter((r) => r.state === "ready").length;
  const busyFiles = rows.filter((r) => r.state === "uploading" || r.state === "reading").length;
  const unrated = topics.filter((t) => t.confidence === null).length;

  async function refreshPassages() {
    const data = await api<{ passages: PassageRef[] }>(`/api/tests/${test.id}/passages`).catch(() => null);
    if (data) setPassages(data.passages);
  }

  async function findTopics() {
    setFinding(true);
    setError(null);
    try {
      const { topics: found } = await api<{ topics: TopicDto[] }>(`/api/tests/${test.id}/topics/generate`, {
        method: "POST",
      });
      setTopics(found);
      await refreshPassages();
    } catch (e) {
      setError(messageFrom(e));
    } finally {
      setFinding(false);
    }
  }

  async function buildPlan() {
    setBuilding(true);
    setError(null);
    try {
      await api(`/api/tests/${test.id}/plan`, { method: "POST" });
      router.push(`/tests/${test.id}`);
      router.refresh();
    } catch (e) {
      setError(messageFrom(e));
      setBuilding(false);
    }
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="step-materials">
        <div id="step-materials">
          <StepHeading step={1}>Add your materials</StepHeading>
        </div>
        <div className="mt-4">
          <Materials testId={test.id} rows={rows} onRows={(update) => setRows(update)} />
        </div>
      </section>

      <section aria-labelledby="step-topics">
        <div id="step-topics">
          <StepHeading step={2}>Check the topics</StepHeading>
        </div>
        {topics.length === 0 ? (
          <div className="mt-4 max-w-[60ch]">
            <p className="text-ink-soft">
              Study Coach reads your files and lists the topics this test covers. You can rename, merge, delete or
              add topics afterwards.
            </p>
            <button
              type="button"
              className="btn btn-ink mt-4"
              disabled={finding || readyFiles === 0 || busyFiles > 0}
              onClick={findTopics}
            >
              {finding ? "Finding the topics…" : "Find the topics"}
            </button>
            {finding && <div className="working-line mt-3" />}
            {!finding && readyFiles === 0 && <p className="field-hint">Add at least one file first.</p>}
            {!finding && readyFiles > 0 && busyFiles > 0 && (
              <p className="field-hint">Waiting for {plural(busyFiles, "file")} to finish.</p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="max-w-[60ch] text-ink-soft">
              Tap a number on each topic to say how well you know it. The plan starts with your weakest topics.
            </p>
            <div className="mt-4">
              <TopicEditor
                testId={test.id}
                topics={topics}
                passages={passages}
                onChange={setTopics}
                onPassagesStale={refreshPassages}
              />
            </div>
            {!topicsLocked && (
              <p className="mt-4 text-sm text-pencil">
                Added more files?{" "}
                <button
                  type="button"
                  className="link text-sm"
                  disabled={finding || busyFiles > 0 || readyFiles === 0}
                  onClick={findTopics}
                >
                  {finding ? "Finding the topics…" : "Find the topics again"}
                </button>{" "}
                (this replaces the list above, except topics you added yourself)
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="step-plan">
        <div id="step-plan">
          <StepHeading step={3}>{hasPlan ? "Back to your plan" : "Build your plan"}</StepHeading>
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-ink btn-lg"
            disabled={building || topics.length === 0 || unrated > 0}
            onClick={buildPlan}
          >
            {building ? "Building…" : hasPlan ? "See my plan" : "Build my plan"}
          </button>
          {topics.length > 0 && unrated > 0 && (
            <p className="field-hint">Rate {plural(unrated, "more topic")} first.</p>
          )}
          {topics.length === 0 && <p className="field-hint">Your plan is built from the topic list.</p>}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-[3px] bg-redpen-wash px-4 py-3 text-redpen">
          {error}
        </p>
      )}
    </div>
  );
}
