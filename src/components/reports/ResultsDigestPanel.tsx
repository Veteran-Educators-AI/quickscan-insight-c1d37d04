// =============================================================================
// RESULTS DIGEST PANEL
// =============================================================================
// What the class got wrong, per assignment, from the results Scholar sent.
// Every count is clickable: it opens the students behind that number.
// A blank is always "not attempted" and never counted as a wrong answer.
// =============================================================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardList, Eye, Sparkles, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useStudentNames } from '@/lib/StudentNameContext';
import {
  buildAssignmentDigests,
  CALL_LABEL,
  type AssignmentDigest,
  type ItemCall,
  type ItemDigest,
  type Mark,
  type ScanRow,
  type StudentDigest,
} from '@/lib/resultsDigest';

interface Props {
  classId: string;
  className?: string;
}

const callVariant: Record<ItemCall, 'destructive' | 'secondary' | 'default' | 'outline'> = {
  reteach: 'destructive',
  shaky: 'secondary',
  secure: 'default',
  unattempted: 'outline',
};

function CountButton({
  label,
  count,
  marks,
  tone,
}: {
  label: string;
  count: number;
  marks: { name: string; verbatim: string | null }[];
  tone: string;
}) {
  if (count === 0) {
    return (
      <span className="rounded border px-2 py-1 text-xs text-muted-foreground">
        {label} 0
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs font-medium hover:ring-2 hover:ring-ring ${tone}`}
        >
          {label} {count}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          {label} — {count} student{count === 1 ? '' : 's'}
        </p>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {marks.map((m, i) => (
            <div key={i} className="rounded border px-2 py-1 text-sm">
              <span className="font-medium">{m.name}</span>
              {m.verbatim ? <span className="text-muted-foreground"> — wrote “{m.verbatim}”</span> : null}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ItemRow({ item }: { item: ItemDigest }) {
  const marksFor = (mark: Mark) =>
    item.marks.filter((m) => m.mark === mark).map((m) => ({ name: m.name, verbatim: m.verbatim }));

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            Item {item.itemNumber}
            {item.skillTag ? <span className="text-muted-foreground"> — {item.skillTag}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.percentCorrect === null
              ? 'no attempts yet'
              : `${item.percentCorrect}% correct among the ${item.attempts} who tried`}
          </p>
        </div>
        <Badge variant={callVariant[item.call]}>{CALL_LABEL[item.call]}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <CountButton label="Correct" count={item.correct} marks={marksFor('correct')} tone="bg-emerald-500/10" />
        <CountButton label="Half" count={item.half} marks={marksFor('half')} tone="bg-amber-500/10" />
        <CountButton label="Wrong" count={item.wrong} marks={marksFor('wrong')} tone="bg-destructive/10" />
        <CountButton label="Blank (not attempted)" count={item.blank} marks={marksFor('blank')} tone="bg-muted" />
      </div>

      {item.wrongAnswers.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          They wrote: {item.wrongAnswers.slice(0, 5).map((w) => `“${w.text}”${w.count > 1 ? ` ×${w.count}` : ''}`).join(', ')}
        </p>
      )}
    </div>
  );
}

function StudentRow({ student }: { student: StudentDigest }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{student.name}</span>
          {student.isPaperRecord && <Badge variant="outline">unclaimed paper</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{student.correct} correct</Badge>
          {student.half > 0 && <Badge variant="secondary">{student.half} half</Badge>}
          {student.wrong > 0 && <Badge variant="destructive">{student.wrong} wrong</Badge>}
          {student.blank > 0 && <Badge variant="outline">{student.blank} not attempted</Badge>}
          {student.score !== null && <Badge>{Math.round(student.score)}%</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            <Eye className="mr-1 h-4 w-4" />
            {open ? 'Hide' : 'Items'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-1">
            {student.marks.map((m, i) => (
              <span
                key={i}
                className={`rounded border px-2 py-0.5 text-xs ${
                  m.mark === 'correct'
                    ? 'bg-emerald-500/10'
                    : m.mark === 'half'
                      ? 'bg-amber-500/10'
                      : m.mark === 'wrong'
                        ? 'bg-destructive/10'
                        : 'bg-muted'
                }`}
                title={m.verbatim || ''}
              >
                {i + 1}. {m.mark === 'blank' ? 'not attempted' : m.mark}
                {m.verbatim ? ` — “${m.verbatim}”` : ''}
              </span>
            ))}
          </div>
          {student.errorTags.length > 0 && (
            <p>
              <span className="font-medium">Error tags: </span>
              {student.errorTags.join(', ')}
            </p>
          )}
          {student.strengths.length > 0 && (
            <p>
              <span className="font-medium">Already good at: </span>
              {student.strengths.join(', ')}
            </p>
          )}
          {student.summary && <p className="text-muted-foreground">{student.summary}</p>}
        </div>
      )}
    </div>
  );
}

function DigestCard({
  digest,
  classId,
}: {
  digest: AssignmentDigest;
  classId: string;
}) {
  const navigate = useNavigate();
  const reteach = digest.items.filter((i) => i.call === 'reteach');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {digest.worksheetTitle}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{digest.worksheetCode}</span>
            </CardTitle>
            <CardDescription>
              {digest.papers} paper{digest.papers === 1 ? '' : 's'} in from {digest.studentCount} student
              {digest.studentCount === 1 ? '' : 's'}
              {digest.worksheetDate ? ` · ${format(new Date(digest.worksheetDate), 'EEE MMM d, yyyy')}` : ''}
              {digest.averageScore !== null ? ` · class average ${digest.averageScore}%` : ''}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() =>
              navigate(`/classes/${classId}/next-day-lesson?code=${encodeURIComponent(digest.worksheetCode)}`)
            }
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Next day's lesson
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Per item ({digest.itemCount})</TabsTrigger>
            <TabsTrigger value="tags">Error tags ({digest.tags.length})</TabsTrigger>
            <TabsTrigger value="students">Per student ({digest.students.length})</TabsTrigger>
            <TabsTrigger value="read">Read yourself ({digest.readTheseYourself.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-2 pt-3">
            {reteach.length > 0 && (
              <p className="text-sm">
                <span className="font-semibold text-destructive">Reteach: </span>
                items {reteach.map((i) => `${i.itemNumber} (${i.percentCorrect}%)`).join(', ')}
              </p>
            )}
            {digest.items.map((item) => (
              <ItemRow key={item.itemNumber} item={item} />
            ))}
          </TabsContent>

          <TabsContent value="tags" className="space-y-2 pt-3">
            {digest.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No error tags came through with these results.</p>
            ) : (
              digest.tags.map((tag) => (
                <Popover key={tag.tag}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:ring-2 hover:ring-ring"
                    >
                      <span className="font-medium">{tag.tag}</span>
                      <span className="text-muted-foreground">
                        {tag.studentCount} student{tag.studentCount === 1 ? '' : 's'}
                        {tag.items.length ? ` · items ${tag.items.join(', ')}` : ''}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{tag.tag}</p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {tag.studentNames.map((name, i) => (
                        <div key={i} className="rounded border px-2 py-1 text-sm">{name}</div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ))
            )}
          </TabsContent>

          <TabsContent value="students" className="space-y-2 pt-3">
            {digest.students.map((student) => (
              <StudentRow key={`${student.studentId}-${student.name}`} student={student} />
            ))}
          </TabsContent>

          <TabsContent value="read" className="space-y-2 pt-3">
            {digest.readTheseYourself.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here needs your eyes on the paper itself.</p>
            ) : (
              digest.readTheseYourself.map((s) => (
                <div key={s.studentId + s.name} className="rounded-lg border p-3 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground"> — {s.reason}</span>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function ResultsDigestPanel({ classId, className }: Props) {
  const { getDisplayName } = useStudentNames();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['results-digest', classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paper_scan_results' as any)
        .select('*, students:student_id(id, first_name, last_name, email)')
        .eq('class_id', classId)
        .order('scanned_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ScanRow[];
    },
    enabled: !!classId,
  });

  const digests = useMemo(
    () => (rows?.length ? buildAssignmentDigests(rows, getDisplayName) : []),
    [rows, getDisplayName]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results digest</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading results…</CardContent>
      </Card>
    );
  }

  if (digests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Results digest
          </CardTitle>
          <CardDescription>
            No results have come in for {className || 'this class'} yet. As soon as scored papers arrive they appear
            here, item by item — nothing is generated from guesses.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {digests.map((digest) => (
        <DigestCard key={digest.worksheetCode} digest={digest} classId={classId} />
      ))}
    </div>
  );
}
