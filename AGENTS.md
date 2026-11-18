<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Study Coach: rules for changing this codebase

Read `README.md` first for what the app does and where things live.

- **Run before you say it works:** `npm test` (needs `npm run db:start`), `npx tsc --noEmit`, `npx eslint src tests scripts`, and `npx next build`.
- **One owner check everywhere.** Every function in `src/server/data/` takes `userId` and filters on it. Routes call `requireUser()` first and return 404 for anything the caller does not own. New tables get a `user_id` column that references `user.id` with `ON DELETE CASCADE`, and are added to `OWNED_TABLES` in `tests/support/db.ts`. The two exceptions are app-wide totals that return one number and no student's data: `getAiUsageTotal` (table `ai_usage_total`) and `storedBytesForEveryone`.
- **Claude is called in one place.** `runClaude` in `src/server/ai/client.ts` counts the call against the student's daily limit and the app-wide ceiling before making it. Never construct an Anthropic client anywhere else, and never import `src/server/**` from a client component. Answers are read with `readAnswer`, which looks at how the message ended first; do not switch to the SDK's `parse()` helper.
- **Model names, limits and timeouts for AI** live only in `src/config/ai.ts`. Upload and page limits live in `src/config/uploads.ts`, study rules in `src/config/study.ts`.
- **Generated content must be grounded and verified.** New kinds of generated item go through `grounded()` in `src/server/ai/generate.ts` and `keepVerified()` in `src/server/ai/verify.ts` before they are stored. `tests/unit/ai-pipeline.test.ts` scripts Claude's replies to pin both.
- **Two answers agree only when they are the same.** `answersAgree` in `src/lib/grounding.ts` decides grading and verification. It may say "unsure" (a judge or grader decides) but must never say "yes" to numbers that merely look close.
- **The plan and the level rules are pure.** `src/lib/plan.ts` and `src/lib/levels.ts` read no clock, database or network. Change them test-first in `tests/unit/`.
- **Every session saves one record** through `saveSessionRecord` in `src/server/data/sessions.ts`. A new study mode is an entry in `src/lib/modes.ts`, a component taking `ModeProps`, and a line in `src/components/modes/index.ts`. The mode reports its counts through `onFinish`; the session shell stores them on the server.
- **A session can always be finished.** A level moves only through a passed check, but a check the server could not write or grade must not trap the student: see `blocksCheck` in `src/server/study/checks.ts` and `src/lib/api.ts`.
- **What a student reads when something fails** is worded in `src/server/error-messages.ts`. Add new error classes there.
- **One database pool, and it is guarded.** `getDb()` in `src/db/index.ts` is the only place a pool is made. `guardPool` in `src/db/pool.ts` checks a connection that has sat unused before trusting it, because Vercel can pause an instance with connections still open. Do not create another pool or remove the guard.
- **Database changes are new migrations.** Edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `src/db/migrations/`. Do not edit or regenerate a migration that has been deployed. Migrations run automatically before each production build; preview builds never change the database.
- **Pages read the request inside `<Suspense>`.** Cache Components is on: a page exports a static shell and one async component that calls `pageUser()`.
