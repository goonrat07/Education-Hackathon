<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Study Coach: rules for changing this codebase

Read `README.md` first for what the app does and where things live.

- **Run before you say it works:** `npm test` (needs `npm run db:start`), `npx tsc --noEmit`, `npx eslint src tests scripts`, and `npx next build`.
- **One owner check everywhere.** Every function in `src/server/data/` takes `userId` and filters on it. Routes call `requireUser()` first and return 404 for anything the caller does not own. New tables get a `user_id` column that references `user.id` with `ON DELETE CASCADE`, and are added to `OWNED_TABLES` in `tests/support/db.ts`.
- **Claude is called in one place.** `runClaude` in `src/server/ai/client.ts` counts the call against the student's daily limit before making it. Never construct an Anthropic client anywhere else, and never import `src/server/**` from a client component.
- **Model names and the daily limit** live only in `src/config/ai.ts`.
- **Generated content must be grounded and verified.** New kinds of generated item go through `grounded()` in `src/server/ai/generate.ts` and `keepVerified()` in `src/server/ai/verify.ts` before they are stored.
- **The plan and the level rules are pure.** `src/lib/plan.ts` and `src/lib/levels.ts` read no clock, database or network. Change them test-first in `tests/unit/`.
- **Every session saves one record** through `saveSessionRecord` in `src/server/data/sessions.ts`. A new study mode is an entry in `src/lib/modes.ts`, a component taking `ModeProps`, and a line in `src/components/modes/index.ts`.
- **Database changes are new migrations.** Edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `src/db/migrations/`. Do not edit or regenerate a migration that has been deployed. Migrations run automatically before each build.
- **Pages read the request inside `<Suspense>`.** Cache Components is on: a page exports a static shell and one async component that calls `pageUser()`.
