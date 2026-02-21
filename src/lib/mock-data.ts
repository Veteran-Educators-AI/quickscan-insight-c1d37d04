export interface Student {
  id: string;
  name: string;
  email: string;
  classPeriod: number;
  averageGrade: number;
}

export interface ClassPeriod {
  period: number;
  name: string;
  subject: string;
  studentCount: number;
  averageGrade: number;
  pendingAssignments: number;
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  classPeriod: number;
  dueDate: string;
  status: "open" | "grading" | "completed";
  submissionCount: number;
  totalStudents: number;
}

export interface RecentActivity {
  id: string;
  type: "graded" | "submitted" | "created";
  description: string;
  timestamp: string;
}

export const classPeriods: ClassPeriod[] = [
  { period: 1, name: "Period 1", subject: "English Language Arts", studentCount: 32, averageGrade: 82, pendingAssignments: 2 },
  { period: 5, name: "Period 5", subject: "English Language Arts", studentCount: 28, averageGrade: 78, pendingAssignments: 1 },
  { period: 6, name: "Period 6", subject: "English Language Arts", studentCount: 30, averageGrade: 85, pendingAssignments: 3 },
  { period: 13, name: "Period 13", subject: "English Language Arts", studentCount: 26, averageGrade: 80, pendingAssignments: 0 },
  { period: 8, name: "Period 8", subject: "English Language Arts", studentCount: 28, averageGrade: 76, pendingAssignments: 2 },
];

export const recentAssignments: Assignment[] = [
  { id: "1", title: "Persuasive Essay Draft", subject: "ELA", classPeriod: 1, dueDate: "2026-02-20", status: "open", submissionCount: 18, totalStudents: 32 },
  { id: "2", title: "Poetry Analysis", subject: "ELA", classPeriod: 5, dueDate: "2026-02-18", status: "grading", submissionCount: 28, totalStudents: 28 },
  { id: "3", title: "Character Study - Hamlet", subject: "ELA", classPeriod: 6, dueDate: "2026-02-15", status: "completed", submissionCount: 30, totalStudents: 30 },
  { id: "4", title: "Vocabulary Quiz #7", subject: "ELA", classPeriod: 13, dueDate: "2026-02-17", status: "completed", submissionCount: 24, totalStudents: 26 },
];

export const recentActivity: RecentActivity[] = [
  { id: "1", type: "graded", description: "Graded 30 submissions for Character Study - Hamlet", timestamp: "2 hours ago" },
  { id: "2", type: "submitted", description: "5 new submissions for Persuasive Essay Draft", timestamp: "4 hours ago" },
  { id: "3", type: "created", description: "Created new assignment: Poetry Analysis", timestamp: "1 day ago" },
  { id: "4", type: "graded", description: "Graded 24 submissions for Vocabulary Quiz #7", timestamp: "2 days ago" },
];
