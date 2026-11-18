import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isModeId } from "@/lib/modes";
import { listSessionChecks } from "@/server/data/checks";
import { getSession } from "@/server/data/sessions";
import { getTest } from "@/server/data/tests";
import { getTopic } from "@/server/data/topics";
import { pageUser } from "@/server/page-user";
import { summarizeSession } from "@/server/study/sessions";
import { SessionRunnerLoader } from "./session-runner-loader";
import { SummaryView } from "./summary-view";

export const metadata: Metadata = { title: "Study session" };

const UUID = /^[0-9a-f-]{36}$/i;

async function Session({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await pageUser();
  const { sessionId } = await params;
  const session = UUID.test(sessionId) ? await getSession(user.userId, sessionId) : null;
  if (!session || !isModeId(session.mode)) notFound();

  if (session.status === "completed") {
    return <SummaryView summary={await summarizeSession(user, session.id)} />;
  }

  const [test, topic, delayedTopic, checks] = await Promise.all([
    getTest(user.userId, session.testId),
    getTopic(user.userId, session.topicId),
    session.delayedTopicId ? getTopic(user.userId, session.delayedTopicId) : null,
    listSessionChecks(user.userId, session.id),
  ]);
  if (!test || !topic) notFound();

  const submitted = (kind: "session" | "delayed") => checks.some((c) => c.kind === kind && c.status === "submitted");
  const initialPhase = submitted("session")
    ? "confidence"
    : delayedTopic && !submitted("delayed")
      ? "delayed"
      : "study";

  return (
    <SessionRunnerLoader
      sessionId={session.id}
      testLabel={`${test.className}: ${test.name}`}
      topicName={topic.name}
      mode={session.mode}
      plannedMinutes={session.plannedMinutes}
      delayedTopicName={delayedTopic?.name ?? null}
      initialPhase={initialPhase}
    />
  );
}

export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading your session">
          <div className="h-8 w-56 rounded-[3px] bg-rule-faint" />
          <div className="mt-8 h-64 max-w-xl rounded-[3px] bg-rule-faint" />
        </div>
      }
    >
      <Session params={params} />
    </Suspense>
  );
}
