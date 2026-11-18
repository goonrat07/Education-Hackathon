# Study Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live web app where a student adds a test, uploads their materials, gets a deterministic day-by-day study plan, and studies with flashcards and practice problems that are grounded in those materials and gated by checks.

**Architecture:** One Next.js App Router app on Vercel. Postgres (Neon in production, local Postgres in dev/test) holds everything, including uploaded file bytes in chunks, so a single ownership check and a single cascade cover all of a student's data. The plan and the level rules are pure functions in `src/lib`; Claude is called only from `src/server/ai` through one wrapper that enforces the daily cap.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle ORM + `pg`, Better Auth (Google + email/password), `@anthropic-ai/sdk` with structured outputs, zod, KaTeX (+ mhchem), pdf.js (viewer), pdf-lib (page splitting), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-study-coach-spec.md`

## Global Constraints

- Claude is called only through `@anthropic-ai/sdk`, only in server code. `ANTHROPIC_API_KEY` exists only as a server environment variable; no `NEXT_PUBLIC_` variable carries a secret.
- Model names live only in `src/config/ai.ts`, every entry starting as `claude-sonnet-5-5`. The daily AI call limit per student lives in the same file and nowhere else.
- Every database query that reads or writes student data takes `userId` and filters on it. No route trusts an id from the client without that filter.
- The planner (`src/lib/plan.ts`) and level rules (`src/lib/levels.ts`) import nothing but each other and `src/lib/dates.ts`: no clock, no randomness, no I/O. AI writes only the plan's explanation.
- Every study session is saved through `saveSessionRecord` with exactly: user, test, topic, mode, start time, duration, items attempted, items correct, score 0–1, confidence 1–5.
- Every generated card and question stores the passage it came from and a verbatim quote that is verified to appear in that passage. Every generated answer is re-solved by a second call that never sees the first answer; disagreements are discarded before anything is stored.
- A session is one topic, one mode, 10–15 minutes. A check has 3–5 questions never shown to that student before.
- No seeded data, placeholder screens, or stubbed features. If the key or a service is missing, the UI says so.
- Free tier only: Vercel Hobby, Neon Free.

## Review Focus

1. **A second account requesting the first account's ids** (test, file, passage, topic, item, session, check) → 404, never data. Pinned by `tests/integration/isolation.test.ts` (Task 6).
2. **A model answer that cites a passage it didn't come from, or a quote that isn't in the passage** → item is dropped, not stored. Pinned by `tests/unit/grounding.test.ts` (Task 7).
3. **The student's "today" differs from the server's UTC date** (studying at 9pm Pacific) → plan, missed-day detection, and "a day later" use the student's local date. Pinned by `tests/unit/dates.test.ts` (Task 3) and the levels tests (Task 5).
4. **A day with too few minutes for any session, a test that is today, or a test already past** → planner returns a well-formed plan with a stated shortage or status, never throws. Pinned in `tests/unit/plan.test.ts` (Task 4).
5. **A check where the student flags questions as wrong** → flagged questions leave the score; fewer than 3 scored questions means the check cannot raise a level. Pinned in `tests/unit/levels.test.ts` (Task 5).

---

## File Structure

```
src/config/ai.ts                 models, daily limit, effort/token settings (the one AI setting)
src/config/study.ts              session minutes, check size, pass mark, level weights
src/lib/dates.ts                 local-date helpers (pure)
src/lib/levels.ts                level rules, readiness, confidence gaps, delayed-check choice (pure)
src/lib/plan.ts                  planner (pure)
src/lib/grounding.ts             quote-in-passage verification, answer comparison (pure)
src/lib/modes.ts                 mode registry: id, label, topic types (pure)
src/lib/rich-text.ts             split text into plain / math segments (pure)
src/db/schema.ts                 Drizzle schema (auth + app tables)
src/db/index.ts                  getDb() lazy pg pool
src/db/migrations/               SQL migrations (drizzle-kit generate)
scripts/migrate.ts               applies migrations (runs before `next build`)
src/server/auth.ts               Better Auth instance
src/server/session.ts            requireUser(), getUserContext() (id, timezone, today)
src/server/data/*.ts             per-entity data access; every function takes userId
src/server/files/store.ts        chunked file bytes in Postgres
src/server/ai/client.ts          runClaude(): cap check, call, refusal handling, usage log
src/server/ai/prompts.ts         system prompt + task instructions
src/server/ai/schemas.ts         zod output schemas
src/server/ai/extract.ts         file → passages
src/server/ai/topics.ts          passages → topics
src/server/ai/generate.ts        flashcards, practice problems, check sets
src/server/ai/verify.ts          independent re-solve + agreement
src/server/ai/grade.ts           short-answer grading
src/server/ai/explain.ts         plan explanation
src/server/study/*.ts            session lifecycle, checks, progress, plan snapshots
src/app/(auth)/sign-in/          sign-in / sign-up screen
src/app/(app)/                   authenticated screens: dashboard, tests, study, settings
src/app/api/                     route handlers
src/components/                  UI components (source panel, rich text, level chip, readiness bar, modes)
tests/unit/                      pure-logic tests
tests/integration/               database-backed tests (isolation, session record, delete, AI cap)
tests/e2e/                       Playwright proof scripts
samples/                         materials for the proof run
```

