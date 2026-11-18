"use client";

/**
 * A 1 to 5 confidence rating drawn as answer-sheet bubbles. The chosen
 * bubble is filled in.
 */
export function ConfidenceRating({
  value,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  value: number | null;
  onChange: (value: number) => void;
  /** What is being rated, for screen readers. */
  label: string;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const bubble = size === "lg" ? "size-12 text-lg" : "size-9 text-sm";
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const chosen = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={`${n} out of 5`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`${bubble} grid place-items-center rounded-full border-2 border-ink font-semibold tabular-nums transition-colors ${
              chosen ? "bg-ink text-paper" : "bg-sheet text-ink hover:bg-hi-yellow/60"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
