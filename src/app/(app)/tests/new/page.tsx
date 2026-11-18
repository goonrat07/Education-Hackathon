import type { Metadata } from "next";
import Link from "next/link";
import { NewTestForm } from "./new-test-form";

export const metadata: Metadata = { title: "Add a test" };

export default function NewTestPage() {
  return (
    <div className="max-w-xl">
      <Link href="/" className="link link-quiet text-sm">
        Back to today
      </Link>
      <h1 className="mt-3 text-3xl">Add a test</h1>
      <p className="mt-3 text-ink-soft">Four quick things, then you&rsquo;ll add your notes and handouts.</p>
      <NewTestForm />
    </div>
  );
}
