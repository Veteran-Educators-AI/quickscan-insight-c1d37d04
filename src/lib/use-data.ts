import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import type { DbClassPeriod, DbStudent, DbAssignment, DbSubmission, DbGrade } from "./database.types";

export function useClassPeriods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["class_periods", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_periods")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("period");
      if (error) throw error;
      return data as DbClassPeriod[];
    },
  });
}

export function useStudents(classPeriodId?: string) {
  return useQuery({
    queryKey: ["students", classPeriodId],
    enabled: !!classPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("class_period_id", classPeriodId!)
        .order("name");
      if (error) throw error;
      return data as DbStudent[];
    },
  });
}

export function useAssignments(classPeriodId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["assignments", user?.id, classPeriodId],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("assignments")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("due_date", { ascending: false });
      if (classPeriodId) query = query.eq("class_period_id", classPeriodId);
      const { data, error } = await query;
      if (error) throw error;
      return data as DbAssignment[];
    },
  });
}

export function useSubmissions(assignmentId?: string) {
  return useQuery({
    queryKey: ["submissions", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, grades(*)")
        .eq("assignment_id", assignmentId!);
      if (error) throw error;
      return data as (DbSubmission & { grades: DbGrade[] })[];
    },
  });
}

/** Dashboard-ready summary: class periods with computed student counts, averages, and pending assignments */
export function useDashboardData() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Fetch class periods
      const { data: periods, error: pErr } = await supabase
        .from("class_periods")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("period");
      if (pErr) throw pErr;

      // Fetch student counts per class period
      const { data: studentCounts, error: scErr } = await supabase
        .from("students")
        .select("class_period_id");
      if (scErr) throw scErr;

      // Fetch assignments
      const { data: assignments, error: aErr } = await supabase
        .from("assignments")
        .select("*")
        .eq("teacher_id", user!.id)
        .order("due_date", { ascending: false });
      if (aErr) throw aErr;

      // Fetch all submissions with grades for these assignments
      const assignmentIds = (assignments as DbAssignment[]).map((a) => a.id);
      let submissions: (DbSubmission & { grades: DbGrade[] })[] = [];
      if (assignmentIds.length > 0) {
        const { data: subs, error: subErr } = await supabase
          .from("submissions")
          .select("*, grades(*)")
          .in("assignment_id", assignmentIds);
        if (subErr) throw subErr;
        submissions = subs as any;
      }

      // Compute class period summaries
      const classPeriodSummaries = (periods as DbClassPeriod[]).map((cp) => {
        const countMap = (studentCounts as { class_period_id: string }[]).filter(
          (s) => s.class_period_id === cp.id
        );
        const periodAssignments = (assignments as DbAssignment[]).filter(
          (a) => a.class_period_id === cp.id
        );
        const pending = periodAssignments.filter((a) => a.status !== "completed").length;

        // Compute average grade from graded submissions
        const periodSubmissions = submissions.filter((s) =>
          periodAssignments.some((a) => a.id === s.assignment_id)
        );
        const gradedScores = periodSubmissions
          .flatMap((s) => s.grades.map((g) => g.score))
          .filter((s) => s != null);
        const avg = gradedScores.length > 0
          ? Math.round(gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length)
          : 0;

        return {
          period: cp.period,
          name: cp.name,
          subject: cp.subject,
          studentCount: countMap.length,
          averageGrade: avg,
          pendingAssignments: pending,
        };
      });

      // Build recent assignments list
      const recentAssignments = (assignments as DbAssignment[]).slice(0, 6).map((a) => {
        const subs = submissions.filter((s) => s.assignment_id === a.id);
        const cp = (periods as DbClassPeriod[]).find((p) => p.id === a.class_period_id);
        const totalStudents = cp
          ? (studentCounts as { class_period_id: string }[]).filter((s) => s.class_period_id === cp.id).length
          : 0;
        return {
          id: a.id,
          title: a.title,
          subject: a.subject,
          classPeriod: cp?.period ?? 0,
          dueDate: a.due_date,
          status: a.status,
          submissionCount: subs.length,
          totalStudents,
        };
      });

      return { classPeriods: classPeriodSummaries, recentAssignments };
    },
  });
}
