// =============================================================================
// PACING CALENDARS — Algebra II and Statistics
// =============================================================================
// Deliberately sparse and honest: it holds ONLY the day numbers, unit context
// and lesson titles the teacher has actually told us. Any day without an entry
// is reported as "title not set yet" on the card so the teacher can type it —
// nothing is invented here.
// =============================================================================

export type CourseId = 'algebra2' | 'statistics';

export interface CalendarDay {
  title: string;
  standards?: string[];
}

export interface CourseCalendar {
  id: CourseId;
  label: string;
  unitLabel: string;
  defaultStandards: string[];
  days: Record<number, CalendarDay>;
}

export const COURSE_CALENDARS: Record<CourseId, CourseCalendar> = {
  algebra2: {
    id: 'algebra2',
    label: 'Algebra II',
    unitLabel: 'Unit 1 Sequences and Functions',
    defaultStandards: ['AII-F.IF.3', 'AII-F.BF.2', 'AII-F.LE.2'],
    days: {
      8: { title: "What's the Equation", standards: ['AII-F.IF.3', 'AII-F.BF.2', 'AII-F.LE.2'] },
    },
  },
  statistics: {
    id: 'statistics',
    label: 'Statistics',
    unitLabel: 'Unit 1 Describing Data',
    defaultStandards: ['S-ID.A.2', 'S-ID.A.3'],
    days: {
      17: { title: 'Resistant vs non-resistant measures', standards: ['S-ID.A.2', 'S-ID.A.3'] },
    },
  },
};

/** Where each class is on its calendar: the day it sat, and when. */
export interface CourseAnchor {
  course: CourseId;
  /** day number covered on the anchor date */
  day: number;
  /** ISO date (yyyy-mm-dd) of that day */
  date: string;
}

/**
 * Anchors keyed by class join code. Only classes whose position the teacher has
 * confirmed appear here; others show "day not set" and can be set on the card.
 */
export const CLASS_ANCHORS: Record<string, CourseAnchor> = {
  ALG2P9: { course: 'algebra2', day: 7, date: '2026-09-23' },
  STATS7: { course: 'statistics', day: 17, date: '2026-09-23' },
  STATS8: { course: 'statistics', day: 17, date: '2026-09-23' },
};

/** Best-effort course from the class name when there is no anchor. */
export function courseForClass(joinCode?: string | null, className?: string | null): CourseId | null {
  const anchor = joinCode ? CLASS_ANCHORS[joinCode.toUpperCase()] : undefined;
  if (anchor) return anchor.course;
  const haystack = `${joinCode || ''} ${className || ''}`.toLowerCase();
  if (haystack.includes('stat')) return 'statistics';
  if (haystack.includes('alg') && haystack.includes('2')) return 'algebra2';
  if (haystack.includes('algebra ii')) return 'algebra2';
  return null;
}

// ------------------------------------------------------------------ school days

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

export function nextSchoolDay(from: Date): Date {
  const d = new Date(from);
  do {
    d.setDate(d.getDate() + 1);
  } while (isWeekend(d));
  return d;
}

export function previousSchoolDay(from: Date): Date {
  const d = new Date(from);
  do {
    d.setDate(d.getDate() - 1);
  } while (isWeekend(d));
  return d;
}

export const isoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Count school days between two ISO dates (can be negative). */
function schoolDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  const forward = to >= from;
  let count = 0;
  const cursor = new Date(forward ? from : to);
  const end = forward ? to : from;
  while (isoDate(cursor) !== isoDate(end)) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekend(cursor)) count += 1;
  }
  return forward ? count : -count;
}

export interface CalendarPosition {
  course: CourseId | null;
  courseLabel: string | null;
  unitLabel: string | null;
  dayNumber: number | null;
  title: string | null;
  standards: string[];
}

/** Which calendar day a class is on for a given date. */
export function positionFor(
  joinCode: string | null | undefined,
  className: string | null | undefined,
  targetIso: string
): CalendarPosition {
  const course = courseForClass(joinCode, className);
  const calendar = course ? COURSE_CALENDARS[course] : null;
  const anchor = joinCode ? CLASS_ANCHORS[joinCode.toUpperCase()] : undefined;

  const dayNumber = anchor ? anchor.day + schoolDaysBetween(anchor.date, targetIso) : null;
  const entry = calendar && dayNumber !== null ? calendar.days[dayNumber] : undefined;

  return {
    course,
    courseLabel: calendar?.label ?? null,
    unitLabel: calendar?.unitLabel ?? null,
    dayNumber: dayNumber !== null && dayNumber > 0 ? dayNumber : null,
    title: entry?.title ?? null,
    standards: entry?.standards ?? calendar?.defaultStandards ?? [],
  };
}