## Decisions the spec leaves open

These are fixed here so every task agrees.

**Local dates.** A student's "today" is the calendar date in their IANA timezone, which the browser reports in a `tz` cookie (UTC until it has). Dates are `YYYY-MM-DD` strings everywhere in `src/lib`.

**Modes.** `memorization → flashcards (10 min)`, `application | concept → practice (15 min)`. A session shrinks to the minutes left in a day, never below 10.

**Checks.** Target 4 questions (3–5 allowed). A check is passed when at least 3 questions were scored and `correct / scored ≥ 0.75` (3/3, 3/4, 4/5).

**Levels** (`0 Not started, 1 Learning, 2 Got it, 3 Locked in`). Only a passed check moves a level, one step per pass: `0→1`, `1→2`. `2→3` requires a *delayed* check passed on a local date at least one day after the topic reached Got it. A failed check never changes a level. Nothing else (time spent, confidence, cards flipped) changes a level.

**Missed days.** The last plan shown is stored and refreshed after every session. On a new day, sessions it still lists on earlier days were not done; the student is told how many, once, that day.

**Simultaneous requests.** Starting a session, opening a check, reading a file and writing study material each run once per student and subject (`work_locks`), so a double tap never creates two sessions or spends two sets of AI calls.

**Delayed checks.** A topic is due when it has been studied, is not Locked in, and its last activity (session or check) was on an earlier local date. At session start, the session's own topic is checked if due; otherwise the due topic with the oldest last activity (ties: lower level, then list order). At most one delayed check per session.

**Readiness.** Mean of level weights `[0, 1/3, 2/3, 1]` across the test's topics.

**Confidence gap.** `(confidence − 1) / 4 − latestCheckScore`. The three largest absolute gaps of at least 0.3 are called out (one step on either scale is 0.25, which is not a gap worth naming); positive = overconfident.

