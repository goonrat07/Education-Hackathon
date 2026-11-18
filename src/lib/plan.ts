import {
  DEFAULT_CONFIDENCE,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  TOP_LEVEL,
  type Level,
  type TopicType,
} from "@/config/study";
import { addDays, dateRange, daysBetween } from "@/lib/dates";
import { MODES, modeForType, type ModeId } from "@/lib/modes";

/**
 * The study planner. A pure function of its input: no clock, no randomness,
 * no I/O, so the same inputs always produce the same plan.
 *
 * How a plan is built:
 *  - Study days run from today to the day before the test (or just today when
 *    the test is today). Test day is always the last row.
 *  - Pass A: every topic not yet studied gets a first session, weakest first,
 *    on the earliest day with room.
 *  - Pass B: every topic not yet Locked in gets a final review, weakest first,
 *    on the latest day with room after its previous session.
 *  - Pass C: topics still at Not started or Learning get an early review on
 *    the first free day between those two.
 *  - If full-length sessions leave anything out, the plan is rebuilt letting
 *    days shrink their sessions toward 10 minutes, and that version is kept
 *    when it covers or reviews more topics.
 */

export interface PlanTopic {
  id: string;
  /** Order in the student's topic list; the last tie-breaker. */
  position: number;
  type: TopicType;
  /** Self-rating 1–5, or null when not rated yet. */
  confidence: number | null;
  level: Level;
  /** Latest check result as a share correct (0–1), or null when never checked. */
  latestCheckScore: number | null;
  /** Local date of the last completed session on this topic. */
  lastStudiedOn: string | null;
  /** Completed sessions on this topic. */
  sessionsDone: number;
}

export interface PlanInput {
  /** The student's local date. */
  today: string;
  testDate: string;
  minutesPerDay: number;
  /** Planned minutes of sessions already completed today. */
  minutesDoneToday: number;
  topics: PlanTopic[];
}

export interface PlannedSession {
  topicId: string;
  mode: ModeId;
  minutes: number;
  /** `learn` is a topic's first session; `review` is any later one. */
  kind: "learn" | "review";
}

export interface PlanDay {
  date: string;
  isTestDay: boolean;
  minutesAvailable: number;
  minutesPlanned: number;
  sessions: PlannedSession[];
}

export interface Shortage {
  /** `coverage`: some topics get no session at all. `review`: all covered, some never reviewed. */
  kind: "coverage" | "review";
  /** Topics with no session, weakest first. */
  uncovered: string[];
  /** Covered topics with no review, weakest first. */
  unreviewed: string[];
  /** Topics that did make the plan, weakest first: what to focus on. */
  prioritized: string[];
  minutesAvailable: number;
  /** Minutes a first session plus one review of every unfinished topic would take. */
  minutesWanted: number;
}

export interface Plan {
  /** `past`: test date has gone. `empty`: no topics. `complete`: everything Locked in. */
  status: "active" | "complete" | "past" | "empty";
  days: PlanDay[];
  shortage: Shortage | null;
}

/** How strong a topic looks, 0–1: the latest check when there is one, tempered by confidence. */
function strength(topic: PlanTopic): number {
  const prior = ((topic.confidence ?? DEFAULT_CONFIDENCE) - 1) / 4;
  return topic.latestCheckScore === null ? prior : 0.7 * topic.latestCheckScore + 0.3 * prior;
}

/** Weakest first: lower level, then lower strength, then list order. */
export function weakestFirst(topics: PlanTopic[]): PlanTopic[] {
  return [...topics].sort(
    (a, b) => a.level - b.level || strength(a) - strength(b) || a.position - b.position || a.id.localeCompare(b.id),
  );
}

function preferredMinutes(topic: PlanTopic): number {
  const minutes = MODES[modeForType(topic.type)].minutes;
  return Math.min(MAX_SESSION_MINUTES, Math.max(MIN_SESSION_MINUTES, minutes));
}

interface Slot extends PlannedSession {
  /** Position in the weakest-first order, for sorting within a day. */
  rank: number;
}

interface DayState {
  date: string;
  capacity: number;
  slots: Slot[];
}

function planned(day: DayState): number {
  return day.slots.reduce((sum, s) => sum + s.minutes, 0);
}

/**
 * Tries to add a session to a day. Returns false when there is no room.
 * With `compress`, sessions already on the day may shrink toward the minimum
 * (most recently placed first) to make room for one more.
 */
function place(day: DayState, topic: PlanTopic, kind: "learn" | "review", rank: number, compress: boolean): boolean {
  const remaining = day.capacity - planned(day);
  const want = preferredMinutes(topic);
  let minutes: number;

  if (remaining >= want) {
    minutes = want;
  } else if (remaining >= MIN_SESSION_MINUTES) {
    minutes = remaining;
  } else {
    if (!compress) return false;
    const slack = day.slots.reduce((sum, s) => sum + (s.minutes - MIN_SESSION_MINUTES), 0);
    if (remaining + slack < MIN_SESSION_MINUTES) return false;
    let needed = MIN_SESSION_MINUTES - remaining;
    for (let i = day.slots.length - 1; i >= 0 && needed > 0; i--) {
      const give = Math.min(needed, day.slots[i].minutes - MIN_SESSION_MINUTES);
      day.slots[i].minutes -= give;
      needed -= give;
    }
    minutes = MIN_SESSION_MINUTES;
  }

  day.slots.push({ topicId: topic.id, mode: modeForType(topic.type), minutes, kind, rank });
  return true;
}

