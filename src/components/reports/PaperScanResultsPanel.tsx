import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, FileScan } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStudentNames } from '@/lib/StudentNameContext';

interface PaperScanResultRow {
  id: string;
  student_id: string;
  class_id: string | null;
  topic_name: string;
  standard_code: string | null;
  activity_name: string | null;
  score: number | null;
  items_correct: number | null;
  items_attempted: number | null;
  item_marks: any;
  evidence: any;
  strengths: any;
  weak_skill_tags: string[] | null;
  summary: string | null;
  scanned_at: string | null;
  created_at: string;
  students?: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface Props {
  /** Show every paper scan for a class */
  classId?: string;
  /** Show paper scans for a single student */
  studentId?: string;
  title?: string;
}

const toList = (value: any): any[] => (Array.isArray(value) ? value : value ? [value] : []);

const itemLabel = (item: any, index: number): string => {
  const number = item?.questionNumber ?? item?.item_number ?? item?.number ?? index + 1;
  return `Item ${number}`;
};

const itemText = (item: any): string =>
  item?.question || item?.prompt || item?.skill || item?.topic || '';

const itemMark = (item: any): string => {
  if (item?.points_earned !== undefined && item?.points_possible !== undefined) {
    return `${item.points_earned}/${item.points_possible}`;
  }
  if (item?.isCorrect !== undefined) return item.isCorrect ? 'Correct' : 'Incorrect';
  if (item?.correct !== undefined) return item.correct ? 'Correct' : 'Incorrect';
  if (item?.mark !== undefined) return String(item.mark);
  return '—';
};

export function PaperScanResultsPanel({ classId, studentId, title }: Props) {
  const { getDisplayName } = useStudentNames();
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const { data: results, isLoading } = useQuery({
    queryKey: ['paper-scan-results', classId, studentId],
    queryFn: async () => {
      let query = supabase
        .from('paper_scan_results' as any)
        .select('*, students:student_id(id, first_name, last_name)')
        .order('scanned_at', { ascending: false });

      if (studentId) query = query.eq('student_id', studentId);
      if (classId) query = query.eq('class_id', classId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as PaperScanResultRow[];
    },
    enabled: !!classId || !!studentId,
  });

  const rows = useMemo(() => results || [], [results]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title || 'Scanned paper results'}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileScan className="h-4 w-4" />
          {title || 'Scanned paper results'}
        </CardTitle>
        <CardDescription>
          Item-by-item marks sent over from Scholar for work completed on paper.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scanned paper results yet.</p>
        ) : (
          rows.map((row) => {
            const items = toList(row.item_marks);
            const evidence = toList(row.evidence);
            const strengths = toList(row.strengths);
            const weak = row.weak_skill_tags || [];
            const name = row.students
              ? getDisplayName(row.students.id, row.students.first_name || '', row.students.last_name || '')
              : '';
            const isOpen = !!openIds[row.id];

            return (
              <Collapsible
                key={row.id}
                open={isOpen}
                onOpenChange={(v) => setOpenIds((prev) => ({ ...prev, [row.id]: v }))}
              >
                <div className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {row.activity_name || row.topic_name}
                        {!studentId && name ? ` — ${name}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.topic_name}
                        {row.standard_code ? ` · ${row.standard_code}` : ''}
                        {row.scanned_at ? ` · ${format(new Date(row.scanned_at), 'MMM d, yyyy')}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.items_attempted !== null && (
                        <Badge variant="outline">
                          {row.items_correct ?? 0}/{row.items_attempted} items
                        </Badge>
                      )}
                      {row.score !== null && (
                        <Badge variant={row.score >= 70 ? 'default' : 'destructive'}>
                          {Math.round(Number(row.score))}%
                        </Badge>
                      )}
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Details
                          <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <CollapsibleContent className="mt-3 space-y-3">
                    {row.summary && <p className="text-sm">{row.summary}</p>}

                    {items.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Item marks</p>
                        <div className="space-y-1">
                          {items.map((item, index) => (
                            <div
                              key={index}
                              className="flex items-start justify-between gap-3 rounded border px-2 py-1 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="font-medium">{itemLabel(item, index)}</span>
                                {itemText(item) ? <span className="text-muted-foreground"> — {itemText(item)}</span> : null}
                              </span>
                              <span className="shrink-0 text-muted-foreground">{itemMark(item)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Strengths</p>
                        <ul className="list-disc pl-5 text-sm">
                          {strengths.map((s, i) => (
                            <li key={i}>{typeof s === 'string' ? s : s?.text || s?.skill || JSON.stringify(s)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {weak.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Weak skills</p>
                        <div className="flex flex-wrap gap-1">
                          {weak.map((tag, i) => (
                            <Badge key={i} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {evidence.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Evidence</p>
                        <ul className="list-disc pl-5 text-sm">
                          {evidence.map((e, i) => (
                            <li key={i}>{typeof e === 'string' ? e : e?.text || e?.note || JSON.stringify(e)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