**Planner.** Inputs: today, test date, minutes per day, minutes already done today, topics (position, type, confidence, level, latest check score, last studied date, sessions done).
- Study days are today through the day before the test; if the test is today, today is the only study day. Test day is always the plan's last row.
- Weakest first = lower level, then lower strength, then list position. `strength = 0.7·latestCheckScore + 0.3·prior` when a check exists, else `prior`; `prior = (confidence − 1)/4`, unrated counts as 3.
- Pass A (learn): each never-studied topic, weakest first, on the earliest day with room.
- Pass B (final review): each topic not Locked in, weakest first, on the latest day with room after its previous session; if no later day has room, the same day (after everything else) is allowed.
- Pass C (spaced review): each topic at Not started or Learning, weakest first, on the earliest day with room strictly between its previous session and its final review.
- Within a day: learn sessions, then reviews, each weakest first.
- Shortage: `coverage` when a never-studied topic gets no session (lists what won't fit and what to prioritize); `review` when everything is covered but some topic gets no review.
- Two attempts. Attempt 1 uses full-length sessions. If it leaves any shortage, attempt 2 also lets a day shrink its sessions toward 10 minutes (last placed first) to make room for one more. Attempt 2 is used only when it leaves fewer topics uncovered, or the same number uncovered and fewer unreviewed.

**AI call budget.** `AI_DAILY_CALL_LIMIT = 250` per student per local day, counted per request to Anthropic (a session uses 10 to 15). `AI_DAILY_CALL_CEILING = 1500` for all students together per UTC day, because sign-up is open. Checks are not written ahead of time once a student is within `AI_BACKGROUND_RESERVE = 25` calls of their limit.

### Decided in the final review

**Two answers agree only when they are the same.** Numbers agree when they are the same value at the precision written (18.0 and 18.02; whole numbers must be equal). A round number near an exact one, or decimals a hair apart, are "unsure" and go to the judge or grader. Unit symbols keep their capitals.

**A session can always be finished.** A check the server could not write or grade (Claude down, busy or out of requests; nothing usable written; no materials left) marks the session, which may then end without it; no level moves and the screen says so. A delayed check that cannot be opened is skipped and comes back another day.

**Topics without materials.** A topic whose file was removed stays in the list (marked), is left out of the plan, cannot be started and is never picked for a delayed check.

**Thin topics.** A topic with fewer cards or problems than the usual minimum is studied with what it has. More is asked for at most every 12 hours.

**The session record's counts** are reported by the mode when its study step ends and stored on the server then, not kept in the browser until the wrap-up.

**Limits.** Test date at most 366 days ahead. A PDF at most 40 pages, a test at most 80 pages in all, checked before any AI call. An upload piece must be exactly the size the declared length calls for. Uploads stop at 350 MB for everyone together.

**Claude's answers** are read after checking how the message ended (refused, cut off, too long), never with the SDK's `parse()` helper. Each kind of call has a timeout and one retry.

**Database.** Only production builds run migrations, and the database is connected to the Production environment only.

---

### Task 1: Project skeleton

**Files:** Create `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/globals.css`, `scripts/dev-db.sh`.

**Produces:** `npm run dev`, `npm test` (Vitest), `npm run db:generate`, `npm run db:migrate`, `npm run build` (= migrate then `next build`). Local Postgres database `studycoach` and `studycoach_test` on `localhost:5432`.

- [ ] Scaffold Next.js 16 (App Router, TypeScript, Tailwind 4, `src/`), add dependencies from Tech Stack.
- [ ] `scripts/dev-db.sh` starts the local Postgres cluster and creates both databases; `.env.example` lists `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` with empty values.
- [ ] Verify: `npm run build` succeeds; `npm test` runs zero tests without error.
- [ ] Commit.

### Task 2: Schema, migrations, auth

**Files:** Create `src/db/schema.ts`, `src/db/index.ts`, `scripts/migrate.ts`, `src/server/auth.ts`, `src/server/session.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`.

**Produces:**
- Tables: Better Auth (`user`, `session`, `account`, `verification`, `rate_limit`) plus `tests`, `files`, `file_chunks`, `passages`, `topics`, `topic_passages`, `items`, `check_sets`, `study_sessions`, `checks`, `check_answers`, `item_flags`, `ai_usage`, `ai_calls`, `plans`, `work_locks`. Every app table has `user_id` referencing `user.id` with `ON DELETE CASCADE`.
- `getDb(): NodePgDatabase<typeof schema>`
- `requireUser(): Promise<{ userId: string; email: string; timezone: string; today: string }>` — throws `UnauthorizedError` (routes map it to 401).
- Google provider is registered only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; `googleEnabled: boolean` is exported for the sign-in screen.

- [ ] Write schema; `npm run db:generate`; `npm run db:migrate` against the local database.
- [ ] Verify with curl: sign up by email → session cookie → `GET /api/auth/get-session` returns the user; wrong password → 401.
- [ ] Commit.

### Task 3: Dates (TDD)

**Files:** Create `src/lib/dates.ts`, `tests/unit/dates.test.ts`.

**Produces:** `localDate(instant: Date, timeZone: string): string`, `addDays(date: string, n: number): string`, `daysBetween(from: string, to: string): number`, `dateRange(from: string, to: string): string[]` (inclusive), `isValidTimeZone(tz: string): boolean`.

- [ ] Failing tests: `localDate(new Date('2026-11-19T04:30:00Z'), 'America/Los_Angeles') === '2026-11-18'`; `localDate(same, 'UTC') === '2026-11-19'`; `addDays('2026-02-28', 1) === '2026-03-01'`; `addDays('2026-11-01', 1) === '2026-11-02'` (DST day); `daysBetween('2026-11-18', '2026-11-21') === 3`; `daysBetween('2026-11-21', '2026-11-18') === -3`; `dateRange('2026-11-18','2026-11-20')` has 3 entries; `dateRange('2026-11-20','2026-11-18')` is empty; `isValidTimeZone('Mars/Olympus') === false`.
- [ ] Run, see them fail, implement, see them pass, commit.

### Task 4: Planner (TDD)

**Files:** Create `src/config/study.ts`, `src/lib/modes.ts`, `src/lib/plan.ts`, `tests/unit/plan.test.ts`.

**Consumes:** `src/lib/dates.ts`, `Level` from Task 5's `src/lib/levels.ts` type (define the type in `src/config/study.ts` so neither task blocks the other).

**Produces:**
```ts
type TopicType = 'memorization' | 'application' | 'concept'
type ModeId = 'flashcards' | 'practice'
type Level = 0 | 1 | 2 | 3
interface PlanTopic { id: string; position: number; type: TopicType; confidence: number | null; level: Level;
  latestCheckScore: number | null; lastStudiedOn: string | null; sessionsDone: number }
interface PlanInput { today: string; testDate: string; minutesPerDay: number; minutesDoneToday: number; topics: PlanTopic[] }
interface PlannedSession { topicId: string; mode: ModeId; minutes: number; kind: 'learn' | 'review' }
interface PlanDay { date: string; isTestDay: boolean; minutesAvailable: number; minutesPlanned: number; sessions: PlannedSession[] }
interface Shortage { kind: 'coverage' | 'review'; uncovered: string[]; unreviewed: string[]; prioritized: string[];
  minutesAvailable: number; minutesWanted: number }
interface Plan { status: 'active' | 'complete' | 'past' | 'empty'; days: PlanDay[]; shortage: Shortage | null }
function buildPlan(input: PlanInput): Plan
function weakestFirst(topics: PlanTopic[]): PlanTopic[]
function planHash(plan: Plan): string
```

Tests (each written and seen failing before its code), using `today = '2026-11-18'`:

- [ ] **modes and minutes:** memorization → `flashcards`, 10; application and concept → `practice`, 15; every session's minutes are within 10–15.
- [ ] **worked example (full length leaves D and C unreviewed, so sessions shrink):** test `2026-11-21`, 30 min/day, topics A (memorization, confidence 2), B (application, 1), C (concept, 4), D (memorization, 3), all level 0, never studied → day 18 = `[B learn 10, A learn 10, D learn 10]`, day 19 = `[C learn 10, B review 10, C review 10]`, day 20 = `[B review 10, A review 10, D review 10]`, day 21 = test day with no sessions; shortage `null`.
- [ ] **full length when it fits:** same topics, 50 min/day, test `2026-11-25` → no shortage and both practice topics keep 15-minute sessions.
- [ ] **weakest first:** lower level beats lower confidence; a check score outweighs confidence within a level; ties fall back to position.
- [ ] **daily cap:** `minutesPlanned ≤ minutesAvailable` on every day; with `minutesDoneToday = 15` today's `minutesAvailable` is `minutesPerDay − 15`.
- [ ] **shrink to fit:** 25 min/day with two practice topics → `[15, 10]` on one day.
- [ ] **review comes back later:** with spare days, every topic's review is on a later date than its learn session and the weakest topic's final review is on the last study day.
- [ ] **spaced review:** 6 study days, one topic, 30 min → sessions on day 1 (learn), day 2 (review), last study day (review).
- [ ] **night before:** test tomorrow, 60 min, the four topics above → today = `[B learn 10, A learn 10, D learn 10, C learn 10, B review 10, A review 10]`; shortage `review` with `unreviewed = [D, C]`.
- [ ] **coverage shortage:** test tomorrow, 20 min, four topics → two sessions; shortage kind `coverage`, `uncovered` holds the two strongest, `prioritized` the two weakest.
- [ ] **test today:** study day is today; plan has one day flagged `isTestDay` that contains sessions.
- [ ] **test past:** `status: 'past'`, no days.
- [ ] **no topics:** `status: 'empty'`. **All locked in:** `status: 'complete'`, no sessions.
- [ ] **levels shape the plan:** a Got it topic gets exactly one review; a Locked in topic gets none; a studied Learning topic gets no learn session.
- [ ] **missed day:** the same state planned with `today` one day later contains no earlier dates and still schedules the unstudied topics.
- [ ] **too few minutes:** `minutesPerDay = 5` → no sessions, shortage `coverage`, no throw.
- [ ] **determinism:** shuffling the input array (positions intact) gives a deep-equal plan and equal `planHash`; calling twice gives equal output.
- [ ] Commit after the suite is green.

### Task 5: Level rules (TDD)

**Files:** Create `src/lib/levels.ts`, `tests/unit/levels.test.ts`.

**Produces:**
```ts
const LEVEL_NAMES = ['Not started', 'Learning', 'Got it', 'Locked in'] as const
function checkPassed(correct: number, scored: number): boolean
function nextLevel(level: Level, levelSince: string | null,
  check: { kind: 'session' | 'delayed'; passed: boolean; takenOn: string }): Level
function readiness(levels: Level[]): number
function confidenceGap(confidence: number | null, latest: { correct: number; scored: number } | null): number | null
function biggestGaps<T extends { confidence: number | null; latest: { correct: number; scored: number } | null }>(rows: T[]): Array<T & { gap: number }>
function dueForDelayedCheck(t: { level: Level; lastStudiedOn: string | null; lastActivityOn: string | null }, today: string): boolean
function pickDelayedCheckTopic(topics: Array<{ id: string; position: number; level: Level; lastStudiedOn: string | null; lastActivityOn: string | null }>, today: string, sessionTopicId: string): string | null
```

Tests:

- [ ] **pass mark:** 3/3, 3/4, 4/5 pass; 2/3, 2/4, 3/5 fail; 2/2 fails (fewer than 3 scored); 0/0 fails.
- [ ] **one step per pass:** 0→1, 1→2 for both check kinds.
- [ ] **failed checks never move a level** at any level, either kind.
- [ ] **Locked in needs a delayed check a day later:** level 2 since `2026-11-18`: session check passed on the 19th → 2; delayed passed on the 18th → 2; delayed passed on the 19th → 3; `levelSince` null → 2.
- [ ] **Locked in stays** after any check.
- [ ] **readiness:** `[]` → 0; `[0,0]` → 0; `[3,3]` → 1; `[1,2]` → 0.5; `[0,1,2,3]` → 0.5.
- [ ] **gaps:** confidence 5 with 1/4 → +0.75; confidence 1 with 4/4 → −1; missing confidence or check → null; `biggestGaps` returns at most 3, largest absolute first, none below 0.25.
- [ ] **delayed due:** never studied → false; studied today → false; studied yesterday → true; Locked in → false; studied two days ago but checked today → false.
- [ ] **delayed pick:** session's own topic when due; otherwise oldest last activity; ties by lower level then position; none due → null.
- [ ] Commit after green.

### Task 6: Data layer and ownership

**Files:** Create `src/server/data/{tests,files,passages,topics,items,sessions,checks,plans,usage,account}.ts`, `src/server/files/store.ts`, `tests/integration/setup.ts`, `tests/integration/isolation.test.ts`, `tests/integration/session-record.test.ts`, `tests/integration/delete-account.test.ts`.

**Produces (signatures later tasks rely on):**
```ts
interface SessionRecord { userId: string; testId: string; topicId: string; mode: ModeId; startedAt: Date;
  durationSeconds: number; itemsAttempted: number; itemsCorrect: number; score: number; confidence: number }
saveSessionRecord(sessionId: string, record: SessionRecord): Promise<void>   // validates score 0–1, confidence 1–5
getTest(userId, testId): Promise<Test | null>            // null when not owned
getFileBytes(userId, fileId): Promise<Buffer | null>
deleteAccount(userId): Promise<void>
```
Every exported read returns `null`/`[]` for another user's ids.

- [ ] Failing integration tests first: user B gets `null`/empty for user A's test, file bytes, passage, topic, item, session, check, plan; `saveSessionRecord` rejects score 1.2 and confidence 0 and stores all ten fields; `deleteAccount` leaves zero rows for that user in every table and leaves the other user's rows intact.
- [ ] Implement, green, commit.

### Task 7: AI pipeline

**Files:** Create `src/config/ai.ts`, `src/lib/grounding.ts`, `src/server/ai/{client,prompts,schemas,extract,topics,generate,verify,grade,explain}.ts`, `tests/unit/grounding.test.ts`, `tests/integration/ai-cap.test.ts`.

**Produces:**
```ts
// src/config/ai.ts
AI_MODELS = { extract, topics, generate, solve, judge, grade, explain }  // all 'claude-sonnet-5-5'
AI_DAILY_CALL_LIMIT = 120
// src/server/ai/client.ts
runClaude<T>(opts: { userId; today; task: keyof typeof AI_MODELS; content; schema: ZodType<T>; effort; maxTokens }): Promise<T>
class AiLimitError, AiRefusalError, AiUnavailableError
// src/lib/grounding.ts
quoteInPassage(quote: string, passageText: string): boolean      // case/whitespace/punctuation-insensitive substring
answersAgree(a: string, b: string): 'yes' | 'no' | 'unsure'      // numeric/units/normalized text; 'unsure' → judge call
```

- [ ] `grounding.test.ts` first: quote matches across line breaks and smart quotes; a quote with a changed number does not match; `answersAgree('0.50 mol', '0.5 mol') === 'yes'`; `('12 g', '21 g') === 'no'`; `('the mitochondria', 'Mitochondria') === 'yes'`; two different sentences → `'unsure'`.
- [ ] `ai-cap.test.ts` first: with usage at the limit `reserveAiCall` throws `AiLimitError` and the count does not rise; under the limit it rises by exactly one; another user is unaffected; a new local date starts at zero.
- [ ] Extraction: PDFs over 6 pages are split with pdf-lib into 6-page parts processed 4 at a time; images go in one call; output is pages → passages (`kind`, `text`), stored with file and page.
- [ ] Topics: passages in, topics out with passage references; references that don't exist are dropped; a topic with none is dropped.
- [ ] Generation + verification: generate → drop ungrounded quotes → second call solves blind → `answersAgree` → judge call for `'unsure'` → store only agreed items.
- [ ] Verify against the real API with `samples/` once the key exists: extraction returns passages for a typed PDF and a handwriting photo; a mismatching answer injected by hand is rejected.
- [ ] Commit.

### Task 8: Routes and study flow

**Files:** Create `src/server/study/{sessions,checks,progress,plans}.ts`, `src/app/api/**/route.ts` (tests, files + chunks + extract + content, topics + merge + generate, plan + explanation, sessions, checks, items answer/progress/flag, settings, account), `tests/integration/study-flow.test.ts`.

**Consumes:** Tasks 4–7.

- [ ] `study-flow.test.ts` first (AI calls replaced by inserting items directly): starting a session creates an active row; submitting a passed check moves the level per `nextLevel` and records `level_before/after`; a flagged question is excluded from the score; `saveSessionRecord` completes the session; the plan read afterwards reflects the new minutes and level; a stored plan with unfinished sessions on a past date reports them as missed.
- [ ] Implement routes; uploads are 2 MB chunks (`PUT /api/files/:id/chunks/:n`), PDFs ≤ 20 MB, images ≤ 8 MB, at most 10 files per test.
- [ ] Check questions and practice problems are sent without answers; answers return only with a graded response.
- [ ] Commit.

### Task 9: Screens

**Files:** Create under `src/app/(auth)`, `src/app/(app)`, `src/components`. Use the frontend-design skill for every screen.

- [ ] Sign-in; dashboard (today's plan, start-next-session button, tests with countdown and readiness bar); add test → materials → topics (rename, merge, delete, add, confidence) → plan; test page (plan, explanation, shortage, missed-day note, topics with level, confidence beside latest check, biggest gaps); session runner (delayed check → mode → check → confidence → what moved); source panel (page image or PDF page beside the highlighted passage); settings with delete-my-data.
- [ ] `RichText` renders `$…$`, `$$…$$` and `\ce{…}` with KaTeX; unit test for the segment splitter.
- [ ] Every card, question and answer shows a source link and a "This is wrong" button. In a check, the source link appears once the check is handed in; before that it would give the answers away.
- [ ] Verify each screen in a browser at 390 px and 1366 px. Commit per screen group.

### Task 10: Samples, local proof

- [ ] If `samples/` is still absent, create a typed teacher PDF and a handwritten-notes image for one unit and record in `samples/README.md` that they were made for this run.
- [ ] Playwright script `tests/e2e/proof.spec.ts`: sign up → add test → upload samples → topics → plan (timed) → one flashcards session → one practice session → source link → second account sees nothing.
- [ ] `npm test` all green.

### Task 11: Deploy and prove on the public URL

- [ ] Neon via Vercel Marketplace; `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` set with the CLI; `ANTHROPIC_API_KEY` and Google credentials set by the owner.
- [ ] `vercel deploy --prod`; migrations run in the build.
- [ ] Run the proof script against the public URL; capture screenshots and timings.
- [ ] Commit and push the branch.
