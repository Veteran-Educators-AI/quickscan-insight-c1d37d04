// =============================================================================
// LESSON PACKS
// =============================================================================
// Tomorrow's (and yesterday's) downloadable lesson pack per class, saved in
// lesson_packs so the home page can show it instantly, say when it is still
// generating, and remember what was distributed and when.
// Every number in a pack comes from results actually received. A class with no
// results gets a calendar-only pack and no invented figures.
// =============================================================================

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';
import {
  buildAssignmentDigests,
  digestForGenerator,
  CALL_LABEL,
  type AssignmentDigest,
  type ScanRow,
} from '@/lib/resultsDigest';
import { verifyItems } from '@/lib/nextDayLesson/verifyMath';
import { buildGrouping } from '@/lib/nextDayLesson/grouping';
import type { NextDayDraft } from '@/lib/nextDayLesson/types';
import { isoDate, nextSchoolDay, positionFor, previousSchoolDay } from '@/data/pacingCalendars';

export type PackStatus = 'generating' | 'ready' | 'calendar_only' | 'failed' | 'distributed';

export interface LessonPackRow {
  id: string;
  teacher_id: string;
  class_id: string;
  pack_date: string;
  day_number: number | null;
  lesson_title: string | null;
  status: PackStatus;
  source_worksheet_code: string | null;
  source_worksheet_title: string | null;
  source_worksheet_date: string | null;
  papers: number;
  student_count: number;
  what_this_fixes: string | null;
  draft: NextDayDraft | null;
  error_message: string | null;
  distribution: {
    printedAt?: string;
    scholarPushedAt?: string;
    scholarNote?: string;
    boardReadyAt?: string;
  } | null;
  distributed_at: string | null;
}

export interface TaughtClass {
  id: string;
  name: string;
  join_code: string | null;
  class_period: string | null;
}

/** One line the teacher can read at a glance: what tomorrow's pack repairs. */
export function whatThisFixes(digest: AssignmentDigest): string {
  const reteach = digest.items.filter((i) => i.call === 'reteach');
  const shaky = digest.items.filter((i) => i.call === 'shaky');
  const topTag = digest.tags[0];
  if (reteach.length > 0) {
    return `Repairs item${reteach.length === 1 ? '' : 's'} ${reteach
      .map((i) => `${i.itemNumber} (${i.percentCorrect}%)`)
      .join(', ')} from ${digest.worksheetTitle}${
      topTag ? ` — ${topTag.tag} hit ${topTag.studentCount} student${topTag.studentCount === 1 ? '' : 's'}` : ''
    }.`;
  }
  if (shaky.length > 0) {
    return `No item fell below 40%; tightens the shaky ones — item${shaky.length === 1 ? '' : 's'} ${shaky
      .map((i) => `${i.itemNumber} (${i.percentCorrect}%)`)
      .join(', ')} from ${digest.worksheetTitle}.`;
  }
  const first = digest.items[0];
  return first
    ? `${digest.worksheetTitle}: every item ${CALL_LABEL[first.call].toLowerCase()} — the pack moves the class on.`
    : `Built from ${digest.worksheetTitle}.`;
}

export function packDates() {
  const today = new Date();
  return {
    next: isoDate(nextSchoolDay(today)),
    previous: isoDate(previousSchoolDay(nextSchoolDay(today))),
  };
}

