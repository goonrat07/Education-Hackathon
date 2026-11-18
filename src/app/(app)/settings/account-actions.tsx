"use client";

import { useState } from "react";
import { api, messageFrom } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

/** Sign out, and the "delete my data" button that removes the whole account. */
export function AccountActions() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"none" | "signing-out" | "deleting">("none");
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy("signing-out");
    await authClient.signOut().catch(() => undefined);
    // A full page load on purpose: nothing of this student's pages stays cached in the browser.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/sign-in");
  }

  async function deleteEverything() {
    setBusy("deleting");
    setError(null);
    try {
      await api("/api/account", { method: "DELETE" });
      // The account is gone; clear this browser's sign-in cookie too.
      await authClient.signOut().catch(() => undefined);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/sign-in");
    } catch (e) {
      setError(messageFrom(e));
      setBusy("none");
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-paper" disabled={busy !== "none"} onClick={signOut}>
        {busy === "signing-out" ? "Signing out…" : "Sign out"}
      </button>

      <section className="mt-10 ruled-top pt-6" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-xl">
          Delete my data
        </h2>
        <p className="mt-2 max-w-[60ch] text-ink-soft">
          This removes your account and everything in it: your tests, uploaded files, topics, flashcards, questions,
          study history and plans. It can&rsquo;t be undone.
        </p>
        {confirming ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn border-redpen bg-redpen text-paper"
              disabled={busy !== "none"}
              onClick={deleteEverything}
            >
              {busy === "deleting" ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button type="button" className="btn btn-paper" disabled={busy !== "none"} onClick={() => setConfirming(false)}>
              Keep my account
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn mt-4 border-redpen bg-sheet text-redpen hover:bg-redpen-wash"
            onClick={() => setConfirming(true)}
          >
            Delete my data
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-redpen">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
