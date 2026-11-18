/**
 * What a study mode is given and what it reports back. A mode studies one
 * topic and calls `onFinish` with how many items the student attempted and
 * got right. The session shell handles everything else: timing, the checks,
 * the confidence rating and saving the session record.
 */
export interface ModeProps {
  sessionId: string;
  topicName: string;
  onFinish: (result: { itemsAttempted: number; itemsCorrect: number }) => void;
}
