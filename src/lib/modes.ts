import type { TopicType } from "@/config/study";

/**
 * The study modes. A mode studies one topic and reports how many items the
 * student attempted and got right; the session shell does everything else
 * (timing, checks, saving the record). Adding a mode means adding an entry
 * here and a component in src/components/modes.
 */
export const MODES = {
  flashcards: {
    id: "flashcards",
    label: "Flashcards",
    blurb: "Flip, recall, and repeat the ones you miss.",
    minutes: 10,
  },
  practice: {
    id: "practice",
    label: "Practice problems",
    blurb: "Work problems and check each answer.",
    minutes: 15,
  },
} as const;

export type ModeId = keyof typeof MODES;

export function isModeId(value: string): value is ModeId {
  return value in MODES;
}

/** Which mode a topic is studied in. */
const MODE_FOR_TYPE: Record<TopicType, ModeId> = {
  memorization: "flashcards",
  application: "practice",
  concept: "practice",
};

export function modeForType(type: TopicType): ModeId {
  return MODE_FOR_TYPE[type];
}
