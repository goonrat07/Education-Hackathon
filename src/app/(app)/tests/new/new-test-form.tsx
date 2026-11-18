"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { MAX_MINUTES_PER_DAY, MIN_MINUTES_PER_DAY } from "@/config/study";
import { api, messageFrom } from "@/lib/api";
import { latestTestDate } from "@/lib/test-date";

const QUICK_MINUTES = [15, 20, 30, 45, 60, 90];

/** Today's date where the student is, as YYYY-MM-DD. */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function NewTestForm() {
  const router = useRouter();
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [testDate, setTestDate] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The earliest date allowed is today where the student is, which only the browser knows.
  const earliest = useSyncExternalStore(
    () => () => undefined,
    localToday,
    () => undefined,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { test } = await api<{ test: { id: string } }>("/api/tests", {
        body: { className, name, testDate, minutesPerDay: minutes },
      });
      router.push(`/tests/${test.id}/setup`);
    } catch (e) {
      setError(messageFrom(e));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-6">
      <div>
        <label htmlFor="class" className="field-label">
          Class
        </label>
        <input
          id="class"
          className="field"
          required
          maxLength={80}
          placeholder="Chemistry"
          autoComplete="off"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="name" className="field-label">
          Test name
        </label>
        <input
          id="name"
          className="field"
          required
          maxLength={120}
          placeholder="Unit 4 test"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="date" className="field-label">
          Test date
        </label>
        <input
          id="date"
          type="date"
          className="field max-w-56"
          required
          min={earliest}
          max={earliest ? latestTestDate(earliest) : undefined}
          value={testDate}
          onChange={(e) => setTestDate(e.target.value)}
        />
      </div>
      <fieldset>
        <legend className="field-label">Minutes you can study each day</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {QUICK_MINUTES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={minutes === option}
              onClick={() => setMinutes(option)}
              className={`btn btn-sm min-w-14 ${minutes === option ? "btn-ink" : "btn-paper"}`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="minutes" className="text-sm text-pencil">
            or another number:
          </label>
          <input
            id="minutes"
            type="number"
            inputMode="numeric"
            className="field w-24"
            min={MIN_MINUTES_PER_DAY}
            max={MAX_MINUTES_PER_DAY}
            required
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </div>
        <p className="field-hint">Sessions are 10 to 15 minutes each, so this is how many fit in a day.</p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-[3px] bg-redpen-wash px-3 py-2 text-sm text-redpen">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-ink btn-lg">
        {pending ? "Saving…" : "Save and add materials"}
      </button>
    </form>
  );
}
