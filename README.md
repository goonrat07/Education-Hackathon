# Study Coach

A web app for middle and high school students. Add a test, upload your notes and
your teacher's handouts, and get a day-by-day study plan with flashcards and
practice problems made only from what you uploaded.

Live at **https://study-coach-edu.vercel.app**

## How it works

1. **Add a test**: class, name, date, and the minutes you have per day.
2. **Upload materials**: PDFs and photos, each tagged as teacher material or your
   own notes. Claude reads them into passages, including handwriting and diagrams.
3. **Check the topics**: rename, merge, delete or add topics, and rate your
   confidence in each from 1 to 5.
4. **Follow the plan**: one topic and one mode per 10 to 15 minute session.
   Memorization topics get flashcards; application and concept topics get
   practice problems.
5. **Pass checks**: every session ends with a short check of new questions.

### Levels

Each topic is at one of four levels: Not started, Learning, Got it, Locked in.

- A topic moves up one level each time a check is passed (3 of 3, 3 of 4, or 4 of 5).
- The last step, to Locked in, takes a *delayed* check passed on a later day.
  A topic studied on an earlier day gets its delayed check at the start of a
  later session.
- A failed check never changes a level. Neither does time spent or confidence.

A test's readiness bar is the average of its topics' levels
(0, 1/3, 2/3 and 1).

### The plan

The plan is worked out by fixed rules in `src/lib/plan.ts`, so the same inputs
always give the same plan. Claude only writes the short explanation of it.

- New topics first, weakest first (lowest level, then latest check result and
  your confidence rating).
- Every topic comes back for a final review as close to the test as there is
  room, and weaker topics get an extra early review.
- If full-length sessions don't all fit, sessions shrink to 10 minutes to fit
  more in. If there still isn't enough time, the plan says so and shows what it
  prioritized.
- The plan is rebuilt every time it is shown, so it is already up to date after
  a session, after a missed day, or after you change the date or minutes.

### Where the content comes from

- Every card, question and answer is tied to one passage of your files and
  carries a word-for-word quote from it. Anything whose quote is not actually
  in that passage is thrown away before it is stored.
- Every generated answer is solved a second time by a separate request that
  never sees the first answer. If the two disagree, the item is discarded.

## Settings you can change in one place

| What | Where |
| --- | --- |
| Which Claude model does each job; daily AI limit per student | `src/config/ai.ts` |
| Session lengths, check size, pass mark, level weights | `src/config/study.ts` |
| File size and count limits, per-student storage ceilings | `src/config/uploads.ts` |

## Run it on your own computer

You need Node 22 and PostgreSQL.

```bash
npm install
```

```bash
npm run db:start
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`: a `BETTER_AUTH_SECRET` (any long random string) and your
`ANTHROPIC_API_KEY`. Then:

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open http://localhost:3000. The files in `samples/` are there to try it with.

## Tests

```bash
npm test
```

Unit tests cover the plan logic, the level rules, dates, quote checking, answer
comparison and math splitting. Integration tests run against a local Postgres
database (`studycoach_test`) and cover account isolation, the session record,
checks and levels, missed days, the daily AI limit and deleting an account.

## Hosting

The app runs on Vercel's free plan with a free Neon Postgres database.
Database changes in `src/db/migrations` are applied automatically during each
build.

Environment variables on Vercel:

| Name | What it is |
| --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Set by the Neon integration. |
| `ANTHROPIC_API_KEY` | Your Claude API key. Server only. |
| `BETTER_AUTH_SECRET` | Random string that signs sign-in cookies. |
| `BETTER_AUTH_URL` | The site's address, `https://study-coach-edu.vercel.app`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turns on "Continue with Google". |

### Turning on Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create a project, set up the OAuth consent screen (External), and create an
   **OAuth client ID** of type **Web application**.
2. Add this authorized redirect URI:
   `https://study-coach-edu.vercel.app/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` for local use).
3. Add the client ID and secret to the Vercel project as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then redeploy.

The Google button appears on the sign-in screen once both are set. School
Google accounts may block apps their administrator has not approved; email
sign-in always works.

## Adding a study mode

Every mode goes through the same session shell, which handles timing, the
checks, the confidence rating and saving the session record (`saveSessionRecord`
in `src/server/data/sessions.ts`). A new mode needs three things:

1. An entry in `MODES` in `src/lib/modes.ts`.
2. A component in `src/components/modes/` that takes `ModeProps` and calls
   `onFinish({ itemsAttempted, itemsCorrect })` when the student is done.
3. A line for it in `src/components/modes/index.ts`.

## Where things are

```
src/config/        settings (AI, study rules, upload limits)
src/lib/           pure logic: plan, levels, dates, grounding checks
src/db/            database schema and migrations
src/server/ai/     everything that calls Claude
src/server/data/   database access; every function takes the user's id
src/server/study/  sessions, checks, plans, progress
src/app/           screens and API routes
src/components/    shared UI
tests/             unit and integration tests
samples/           files to try the app with
```
