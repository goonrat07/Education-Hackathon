import type { ComponentType } from "react";
import type { ModeId } from "@/lib/modes";
import { FlashcardsMode } from "./flashcards";
import { PracticeMode } from "./practice";
import type { ModeProps } from "./types";

/**
 * The screen for each study mode. To add a mode: add it to MODES in
 * src/lib/modes.ts, write a component that takes ModeProps, and list it here.
 */
export const MODE_COMPONENTS: Record<ModeId, ComponentType<ModeProps>> = {
  flashcards: FlashcardsMode,
  practice: PracticeMode,
};
