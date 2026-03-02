import { useState, useRef } from 'react';
import { Printer, Loader2, AlertTriangle, CheckCircle2, Target, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { BatchItem } from '@/hooks/useBatchAnalysis';

interface PrintStudentErrorReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BatchItem[];
  assignmentName?: string;
}

export function PrintStudentErrorReport({
  open,
  onOpenChange,
  items,
  assignmentName = 'Assignment',
}: PrintStudentErrorReportProps) {
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showGrade, setShowGrade] = useState(true);
  const [showMisconceptions, setShowMisconceptions] = useState(true);
  const [showFeedback, setShowFeedback] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const completedItems = items.filter(
    (item) => item.status === 'completed' && item.result
  );

  // Initialize selection when dialog opens
  const prevOpen = useRef(open);
  if (open && !prevOpen.current) {
    setSelectedStudents(new Set(completedItems.map((_, i) => String(i))));
    setShowPreview(false);
  }
  prevOpen.current = open;

  const toggleStudent = (idx: string) => {
    const next = new Set(selectedStudents);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedStudents(next);
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 90) return '#16a34a';
    if (grade >= 80) return '#2563eb';
    if (grade >= 70) return '#ca8a04';
    return '#ea580c';
  };

  const handlePrint = () => {
    if (selectedStudents.size === 0) return;
    setShowPreview(true);
    setTimeout(() => window.print(), 200);
  };

  const selectedItems = completedItems.filter((_, i) => selectedStudents.has(String(i)));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Print Student Error Reports
            </DialogTitle>
            <DialogDescription>
              Give students a printout showing where they went wrong and how to improve
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Options */}
            <div className="flex flex-wrap gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Switch checked={showGrade} onCheckedChange={setShowGrade} id="show-grade" />
                <Label htmlFor="show-grade" className="text-sm">Show Grade</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showMisconceptions} onCheckedChange={setShowMisconceptions} id="show-misc" />
                <Label htmlFor="show-misc" className="text-sm">Show Errors</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showFeedback} onCheckedChange={setShowFeedback} id="show-feedback" />
                <Label htmlFor="show-feedback" className="text-sm">Show Feedback</Label>
              </div>
            </div>

            {/* Student List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Students ({selectedStudents.size}/{completedItems.length})</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedStudents(new Set(completedItems.map((_, i) => String(i))))}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedStudents(new Set())}>
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[300px] border rounded-md">
                <div className="divide-y">
                  {completedItems.map((item, i) => {
                    const idx = String(i);
                    const grade = item.result?.grade ?? 0;
                    const misconceptions = item.result?.misconceptions ?? [];
                    return (
                      <div key={idx} className={`p-3 ${selectedStudents.has(idx) ? 'bg-primary/5' : ''}`}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedStudents.has(idx)}
                            onCheckedChange={() => toggleStudent(idx)}
                          />
                          <span className="text-sm font-medium flex-1">{item.studentName || `Paper ${i + 1}`}</span>
                          <Badge variant="outline" style={{ color: getGradeColor(grade) }}>
                            {grade}%
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {misconceptions.length} error{misconceptions.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handlePrint} disabled={selectedStudents.size === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print {selectedStudents.size} Report{selectedStudents.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview */}
      {showPreview && (
        <div className="fixed inset-0 bg-white z-50 overflow-auto print:static print:overflow-visible">
          <div className="print:hidden p-4 bg-muted border-b flex items-center justify-between">
            <p>Print preview — press Ctrl+P or Cmd+P to print</p>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close Preview</Button>
          </div>

          {selectedItems.map((item, idx) => {
            const result = item.result!;
            const grade = result.grade ?? 0;
            const misconceptions = result.misconceptions ?? [];
            const whatWrong = result.whatStudentGotWrong ?? '';
            const whatRight = result.whatStudentDidCorrectly ?? '';
            const feedback = result.feedback ?? '';
            const rubricScores = result.rubricScores ?? [];

            return (
              <div
                key={idx}
                className="print-error-report p-8 max-w-[8in] mx-auto"
                style={{ pageBreakAfter: 'always' }}
              >
                {/* Header */}
                <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                        Error Analysis Report
                      </h1>
                      <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0' }}>
                        {assignmentName}
                      </p>
                    </div>
                    {showGrade && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontSize: '36px', fontWeight: 'bold',
                          color: getGradeColor(grade),
                        }}>
                          {grade}%
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                    <p style={{ fontSize: '14px' }}>
                      <strong>Student:</strong> {item.studentName || 'Unknown'}
                    </p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      Date: {new Date().toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* What You Did Well */}
                {whatRight && (
                  <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #bbf7d0', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#16a34a', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✅ What You Did Well
                    </h2>
                    <p style={{ fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{whatRight}</p>
                  </div>
                )}

                {/* Errors / Misconceptions */}
                {showMisconceptions && misconceptions.length > 0 && (
                  <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #fed7aa', borderRadius: '8px', backgroundColor: '#fff7ed' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#ea580c', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ Where You Made Mistakes ({misconceptions.length})
                    </h2>
                    <ol style={{ margin: 0, paddingLeft: '20px' }}>
                      {misconceptions.map((m, i) => {
                        const clean = m.replace(/^ERROR_LOCATION:\s*\w+-\w+\s*\|\s*/i, '');
                        return (
                          <li key={i} style={{ fontSize: '13px', marginBottom: '8px', lineHeight: '1.5' }}>
                            {clean}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* What Needs Improvement */}
                {whatWrong && (
                  <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #fde68a', borderRadius: '8px', backgroundColor: '#fffbeb' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#ca8a04', margin: '0 0 8px' }}>
                      📝 What Needs Improvement
                    </h2>
                    <p style={{ fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{whatWrong}</p>
                  </div>
                )}

                {/* Rubric Breakdown */}
                {rubricScores.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 8px' }}>
                      📊 Rubric Breakdown
                    </h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb' }}>Criterion</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', width: '80px' }}>Score</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb' }}>Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rubricScores.map((rs, i) => (
                          <tr key={i}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>{rs.criterion}</td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontWeight: 'bold', color: rs.score >= rs.maxScore ? '#16a34a' : rs.score > 0 ? '#ca8a04' : '#dc2626' }}>
                              {rs.score}/{rs.maxScore}
                            </td>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#666' }}>{rs.feedback}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Feedback & Next Steps */}
                {showFeedback && feedback && (
                  <div style={{ marginBottom: '16px', padding: '12px', border: '1px solid #bfdbfe', borderRadius: '8px', backgroundColor: '#eff6ff' }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#2563eb', margin: '0 0 8px' }}>
                      💡 How to Improve
                    </h2>
                    <p style={{ fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{feedback}</p>
                  </div>
                )}

                {/* Correction space */}
                <div style={{ marginTop: '24px', borderTop: '1px dashed #d1d5db', paddingTop: '16px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 8px' }}>
                    ✏️ Corrections (redo the problems you missed)
                  </h2>
                  <div style={{ minHeight: '120px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>
                    {/* Blank space for student to redo work */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-error-report, .print-error-report * { visibility: visible; }
          .print-error-report { position: relative; }
          @page { margin: 0.5in; }
        }
      `}</style>
    </>
  );
}
