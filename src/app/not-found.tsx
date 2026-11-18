import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <p className="font-display text-xl font-semibold">Study Coach</p>
      <h1 className="mt-6 text-3xl">That page isn&rsquo;t here.</h1>
      <p className="mt-3 text-ink-soft">It may have been deleted, or the link may belong to a different account.</p>
      <Link href="/" className="btn btn-ink mt-6">
        Go to today&rsquo;s plan
      </Link>
    </main>
  );
}
