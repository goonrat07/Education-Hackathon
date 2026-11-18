import { LEVEL_WEIGHTS, type Level } from "@/config/study";

/**
 * A test's readiness drawn as a marker stroke on a ruled line. The inked,
 * green and yellow stretches are the topics at each level, each as long as
 * that level is worth, so the whole stroke is exactly the readiness figure.
 */
export function ReadinessLine({ levels, size = "md" }: { levels: Level[]; size?: "sm" | "md" }) {
  const total = levels.length || 1;
  const share = (level: Level) => (levels.filter((l) => l === level).length * LEVEL_WEIGHTS[level]) / total;
  const ink = share(3);
  const green = share(2);
  const yellow = share(1);
  const percent = Math.round((ink + green + yellow) * 100);
  const height = size === "sm" ? "h-2.5" : "h-3.5";

  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={`${percent}% ready`}
        className={`relative flex-1 ${height} overflow-hidden rounded-[2px]`}
        style={{
          background:
            "linear-gradient(to right, var(--color-pencil) 55%, transparent 0) center left / 8px 1.5px repeat-x",
        }}
      >
        <div className="absolute inset-y-0 left-0 flex w-full">
          <span className="bg-ink" style={{ width: `${ink * 100}%` }} />
          <span className="bg-hi-green" style={{ width: `${green * 100}%` }} />
          <span className="bg-hi-yellow" style={{ width: `${yellow * 100}%` }} />
        </div>
      </div>
      <span className={`shrink-0 tabular-nums font-semibold ${size === "sm" ? "text-sm" : "text-base"}`}>
        {percent}% ready
      </span>
    </div>
  );
}
