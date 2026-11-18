import type { Level, TopicType } from "@/config/study";

/** Shapes the server hands to the browser. */

export interface TopicDto {
  id: string;
  name: string;
  summary: string;
  type: TopicType;
  confidence: number | null;
  level: Level;
  passageIds: string[];
}

/** Where a passage sits, for building links to it. */
export interface PassageRef {
  id: string;
  fileId: string;
  fileName: string;
  page: number;
}

export interface TestDto {
  id: string;
  className: string;
  name: string;
  testDate: string;
  minutesPerDay: number;
}
