import { LEVEL_NAMES, type Level } from "@/config/study";

/**
 * Text marked the way its level looks on paper: pencil underline (not
 * started), yellow highlighter (learning), green highlighter (got it),
 * written in ink (locked in).
 */
export function LevelMark({
  level,
  children,
  draw = false,
}: {
  level: Level;
  children: React.ReactNode;
  /** Animate the mark being drawn. Used only where a level has just changed. */
  draw?: boolean;
}) {
  return <span className={`mark mark-${level}${draw ? " mark-draw" : ""}`}>{children}</span>;
}

/** The level's name in its own mark, for legends and row labels. */
export function LevelName({ level, draw }: { level: Level; draw?: boolean }) {
  return (
    <LevelMark level={level} draw={draw}>
      {LEVEL_NAMES[level]}
    </LevelMark>
  );
}
