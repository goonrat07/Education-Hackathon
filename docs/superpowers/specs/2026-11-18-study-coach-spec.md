# Study Coach — product spec

This is the request the app was built from, kept word for word so the plan and
the tests can be checked against it.

---

When you finish this prompt, Study Coach is a live web app at a public
URL that a middle or high school student can open the night before a
test and be studying within minutes. Two students are building it for a
school contest and will use it for their own classes. The design is
decided, so don't interview me or rewrite the spec. Plan it yourself and
build until everything described below is real.

WHAT THE FINISHED APP LOOKS LIKE

Signing in
A student opens the URL on a school Chromebook or a phone and signs in
with Google or with email. They only ever see their own data.

Dashboard
The home screen shows today's plan with one button that starts the next
session, and every test they've added with a countdown to test day and a
readiness bar.

Adding a test
They add a test with a class, a name, a date, and the minutes they have
per day. They upload PDFs and photos of handwritten notes and tag each
as teacher material or my notes. Handwriting and diagrams are
understood.

Topic list
The app shows the topics the test covers. Each has a name, a short
summary, a type (memorization, application, or concept), and links that
open the exact passages it came from. They can rename, merge, delete, or
add topics. They tap a confidence rating from 1 to 5 on each one.

Plan
A day-by-day plan runs through test day. Each session is one topic, one
study mode, and 10 to 15 minutes. The weakest topics come first, and
earlier topics come back for review before the test. If there isn't
enough time, the plan says so and shows what to prioritize. A short
explanation tells them why the plan looks the way it does. Getting from
"add a test" to this plan takes under 5 minutes with the files in
/samples.

Studying
Two modes work from start to finish. Flashcards: missed cards come back
sooner. Practice problems: multiple choice, short answer graded by AI,
and worked problems with step-by-step solutions, with math and chemistry
notation rendered properly. Memorization topics get flashcards.
Application and concept topics get practice problems. Every card,
question, and answer links to the passage it came from and has a "this
is wrong" button.

Checks
Every session ends with a check of 3 to 5 new questions on that topic. A
topic studied on an earlier day gets a delayed check at the start of a
later session.

Progress
After every session, a screen shows what moved. Each topic has a level:
Not started, Learning, Got it, Locked in. Levels only go up by passing a
check, and Locked in takes passing a delayed check at least a day later.
The test's readiness bar is built from those levels. For each topic the
student sees their confidence next to their latest check result, with
the biggest gaps called out. By the time they're back on the dashboard,
the plan has already updated. It also updates whenever a day is missed.

Settings
A "delete my data" button removes everything for that account.

WHAT'S ALWAYS TRUE
- Everything shown comes only from the uploaded materials.
- Every generated problem's answer has been solved a second time
  independently. Mismatches are never shown.
- The same inputs always produce the same plan. AI only writes the
  explanation of it.
- Every study session, in any mode, saves the same record: user, test,
  topic, mode, start time, duration, items attempted, items correct,
  score from 0 to 1, confidence from 1 to 5. A new mode needs nothing
  more than studying one topic and saving this record.
- Claude is called directly through Anthropic's own SDK and only from
  the server. The key is never in the browser or the repository. Model
  names live in one setting, starting with claude-sonnet-5-5.
- There is a daily limit on AI calls per student, set in one place.
- It is free to host and run at this size.
- The plan logic and the topic level rules have automated tests, and
  they pass.
- Nothing is fake: no sample data, placeholder screens, or stubbed
  features. If something can't be done, tell me instead.

NOT IN THIS VERSION
Teach-back voice mode, Google Classroom sync, note coverage, a topic
web, and video links come in later prompts. Don't build them, but don't
make them hard to add.

PROOF
- A plan produced in under 5 minutes from the files in /samples.
- One full session in each mode, with the plan and readiness bar
  changed afterward.
- A question's link opening a real passage in the uploaded files.
- A second account unable to see the first account's tests or files.
- All automated tests passing.
- The public URL working, not just the local copy.