export function useLessonPacks() {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const queryClient = useQueryClient();
  const dates = useMemo(packDates, []);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['pack-classes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, join_code, class_period')
        .eq('teacher_id', user!.id)
        .is('archived_at', null)
        .order('class_period', { ascending: true });
      if (error) throw error;
      return (data || []) as TaughtClass[];
    },
    enabled: !!user?.id,
  });

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['lesson-packs', user?.id, dates.next, dates.previous],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_packs' as any)
        .select('*')
        .eq('teacher_id', user!.id)
        .in('pack_date', [dates.next, dates.previous]);
      if (error) throw error;
      const rows = (data || []) as unknown as LessonPackRow[];
      const classIds = Array.from(new Set(rows.map((pack) => pack.class_id).filter(Boolean)));
      if (classIds.length === 0) return rows;

      const { data: rosterRows, error: rosterError } = await supabase
        .from('students')
        .select('id, class_id, first_name, last_name, archived_at')
        .in('class_id', classIds)
        .is('archived_at', null);
      if (rosterError) throw rosterError;

      const realNameById = new Map(
        (rosterRows || []).map((student: any) => [student.id, `${student.first_name || ''} ${student.last_name || ''}`.trim()])
      );
      return rows.map((pack) => {
        if (!pack.draft) return pack;
        const grouping = pack.draft.grouping;
        return {
          ...pack,
          draft: {
            ...pack.draft,
            dayNumber: pack.draft.dayNumber ?? pack.day_number,
            grouping: {
              ...grouping,
              groups: grouping.groups.map((group) => ({
                ...group,
                students: group.students.map((student) => ({
                  ...student,
                  realName: realNameById.get(student.studentId) || student.realName,
                })),
              })),
              noResultsYet: grouping.noResultsYet.map((student) => ({
                ...student,
                realName: realNameById.get(student.studentId) || student.realName,
              })),
            },
          },
        };
      });
    },
    enabled: !!user?.id,
    refetchInterval: 20000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['lesson-packs'] });
  }, [queryClient]);

  const upsertPack = useCallback(
    async (patch: Record<string, any>) => {
      const { data, error } = await supabase
        .from('lesson_packs' as any)
        .upsert({ teacher_id: user!.id, ...patch }, { onConflict: 'teacher_id,class_id,pack_date' })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as LessonPackRow;
    },
    [user?.id]
  );

  /** Build a class's pack for one date, only from results actually received. */
  const build = useMutation({
    mutationFn: async (input: {
      klass: TaughtClass;
      packDate: string;
      lessonTitleOverride?: string;
      dayNumberOverride?: number | null;
    }) => {
      const { klass, packDate } = input;
      const position = positionFor(klass.join_code, klass.name, packDate);
      const dayNumber = input.dayNumberOverride ?? position.dayNumber;
      const lessonTitle =
        input.lessonTitleOverride || position.title || `${position.unitLabel || klass.name} — next lesson`;

      await upsertPack({
        class_id: klass.id,
        pack_date: packDate,
        status: 'generating',
        day_number: dayNumber,
        lesson_title: lessonTitle,
        error_message: null,
      });
      invalidate();

      try {
        const [{ data: scanRows, error: scanError }, { data: rosterRows, error: rosterError }] = await Promise.all([
          supabase
            .from('paper_scan_results' as any)
            .select('*, students:student_id(id, first_name, last_name, email)')
            .eq('class_id', klass.id)
            .order('scanned_at', { ascending: false }),
          supabase.from('students').select('id, first_name, last_name, archived_at').eq('class_id', klass.id),
        ]);
        if (scanError) throw scanError;
        if (rosterError) throw rosterError;

        const rows = (scanRows || []) as unknown as ScanRow[];
        const digests = rows.length ? buildAssignmentDigests(rows, getDisplayName) : [];
        // Results with no item detail can't teach us anything — treat as no results.
        const digest = digests.filter((d) => d.items.length > 0)[0];

        // No results in: calendar lesson only, no invented numbers.
        if (!digest) {
          const row = await upsertPack({
            class_id: klass.id,
            pack_date: packDate,
            status: 'calendar_only',
            day_number: dayNumber,
            lesson_title: lessonTitle,
            papers: 0,
            student_count: 0,
            what_this_fixes: null,
            draft: null,
            source_worksheet_code: null,
            source_worksheet_title: null,
            source_worksheet_date: null,
          });
          invalidate();
          return row;
        }

        const dateLabel = new Date(`${packDate}T12:00:00`).toDateString();
        const { data, error } = await supabase.functions.invoke('generate-next-day-lesson', {
          body: {
            digest: digestForGenerator(digest),
            classContext: {
              className: klass.name,
              subject: position.courseLabel || 'Mathematics',
              unit: `${position.unitLabel || ''}${dayNumber ? ` — Day ${dayNumber}` : ''}`.trim(),
              standards: position.standards,
              nextLessonTitle: lessonTitle,
              nextLessonDate: dateLabel,
            },
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        const generated = (data as any).draft;

        const mapItem = (i: any, index: number, isExit: boolean) => ({
          itemNumber: Number(i.itemNumber ?? index + 1),
          prompt: String(i.prompt || ''),
          answer: String(i.answer ?? i.answerNumeric ?? ''),
          answerNumeric: typeof i.answerNumeric === 'number' ? i.answerNumeric : Number(i.answerNumeric) || null,
          verify: String(i.verify || ''),
          verifyExpected:
            typeof i.verifyExpected === 'number' ? i.verifyExpected : Number(i.verifyExpected) || null,
          skillTag: i.skillTag || null,
          isRepair: isExit ? false : !!i.isRepair,
          errorTagIfWrong: String(i.errorTagIfWrong || ''),
          workedSolution: i.workedSolution || '',
        });

        const worksheetItems = verifyItems((generated.worksheet?.items || []).map((i: any, x: number) => mapItem(i, x, false)));
        const exitItems = verifyItems((generated.exitTicket?.items || []).map((i: any, x: number) => mapItem(i, x, true)));

        const roster = (rosterRows || [])
          .filter((s: any) => !s.archived_at)
          .map((s: any) => ({
            id: s.id,
            name: getDisplayName(s.id, s.first_name || '', s.last_name || ''),
            realName: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
          }));

        const draft: NextDayDraft = {
          classId: klass.id,
          className: klass.name,
          builtFrom: {
            className: klass.name,
            worksheetCode: digest.worksheetCode,
            worksheetTitle: digest.worksheetTitle,
            worksheetDate: digest.worksheetDate,
            papers: digest.papers,
            studentCount: digest.studentCount,
            generatedAt: new Date().toISOString(),
          },
          lessonPlan: {
            title: generated.lessonPlan?.title || lessonTitle,
            aim: generated.lessonPlan?.aim || '',
            objective: generated.lessonPlan?.objective || '',
            standards: generated.lessonPlan?.standards || position.standards,
            durationMinutes: Number(generated.lessonPlan?.durationMinutes) || 45,
            builtFrom: generated.lessonPlan?.builtFrom || '',
            timeline: generated.lessonPlan?.timeline || [],
            reteach: {
              summary: generated.lessonPlan?.reteach?.summary || '',
              items: generated.lessonPlan?.reteach?.items || [],
              script: generated.lessonPlan?.reteach?.script || [],
            },
            materials: generated.lessonPlan?.materials || [],
            differentiationNotes: generated.lessonPlan?.differentiationNotes || [],
            assessmentNote: generated.lessonPlan?.assessmentNote || '',
          },
          slides: (generated.slides || []).map((s: any, index: number) => ({
            slideNumber: Number(s.slideNumber ?? index + 1),
            kind: s.kind || 'teaching',
            title: String(s.title || ''),
            bullets: Array.isArray(s.bullets) ? s.bullets.map((b: any) => String(b)) : [],
            speakerNotes: String(s.speakerNotes || ''),
          })),
          worksheet: {
            title: generated.worksheet?.title || lessonTitle,
            instructions: generated.worksheet?.instructions || '',
            items: worksheetItems,
          },
          exitTicket: { title: generated.exitTicket?.title || 'Exit ticket', items: exitItems },
          grouping: buildGrouping(digest, worksheetItems, roster),
          nextLessonTitle: lessonTitle,
          nextLessonDate: dateLabel,
          dayNumber,
        };

        const row = await upsertPack({
          class_id: klass.id,
          pack_date: packDate,
          status: 'ready',
          day_number: dayNumber,
          lesson_title: lessonTitle,
          source_worksheet_code: digest.worksheetCode,
          source_worksheet_title: digest.worksheetTitle,
          source_worksheet_date: digest.worksheetDate ? digest.worksheetDate.slice(0, 10) : null,
          papers: digest.papers,
          student_count: digest.studentCount,
          what_this_fixes: whatThisFixes(digest),
          draft: draft as any,
        });
        invalidate();
        return row;
      } catch (error) {
        await upsertPack({
          class_id: klass.id,
          pack_date: packDate,
          status: 'failed',
          day_number: dayNumber,
          lesson_title: lessonTitle,
          error_message: error instanceof Error ? error.message : 'Could not build the pack',
        });
        invalidate();
        throw error;
      }
    },
  });

  const recordDistribution = useMutation({
    mutationFn: async (input: { packId: string; distribution: LessonPackRow['distribution'] }) => {
      const { error } = await supabase
        .from('lesson_packs' as any)
        .update({
          status: 'distributed',
          distributed_at: new Date().toISOString(),
          distribution: input.distribution as any,
        })
        .eq('id', input.packId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const packFor = useCallback(
    (classId: string, packDate: string) => packs.find((p) => p.class_id === classId && p.pack_date === packDate) || null,
    [packs]
  );

  return {
    classes,
    packs,
    packFor,
    dates,
    isLoading: classesLoading || packsLoading,
    build,
    recordDistribution,
    invalidate,
  };
}
