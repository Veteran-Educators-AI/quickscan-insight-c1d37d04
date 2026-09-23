// Shared types for the "Next day's lesson" draft.
// Kept in its own file so the exporters never import React code.

export interface LessonTimelineStep {
  minutes: number;
  label: string;
  detail: string;
}

export interface ReteachItem {
  itemNumber: number;
  percentCorrect: number | null;
  skillTag: string | null;
  wrongAnswersQuoted: string[];
  whatWentWrong: string;
  howToRepair: string;
}

export interface LessonPlanDraft {
  title: string;
  aim: string;
  objective: string;
  standards: string[];
  durationMinutes: number;
  builtFrom: string;
  timeline: LessonTimelineStep[];
  reteach: {
    summary: string;
    items: ReteachItem[];
    script: string[];
  };
  materials: string[];
  differentiationNotes: string[];
  assessmentNote: string;
}

export type SlideKind =
  | 'title'
  | 'do-now'
  | 'reteach-worked'
  | 'teaching'
  | 'independent-work'
  | 'exit-ticket'
  | 'debrief';

export interface SlideDraft {
  slideNumber: number;
  kind: SlideKind;
  title: string;
  bullets: string[];
  speakerNotes: string;
}

export interface WorksheetItemDraft {
  itemNumber: number;
  prompt: string;
  answer: string;
  answerNumeric: number | null;
  verify: string;
  verifyExpected: number | null;
  skillTag: string | null;
  isRepair: boolean;
  errorTagIfWrong: string;
  workedSolution?: string;
  /** set by the client after checking the arithmetic */
  verified?: boolean;
  verifyNote?: string;
}

export interface WorksheetDraft {
  title: string;
  instructions: string;
  items: WorksheetItemDraft[];
}

export interface ExitTicketDraft {
  title: string;
  items: WorksheetItemDraft[];
}

export interface StudentGroup {
  /** neutral internal id — never printed on student-facing pages */
  id: string;
  /** neutral board label, e.g. "Group 1" */
  label: string;
  itemNumbers: number[];
  checkTotal: number;
  students: {
    studentId: string;
    name: string;
    evidence: string;
    score: number | null;
  }[];
}

export interface GroupingPlan {
  groups: StudentGroup[];
  /** students in the class with no results received yet */
  noResultsYet: { studentId: string; name: string }[];
  itemsPerStudent: number;
}

export interface NextDayDraft {
  classId: string;
  className: string;
  builtFrom: {
    className: string;
    worksheetCode: string;
    worksheetTitle: string;
    worksheetDate: string | null;
    papers: number;
    studentCount: number;
    generatedAt: string;
  };
  lessonPlan: LessonPlanDraft;
  slides: SlideDraft[];
  worksheet: WorksheetDraft;
  exitTicket: ExitTicketDraft;
  grouping: GroupingPlan;
  nextLessonTitle: string;
  nextLessonDate: string;
}
