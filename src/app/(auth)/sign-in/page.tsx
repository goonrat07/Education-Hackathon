import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LevelName } from "@/components/level-mark";
import { databaseConfigured } from "@/db";
import { googleEnabled } from "@/server/auth";
import { getUser } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/** Sends students who are already signed in straight to their dashboard. */
async function SkipIfSignedIn() {
  if (await getUser()) redirect("/");
  return null;
}

export default function SignInPage() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
      <Suspense fallback={null}>
        <SkipIfSignedIn />
      </Suspense>

      <section>
        <p className="font-display text-xl font-semibold">Study Coach</p>
        <h1 className="mt-6 text-3xl md:text-4xl">Know exactly what to study before your test.</h1>
        <p className="mt-5 max-w-[34rem] text-lg text-ink-soft">
          Upload your notes and your teacher&rsquo;s handouts. You get a plan for every day until the test, with
          flashcards and practice problems made only from what you uploaded.
        </p>

        <div className="mt-9 max-w-[30rem] ruled-top pt-5">
          <p className="text-sm text-pencil">Every topic moves up as you pass quick checks:</p>
          <ol className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-3 font-display text-lg font-semibold">
            <li>
              <LevelName level={0} />
            </li>
            <li>
              <LevelName level={1} />
            </li>
            <li>
              <LevelName level={2} />
            </li>
            <li>
              <LevelName level={3} />
            </li>
          </ol>
        </div>
      </section>

      <section className="sheet p-6 sm:p-8">
        {databaseConfigured() ? (
          // The form reads the address bar (for a sign-in error), which is only known per request.
          <Suspense fallback={<div className="h-72" aria-busy="true" />}>
            <SignInForm googleEnabled={googleEnabled} />
          </Suspense>
        ) : (
          <div role="status">
            <h2 className="text-xl">Not open yet</h2>
            <p className="mt-3 text-ink-soft">
              This copy of Study Coach is still being set up: its database isn&rsquo;t connected, so nobody can sign
              in yet. Check back soon.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
