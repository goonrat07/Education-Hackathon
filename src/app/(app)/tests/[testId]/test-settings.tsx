"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_MINUTES_PER_DAY, MIN_MINUTES_PER_DAY } from "@/config/study";
import { api, messageFrom } from "@/lib/api";
import type { TestDto } from "@/lib/dto";
import { latestTestDate } from "@/lib/test-date";

/** Change a test's date or daily minutes, or delete the test. */
export function TestSettings({ test, today }: { test: TestDto; today: string }) {
  const router = useRouter();
  const [testDate, setTestDate] = useState(test.testDate);
  const [minutes, setMinutes] = useState(test.minutesPerDay);
  const [busy, setBusy] = useState<"none" | "saving" | "deleting">("none");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const changed = testDate !== test.testDate || minutes !== test.minutesPerDay;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("saving");
    setMessage(null);
    try {
      await api(`/api/tests/${test.id}`, { method: "PATCH", body: { testDate, minutesPerDay: minutes } });
      setMessage({ kind: "ok", text: "Saved. The plan above has been rebuilt." });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: messageFrom(e) });
    } finally {
      setBusy("none");
    }
  }

  async function remove() {
    setBusy("deleting");
    try {
      await api(`/api/tests/${test.id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: messageFrom(e) });
      setBusy("none");
    }
  }

  return (
    <div>
      <form onSubmit={save} className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="test-date" className="field-label">
            Test date
          </label>
          <input
            id="test-date"
            type="date"
            className="field"
            required
            min={today}
            max={latestTestDate(today)}
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="test-minutes" className="field-label">
            Minutes a day
          </label>
          <input
            id="test-minutes"
            type="number"
            inputMode="numeric"
            className="field w-28"
            required
            min={MIN_MINUTES_PER_DAY}
            max={MAX_MINUTES_PER_DAY}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </div>
        <button type="submit" className="btn btn-paper" disabled={!changed || busy !== "none"}>
          {busy === "saving" ? "Saving…" : "Save changes"}
        </button>
      </form>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.kind === "ok" ? "text-pass" : "text-redpen"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-6">
        {confirming ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Delete this test, its files, topics and history? This can&rsquo;t be undone.
            <button
              type="button"
              className="btn btn-sm border-redpen bg-redpen text-paper"
              disabled={busy !== "none"}
              onClick={remove}
            >
              {busy === "deleting" ? "Deleting…" : "Delete test"}
            </button>
            <button type="button" className="btn btn-paper btn-sm" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </p>
        ) : (
          <button type="button" className="link link-danger text-sm" onClick={() => setConfirming(true)}>
            Delete this test
          </button>
        )}
      </div>
    </div>
  );
}
