import Link from "next/link";
import { Suspense } from "react";
import { ReadinessLine } from "@/components/readiness-line";
import { StartSessionButton } from "@/components/start-session-button";
import { countdown, longDate, plural } from "@/lib/format";
import { MODES, isModeId } from "@/lib/modes";
import { pageUser } from "@/server/page-user";
import { getDashboard, type Dashboard, type TestCard } from "@/server/study/dashboard";

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your plan">
      <div className="h-9 w-40 rounded-[3px] bg-rule-faint" />
      <div className="mt-6 h-40 rounded-[3px] bg-rule-faint" />
      <div className="mt-10 h-7 w-32 rounded-[3px] bg-rule-faint" />
      <div className="mt-4 h-24 rounded-[3px] bg-rule-faint" />
    </div>
  );
}

function modeLabel(mode: string): string {
  return isModeId(mode) ? MODES[mode].label : mode;
}

function Today({ data }: { data: Dashboard }) {
  const [next, ...later] = data.today;
  const readyTests = data.tests.filter((t) => t.ready && t.daysLeft >= 0);
  const unfinished = data.tests.find((t) => !t.ready && t.daysLeft >= 0);

  if (data.tests.length === 0) {
    return (
      <div className="mt-5 max-w-xl">
        <p className="text-lg text-ink-soft">
          Add a test to get started. You&rsquo;ll upload your notes, pick how many minutes a day you have, and get
          a plan through test day.
        </p>
        <Link href="/tests/new" className="btn btn-ink btn-lg mt-6">
          Add your first test
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5">
      {data.missedSessions > 0 && (
        <p className="mb-5 max-w-2xl rounded-[3px] bg-hi-yellow/40 px-4 py-3">
          You missed {plural(data.missedSessions, "planned session")} earlier. The plan has been rebuilt around the
          days you have left.
        </p>
      )}

      {next ? (
        <div className="max-w-2xl bg-ink px-5 py-6 text-paper sm:px-7 sm:py-7 rounded-[3px]">
          <p className="text-sm opacity-80">
            Next session, {next.kind === "learn" ? "new topic" : "review"} for {next.testLabel}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">{next.topicName}</p>
          <p className="mt-2 opacity-90">
            {MODES[next.mode].label}, about {next.minutes} minutes
          </p>
          <div className="mt-5">
            <StartSessionButton
              testId={next.testId}
              topicId={next.topicId}
              className="btn btn-lg border-paper bg-paper text-ink hover:bg-hi-yellow"
            >
              Start session
            </StartSessionButton>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl">
          {data.doneToday.length > 0 ? (
            <p className="text-lg">
              That&rsquo;s today&rsquo;s plan done: {plural(data.doneToday.length, "session")} finished. See you
              tomorrow.
            </p>
          ) : readyTests.length > 0 ? (
            <p className="text-lg text-ink-soft">Nothing is planned for today.</p>
          ) : unfinished ? (
            <p className="text-lg text-ink-soft">
              Finish setting up{" "}
              <Link href={`/tests/${unfinished.test.id}/setup`} className="link">
                {unfinished.test.name}
              </Link>{" "}
              to get today&rsquo;s plan.
            </p>
          ) : (
            <p className="text-lg text-ink-soft">No upcoming tests. Add one to get a plan.</p>
          )}
        </div>
      )}

      {(later.length > 0 || data.doneToday.length > 0) && (
        <ul className="mt-5 max-w-2xl">
          {data.doneToday.map((s, i) => (
            <li key={`done-${i}`} className="flex items-baseline gap-3 py-2.5 ruled-bottom text-pencil">
              <span aria-hidden="true" className="w-12 shrink-0 text-sm font-semibold text-pass">
                Done
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-through decoration-rule">{s.topicName}</span>
                <span className="sr-only"> (done)</span>
              </span>
              <span className="shrink-0 text-sm">{modeLabel(s.mode)}</span>
            </li>
          ))}
          {later.map((s, i) => (
            <li key={`later-${i}`} className="flex items-baseline gap-3 py-2.5 ruled-bottom">
              <span className="w-12 shrink-0 text-sm text-pencil">{i === 0 ? "Then" : ""}</span>
              <span className="min-w-0 flex-1 font-semibold">{s.topicName}</span>
              <span className="shrink-0 text-sm text-pencil">
                {MODES[s.mode].label}, {s.minutes} min
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TestRow({ card }: { card: TestCard }) {
  const { number, unit } = countdown(card.daysLeft);
  const href = card.ready ? `/tests/${card.test.id}` : `/tests/${card.test.id}/setup`;
  return (
    <li className="ruled-bottom">
      <Link href={href} className="flex gap-4 py-4 no-underline hover:bg-rule-faint/60 sm:gap-6">
        <div className="w-16 shrink-0 text-center sm:w-20">
          <p className="font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl">{number}</p>
          {unit && <p className="mt-1 text-sm text-pencil">{unit}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-pencil">{card.test.className}</p>
          <p className="font-display text-lg font-semibold leading-snug">{card.test.name}</p>
          <div className="mt-2.5">
            {card.ready ? (
              <ReadinessLine levels={card.levels} size="sm" />
            ) : (
              <p className="text-sm">
                <span className="link">Finish setting up</span>
              </p>
            )}
          </div>
          {card.ready && card.shortage === "coverage" && card.daysLeft >= 0 && (
            <p className="mt-2 text-sm text-redpen">Not enough time to cover every topic.</p>
          )}
        </div>
      </Link>
    </li>
  );
}

async function DashboardContent() {
  const user = await pageUser();
  const data = await getDashboard(user);
  const upcoming = data.tests.filter((t) => t.daysLeft >= 0);
  const past = data.tests.filter((t) => t.daysLeft < 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
      <section aria-labelledby="today-heading">
        <p className="text-sm text-pencil">{longDate(user.today)}</p>
        <h1 id="today-heading" className="mt-1 text-3xl">
          Today&rsquo;s plan
        </h1>
        <Today data={data} />
      </section>

      {data.tests.length > 0 && (
        <section aria-labelledby="tests-heading">
          <div className="flex items-baseline justify-between ruled-bottom pb-2">
            <h2 id="tests-heading" className="text-xl">
              Your tests
            </h2>
            <Link href="/tests/new" className="link text-sm">
              Add a test
            </Link>
          </div>
          <ul>
            {upcoming.map((card) => (
              <TestRow key={card.test.id} card={card} />
            ))}
          </ul>
          {past.length > 0 && (
            <>
              <h3 className="mt-8 text-base text-pencil">Past tests</h3>
              <ul className="opacity-70">
                {past.map((card) => (
                  <TestRow key={card.test.id} card={card} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardContent />
    </Suspense>
  );
}
