import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Level } from "@/config/study";
import { listFiles } from "@/server/data/files";
import { listPassages } from "@/server/data/passages";
import { listCompletedSessions } from "@/server/data/sessions";
import { getTest } from "@/server/data/tests";
import { listTopics } from "@/server/data/topics";
import { pageUser } from "@/server/page-user";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = { title: "Set up your test" };

const UUID = /^[0-9a-f-]{36}$/i;

async function Setup({ params }: { params: Promise<{ testId: string }> }) {
  const user = await pageUser();
  const { testId } = await params;
  const test = UUID.test(testId) ? await getTest(user.userId, testId) : null;
  if (!test) notFound();

  const [files, topics, passages, sessions] = await Promise.all([
    listFiles(user.userId, test.id),
    listTopics(user.userId, test.id),
    listPassages(user.userId, test.id),
    listCompletedSessions(user.userId, test.id),
  ]);

  return (
    <div>
      <Link href={test.planReadyAt ? `/tests/${test.id}` : "/"} className="link link-quiet text-sm">
        {test.planReadyAt ? "Back to the plan" : "Back to today"}
      </Link>
      <p className="mt-3 text-sm text-pencil">{test.className}</p>
      <h1 className="text-3xl">{test.name}</h1>
      <div className="mt-8">
        <SetupFlow
          test={{
            id: test.id,
            className: test.className,
            name: test.name,
            testDate: test.testDate,
            minutesPerDay: test.minutesPerDay,
          }}
          initialFiles={files.map((f) => ({
            id: f.id,
            name: f.name,
            mime: f.mime,
            source: f.source,
            status: f.status,
            error: f.error,
            pageCount: f.pageCount,
            sizeBytes: f.sizeBytes,
          }))}
          initialTopics={topics.map((t) => ({
            id: t.id,
            name: t.name,
            summary: t.summary,
            type: t.type,
            confidence: t.confidence,
            level: t.level as Level,
            passageIds: t.passageIds,
          }))}
          initialPassages={passages.map((p) => ({ id: p.id, fileId: p.fileId, fileName: p.fileName, page: p.page }))}
          hasPlan={Boolean(test.planReadyAt)}
          topicsLocked={sessions.length > 0}
        />
      </div>
    </div>
  );
}

export default function SetupPage({ params }: { params: Promise<{ testId: string }> }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading your test">
          <div className="h-9 w-64 rounded-[3px] bg-rule-faint" />
          <div className="mt-8 h-40 rounded-[3px] bg-rule-faint" />
        </div>
      }
    >
      <Setup params={params} />
    </Suspense>
  );
}
