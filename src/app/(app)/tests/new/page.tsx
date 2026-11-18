import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { pageUser } from "@/server/page-user";
import { NewTestForm } from "./new-test-form";

export const metadata: Metadata = { title: "Add a test" };

/** The form, once we know someone is signed in (anyone else is sent to the sign-in page). */
async function Form() {
  await pageUser();
  return <NewTestForm />;
}

export default function NewTestPage() {
  return (
    <div className="max-w-xl">
      <Link href="/" className="link link-quiet text-sm">
        Back to today
      </Link>
      <h1 className="mt-3 text-3xl">Add a test</h1>
      <p className="mt-3 text-ink-soft">Four quick things, then you&rsquo;ll add your notes and handouts.</p>
      <Suspense fallback={<div className="mt-7 h-72 rounded-[3px] bg-rule-faint" aria-busy="true" aria-label="Loading the form" />}>
        <Form />
      </Suspense>
    </div>
  );
}
