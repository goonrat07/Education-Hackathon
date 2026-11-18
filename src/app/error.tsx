"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <p className="font-display text-xl font-semibold">Study Coach</p>
      <h1 className="mt-6 text-3xl">This page didn&rsquo;t load.</h1>
      <p className="mt-3 text-ink-soft">Something went wrong on our side. Your work is saved.</p>
      <button type="button" className="btn btn-ink mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
