import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LevelMark, LevelName } from "@/components/level-mark";
import { ReadinessLine } from "@/components/readiness-line";
import { StartSessionButton } from "@/components/start-session-button";
import { daysBetween } from "@/lib/dates";
import { countdown, longDate, plural, shortDate, weekday } from "@/lib/format";
import { MODES } from "@/lib/modes";
import type { Plan } from "@/lib/plan";
import { listFiles } from "@/server/data/files";
import { pageUser } from "@/server/page-user";
import { getPlanView } from "@/server/study/plans";
import { progressOf, type ProgressRow } from "@/server/study/sessions";
import type { TopicState } from "@/server/study/state";
import { PlanExplanation } from "./plan-explanation";
import { TestSettings } from "./test-settings";

export const metadata: Metadata = { title: "Your plan" };

const UUID = /^[0-9a-f-]{36}$/i;

function names(ids: string[], topics: Map<string, TopicState>): string {
  const list = ids.map((id) => topics.get(id)?.name ?? "").filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

function ShortageNote({ plan, topics }: { plan: Plan; topics: Map<string, TopicState> }) {
  const shortage = plan.shortage;
  if (!shortage) return null;
  return (
    <div className="max-w-[68ch] rounded-[3px] border-l-4 border-redpen bg-redpen-wash px-4 py-3" role="note">
      {shortage.kind === "coverage" ? (
        <>
          <p className="font-semibold">There isn&rsquo;t enough time to cover everything.</p>
          <p className="mt-1">
            You have {shortage.minutesAvailable} minutes before the test. A first session and one review of every
            topic would take about {shortage.minutesWanted}.
          </p>
          {shortage.prioritized.length > 0 && (
            <p className="mt-2">
              Put your time into {names(shortage.prioritized, topics)}: these are your weakest topics, so they are
              the ones in the plan.
            </p>
          )}
          <p className="mt-2">Left out: {names(shortage.uncovered, topics)}.</p>
        </>
      ) : (
        <>
          <p className="font-semibold">There&rsquo;s time to cover every topic, but not to review them all.</p>
          <p className="mt-1">
            The plan reviews your weakest topics first. No review fits for {names(shortage.unreviewed, topics)}.
          </p>
        </>
      )}
      <p className="mt-2 text-sm">Adding minutes per day below will rebuild the plan.</p>
    </div>
  );
}

function PlanPage({
  plan,
  today,
  testId,
  topics,
}: {
  plan: Plan;
  today: string;
  testId: string;
  topics: Map<string, TopicState>;
}) {
  return (
    <ol className="ruled-top">
      {plan.days.map((day) => {
        const isToday = day.date === today;
        return (
          <li key={day.date} className="flex ruled-bottom">
            <div className="w-[4.5rem] shrink-0 py-3 pr-3 text-right sm:w-24">
              <p className="font-semibold leading-tight">{isToday ? "Today" : weekday(day.date)}</p>
              <p className="text-sm text-pencil">{shortDate(day.date)}</p>
            </div>
            <div className="margin-line min-w-0 flex-1 py-3 pl-3 sm:pl-5">
              {day.sessions.length === 0 ? (
                day.isTestDay ? (
                  <p className="font-display text-lg font-semibold">Test day</p>
                ) : (
                  <p className="text-pencil">Nothing planned</p>
                )
              ) : (
                <ul className="space-y-2.5">
                  {day.isTestDay && <li className="font-display text-lg font-semibold">Test day</li>}
                  {day.sessions.map((session, i) => {
                    const topic = topics.get(session.topicId);
                    return (
                      <li key={`${session.topicId}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="min-w-0 flex-1 basis-40 font-semibold">
                          <LevelMark level={topic?.level ?? 0}>{topic?.name}</LevelMark>
                        </span>
                        <span className="text-sm text-pencil">
                          {session.kind === "learn" ? "New" : "Review"}, {MODES[session.mode].label.toLowerCase()},{" "}
                          {session.minutes} min
                        </span>
                        {isToday && (
                          <span className="basis-full sm:basis-auto">
                            <StartSessionButton
                              testId={testId}
                              topicId={session.topicId}
                              className={`btn btn-sm ${i === 0 ? "btn-ink" : "btn-paper"}`}
                            >
                              Start
                            </StartSessionButton>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function gapSentence(row: ProgressRow): string {
  const check = `${row.latestCheck!.correct} of ${row.latestCheck!.scored}`;
  return (row.gap ?? 0) > 0
    ? `You rated ${row.name} ${row.confidence} out of 5, but your last check was ${check}. Give it more time than it feels like it needs.`
    : `You rated ${row.name} only ${row.confidence} out of 5, but your last check was ${check}. You know this better than you think.`;
}

async function TestContent({ params }: { params: Promise<{ testId: string }> }) {
  const user = await pageUser();
  const { testId } = await params;
  const view = UUID.test(testId) ? await getPlanView(user.userId, testId, user.today) : null;
  if (!view) notFound();
  const { test } = view.state;
  if (!test.planReadyAt) redirect(`/tests/${test.id}/setup`);

  const files = await listFiles(user.userId, test.id);
  const topics = new Map(view.state.topics.map((t) => [t.id, t]));
  const progress = progressOf(view.state);
  const daysLeft = daysBetween(user.today, test.testDate);
  const { number, unit } = countdown(daysLeft);
  const { plan } = view;

  return (
    <div className="space-y-10">
      <header>
        <Link href="/" className="link link-quiet text-sm">
          Back to today
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p className="text-sm text-pencil">{test.className}</p>
            <h1 className="text-3xl">{test.name}</h1>
          </div>
          <p className="text-right">
            <span className="font-display text-3xl font-bold tabular-nums">{number}</span>
            {unit && <span className="ml-1.5 text-pencil">{unit} to go</span>}
            <span className="block text-sm text-pencil">{longDate(test.testDate)}</span>
          </p>
        </div>
        <div className="mt-5 max-w-2xl">
          <ReadinessLine levels={view.state.topics.map((t) => t.level)} />
        </div>
      </header>

      {view.missed && (
        <p className="max-w-[68ch] rounded-[3px] bg-hi-yellow/40 px-4 py-3">
          You missed {plural(view.missed.sessions, "planned session")} earlier, so the plan has been rebuilt around
          the days you have left.
        </p>
      )}

      {plan.status === "past" ? (
        <p className="text-lg">This test&rsquo;s date has passed, so there is no plan.</p>
      ) : (
        <>
          <ShortageNote plan={plan} topics={topics} />

          <section aria-labelledby="why-heading">
            <h2 id="why-heading" className="text-xl">
              Why the plan looks like this
            </h2>
            <div className="mt-2">
              <PlanExplanation key={view.hash} testId={test.id} initial={view.explanation} />
            </div>
          </section>

          <section aria-labelledby="plan-heading">
            <h2 id="plan-heading" className="text-xl">
              Day by day
            </h2>
            {plan.status === "complete" && (
              <p className="mt-2 text-pass">Every topic is locked in. Nothing left to schedule.</p>
            )}
            <div className="mt-3 max-w-3xl">
              <PlanPage plan={plan} today={user.today} testId={test.id} topics={topics} />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="text-xl">
          Topics
        </h2>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <LevelName level={0} />
          <LevelName level={1} />
          <LevelName level={2} />
          <LevelName level={3} />
        </p>

        {progress.gaps.length > 0 && (
          <ul className="mt-4 max-w-[68ch] space-y-2" aria-label="Biggest gaps between confidence and checks">
            {progress.gaps.map((row) => (
              <li
                key={row.topicId}
                className={`rounded-[3px] border-l-4 px-4 py-2.5 ${
                  (row.gap ?? 0) > 0 ? "border-redpen bg-redpen-wash" : "border-pass bg-pass-wash"
                }`}
              >
                {gapSentence(row)}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="text-sm text-pencil ruled-bottom">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Topic
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Level
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Your confidence
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Latest check
                </th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">Study</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {progress.rows.map((row) => (
                <tr key={row.topicId} className="ruled-bottom align-baseline">
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    <LevelMark level={row.level}>{row.name}</LevelMark>
                  </th>
                  <td className="py-3 pr-4 text-sm">{["Not started", "Learning", "Got it", "Locked in"][row.level]}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.confidence ? `${row.confidence} of 5` : "Not rated"}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {row.latestCheck ? `${row.latestCheck.correct} of ${row.latestCheck.scored}` : "None yet"}
                  </td>
                  <td className="py-3 text-right">
                    {plan.status !== "past" && (
                      <StartSessionButton testId={test.id} topicId={row.topicId} className="link text-sm">
                        Study now
                      </StartSessionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm">
          <Link href={`/tests/${test.id}/setup`} className="link">
            Edit topics and materials
          </Link>
          <span className="text-pencil"> ({plural(files.length, "file")})</span>
        </p>
      </section>

      <section aria-labelledby="settings-heading" className="ruled-top pt-6">
        <h2 id="settings-heading" className="text-xl">
          Change this test
        </h2>
        <div className="mt-4">
          <TestSettings
            test={{
              id: test.id,
              className: test.className,
              name: test.name,
              testDate: test.testDate,
              minutesPerDay: test.minutesPerDay,
            }}
            today={user.today}
          />
        </div>
      </section>
    </div>
  );
}

export default function TestPage({ params }: { params: Promise<{ testId: string }> }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Loading your plan">
          <div className="h-9 w-64 rounded-[3px] bg-rule-faint" />
          <div className="mt-6 h-4 max-w-2xl rounded-[3px] bg-rule-faint" />
          <div className="mt-10 h-64 max-w-3xl rounded-[3px] bg-rule-faint" />
        </div>
      }
    >
      <TestContent params={params} />
    </Suspense>
  );
}