interface Attempt {
  days: DayState[];
  uncovered: string[];
  unreviewed: string[];
}

function attempt(input: PlanInput, studyDates: string[], ordered: PlanTopic[], compress: boolean): Attempt {
  const days: DayState[] = studyDates.map((date) => ({
    date,
    capacity:
      date === input.today ? Math.max(0, input.minutesPerDay - input.minutesDoneToday) : input.minutesPerDay,
    slots: [],
  }));
  const rankOf = new Map(ordered.map((t, i) => [t.id, i]));
  const unfinished = ordered.filter((t) => t.level < TOP_LEVEL);

  /** Date of each covered topic's most recent session: from history, then from this plan. */
  const previous = new Map<string, string>();
  const uncovered: string[] = [];

  // Pass A: first sessions, on the earliest day with room.
  for (const topic of unfinished) {
    if (topic.sessionsDone > 0) {
      // Studied before; a missing date is treated as "before today".
      previous.set(topic.id, topic.lastStudiedOn ?? addDays(input.today, -1));
      continue;
    }
    const day = days.find((d) => place(d, topic, "learn", rankOf.get(topic.id)!, compress));
    if (day) previous.set(topic.id, day.date);
    else uncovered.push(topic.id);
  }

  // Pass B: final reviews, on the latest day with room after the previous session.
  const finalReview = new Map<string, string>();
  for (const topic of unfinished) {
    const prev = previous.get(topic.id);
    if (prev === undefined) continue;
    const rank = rankOf.get(topic.id)!;
    let chosen: DayState | undefined;
    for (let i = days.length - 1; i >= 0 && !chosen; i--) {
      if (days[i].date > prev && place(days[i], topic, "review", rank, compress)) chosen = days[i];
    }
    if (!chosen) {
      // No later day has room: allow a second session on the same day.
      const sameDay = days.find((d) => d.date === prev);
      if (sameDay && place(sameDay, topic, "review", rank, compress)) chosen = sameDay;
    }
    if (chosen) finalReview.set(topic.id, chosen.date);
  }

  // Pass C: an early review for topics that have not got it yet.
  for (const topic of unfinished) {
    if (topic.level > 1) continue;
    const prev = previous.get(topic.id);
    const last = finalReview.get(topic.id);
    if (prev === undefined || last === undefined) continue;
    days.find((d) => d.date > prev && d.date < last && place(d, topic, "review", rankOf.get(topic.id)!, compress));
  }

  const unreviewed = unfinished.filter((t) => previous.has(t.id) && !finalReview.has(t.id)).map((t) => t.id);
  return { days, uncovered, unreviewed };
}

export function buildPlan(input: PlanInput): Plan {
  const daysLeft = daysBetween(input.today, input.testDate);
  if (daysLeft < 0) return { status: "past", days: [], shortage: null };

  const ordered = weakestFirst(input.topics);
  const testIsToday = daysLeft === 0;
  const studyDates = testIsToday ? [input.today] : dateRange(input.today, addDays(input.testDate, -1));

  let best = attempt(input, studyDates, ordered, false);
  if (best.uncovered.length > 0 || best.unreviewed.length > 0) {
    const compressed = attempt(input, studyDates, ordered, true);
    const coversMore = compressed.uncovered.length < best.uncovered.length;
    const reviewsMore =
      compressed.uncovered.length === best.uncovered.length &&
      compressed.unreviewed.length < best.unreviewed.length;
    if (coversMore || reviewsMore) best = compressed;
  }

  const days: PlanDay[] = best.days.map((day) => {
    const sessions = [...day.slots]
      .sort((a, b) => (a.kind === b.kind ? a.rank - b.rank : a.kind === "learn" ? -1 : 1))
      .map(({ topicId, mode, minutes, kind }) => ({ topicId, mode, minutes, kind }));
    return {
      date: day.date,
      isTestDay: day.date === input.testDate,
      minutesAvailable: day.capacity,
      minutesPlanned: planned(day),
      sessions,
    };
  });
  if (!testIsToday) {
    days.push({ date: input.testDate, isTestDay: true, minutesAvailable: 0, minutesPlanned: 0, sessions: [] });
  }

  let status: Plan["status"] = "active";
  if (input.topics.length === 0) status = "empty";
  else if (input.topics.every((t) => t.level === TOP_LEVEL)) status = "complete";

  let shortage: Shortage | null = null;
  if (best.uncovered.length > 0 || best.unreviewed.length > 0) {
    const inPlan = new Set(best.days.flatMap((d) => d.slots.map((s) => s.topicId)));
    const unfinished = ordered.filter((t) => t.level < TOP_LEVEL);
    shortage = {
      kind: best.uncovered.length > 0 ? "coverage" : "review",
      uncovered: best.uncovered,
      unreviewed: best.unreviewed,
      prioritized: ordered.filter((t) => inPlan.has(t.id)).map((t) => t.id),
      minutesAvailable: best.days.reduce((sum, d) => sum + d.capacity, 0),
      minutesWanted: unfinished.reduce(
        (sum, t) => sum + preferredMinutes(t) * (t.sessionsDone === 0 ? 2 : 1),
        0,
      ),
    };
  }

  return { status, days, shortage };
}

/** A short, stable fingerprint of a plan, used to tell when it has changed. */
export function planHash(plan: Plan): string {
  const text = JSON.stringify(plan);
  // FNV-1a, run twice with different seeds for a 64-bit result.
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x9747b28c);
}
