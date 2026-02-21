export interface DbClassPeriod {
  id: string;
  teacher_id: string;
  period: number;
  name: string;
  subject: string;
  created_at: string;
}

export interface DbStudent {
  id: string;
  name: string;
  email: string;
  class_period_id: string;
  created_at: string;
}

export interface DbAssignment {
  id: string;
  teacher_id: string;
  title: string;
  subject: string;
  class_period_id: string;
  due_date: string;
  status: "open" | "grading" | "completed";
  created_at: string;
}

export interface DbSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string | null;
  submitted_at: string;
}

export interface DbGrade {
  id: string;
  submission_id: string;
  score: number;
  feedback: string | null;
  rubric_scores: Record<string, number> | null;
  graded_at: string;
}
