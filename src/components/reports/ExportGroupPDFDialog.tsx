import { useState, useEffect } from 'react';
import { Download, Loader2, FileText, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { fixEncodingCorruption, renderMathText, sanitizeForPDF } from '@/lib/mathRenderer';
import { generateQRCodePngDataUrl, generateStudentQuestionQRData, QR_PRINT_RENDER_SIZE } from '@/lib/qrCodeUtils';

const formatPdfMathText = (text: string) => sanitizeForPDF(renderMathText(fixEncodingCorruption(text)));

// Generate QR code as PNG data URL for PDF embedding
const generateQRCodeDataUrl = async (
  studentId: string,
  worksheetId: string,
  size: number = QR_PRINT_RENDER_SIZE
): Promise<string> => {
  const renderSize = Math.max(size, QR_PRINT_RENDER_SIZE);
  return generateQRCodePngDataUrl(generateStudentQuestionQRData(studentId, worksheetId), renderSize);
};

interface Student {
  studentId: string;
  studentName: string;
  overallMastery: number;
  topics: { topicId: string; avgScore: number }[];
}

interface WeakTopic {
  topicId: string;
  topicName: string;
  avgScore: number;
}

interface Question {
  id: string;
  jmap_id: string | null;
  prompt_text: string | null;
  prompt_image_url: string | null;
  topicId: string;
  topicName?: string;
  difficulty: number;
}

interface ExportGroupPDFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupLabel: string;
  groupLevel: string;
  students: Student[];
  weakTopics: WeakTopic[];
}

export function ExportGroupPDFDialog({
  open,
  onOpenChange,
  groupLabel,
  groupLevel,
  students,
  weakTopics,
}: ExportGroupPDFDialogProps) {
  const { user } = useAuth();

  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [personalizeByWeakness, setPersonalizeByWeakness] = useState(true);
  const [maxQuestionsPerStudent, setMaxQuestionsPerStudent] = useState(5);

  useEffect(() => {
    if (open) {
      fetchQuestionsForTopics();
      setSelectedStudents(new Set(students.map(s => s.studentId)));
    }
  }, [open, students, weakTopics]);

  async function fetchQuestionsForTopics() {
    if (!user || weakTopics.length === 0) {
      setQuestions([]);
      return;
    }

    setLoading(true);
    try {
      const weakTopicIds = weakTopics.map(t => t.topicId);

      const { data: questionTopics, error: qtError } = await supabase
        .from('question_topics')
        .select(`
          question_id,
          topic_id,
          questions!inner(id, jmap_id, prompt_text, prompt_image_url, difficulty, teacher_id),
          topics!inner(name)
        `)
        .in('topic_id', weakTopicIds)
        .eq('questions.teacher_id', user.id);

      if (qtError) throw qtError;

      // Format questions with topic info
      const questionList: Question[] = [];
      const seen = new Set<string>();
      
      questionTopics?.forEach(qt => {
        const q = qt.questions as any;
        const t = qt.topics as any;
        if (q && !seen.has(q.id)) {
          seen.add(q.id);
          questionList.push({
            id: q.id,
            jmap_id: q.jmap_id,
            prompt_text: q.prompt_text,
            prompt_image_url: q.prompt_image_url,
            topicId: qt.topic_id,
            topicName: t?.name || 'Unknown',
            difficulty: q.difficulty || 1,
          });
        }
      });

      // Sort by difficulty (easier first for remediation)
      questionList.sort((a, b) => a.difficulty - b.difficulty);
      setQuestions(questionList);
    } catch (error) {
      console.error('Error fetching questions:', error);
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  }

  const toggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const selectAllStudents = () => {
    setSelectedStudents(new Set(students.map(s => s.studentId)));
  };

  const deselectAllStudents = () => {
    setSelectedStudents(new Set());
  };

  // Get personalized questions for a specific student
  const getQuestionsForStudent = (student: Student): Question[] => {
    if (!personalizeByWeakness) {
      // Same questions for everyone
      return questions.slice(0, maxQuestionsPerStudent);
    }

    // Find this student's weakest topics
    const studentWeakTopics = student.topics
      .filter(t => weakTopics.some(wt => wt.topicId === t.topicId))
      .sort((a, b) => a.avgScore - b.avgScore);

    // Prioritize questions from student's weakest topics
    const prioritizedQuestions: Question[] = [];
    const usedQuestionIds = new Set<string>();

    // First, add questions from student's weakest topics
    for (const topic of studentWeakTopics) {
      const topicQuestions = questions.filter(
        q => q.topicId === topic.topicId && !usedQuestionIds.has(q.id)
      );
      for (const q of topicQuestions) {
        if (prioritizedQuestions.length >= maxQuestionsPerStudent) break;
        prioritizedQuestions.push(q);
        usedQuestionIds.add(q.id);
      }
      if (prioritizedQuestions.length >= maxQuestionsPerStudent) break;
    }

    // Fill remaining slots with other questions
    if (prioritizedQuestions.length < maxQuestionsPerStudent) {
      for (const q of questions) {
        if (prioritizedQuestions.length >= maxQuestionsPerStudent) break;
        if (!usedQuestionIds.has(q.id)) {
          prioritizedQuestions.push(q);
          usedQuestionIds.add(q.id);
        }
      }
    }

    return prioritizedQuestions;
  };

  const generatePDF = async () => {
    const selectedStudentsList = students.filter(s => selectedStudents.has(s.studentId));
    
    if (selectedStudentsList.length === 0) {
      toast.error('Please select at least one student');
      return;
    }

    if (questions.length === 0) {
      toast.error('No questions available for export');
      return;
    }

    setExporting(true);
    setExportProgress(0);

    try {
      const pdf = new jsPDF('p', 'mm', 'letter');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      // Use proper margins: 19mm (0.75 inch) for left/right, 15mm for top/bottom
      const marginLeft = 19;
      const marginRight = 19;
      const marginTop = 15;
      const marginBottom = 15;
      const contentWidth = pageWidth - marginLeft - marginRight;

      for (let i = 0; i < selectedStudentsList.length; i++) {
        const student = selectedStudentsList[i];
        const studentQuestions = getQuestionsForStudent(student);
        
        // Update progress
        setExportProgress(Math.round(((i + 1) / selectedStudentsList.length) * 100));

        // Add new page for each student (except first)
        if (i > 0) {
          pdf.addPage();
        }

        let yPosition = marginTop;

        // Header
        pdf.setFontSize(18);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Remediation - ${groupLabel}`, marginLeft, yPosition);
        yPosition += 8;

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Name: ${student.studentName}`, marginLeft, yPosition);
        
        // Add small QR code next to student name
        try {
          const worksheetId = `rem_${groupLabel.replace(/\s+/g, '_')}_${Date.now()}`;
          const qrDataUrl = await generateQRCodeDataUrl(student.studentId, worksheetId);
          const qrSize = 12; // smaller QR for header
          const nameWidth = pdf.getTextWidth(`Name: ${student.studentName}`);
          pdf.addImage(qrDataUrl, 'PNG', marginLeft + nameWidth + 3, yPosition - 8, qrSize, qrSize);
        } catch (qrError) {
          console.error('Error generating header QR code:', qrError);
        }
        
        yPosition += 6;
        pdf.text(`Performance: ${student.overallMastery}%`, marginLeft, yPosition);
        yPosition += 6;

        // Date line
        pdf.text('Date: _______________', pageWidth - marginRight - 50, yPosition - 12);
        pdf.text('Period: ____________', pageWidth - marginRight - 50, yPosition - 6);

        // Divider
        yPosition += 4;
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.5);
        pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
        yPosition += 8;

        // Personalized weak topics for this student
        if (personalizeByWeakness) {
          const studentWeakTopicNames = student.topics
            .filter(t => weakTopics.some(wt => wt.topicId === t.topicId))
            .sort((a, b) => a.avgScore - b.avgScore)
            .slice(0, 3)
            .map(t => {
              const topic = weakTopics.find(wt => wt.topicId === t.topicId);
              return topic?.topicName || 'Unknown';
            });

          if (studentWeakTopicNames.length > 0) {
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'italic');
            pdf.text(`Focus areas: ${studentWeakTopicNames.join(', ')}`, marginLeft, yPosition);
            yPosition += 8;
          }
        }

        // Questions
        for (let qIdx = 0; qIdx < studentQuestions.length; qIdx++) {
          const question = studentQuestions[qIdx];

          // Check if we need a new page
          if (yPosition > pageHeight - marginBottom - 60) {
            pdf.addPage();
            yPosition = marginTop;
          }

          // Question number
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`${qIdx + 1}.`, marginLeft, yPosition);

          // Topic badge
          if (question.topicName) {
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'italic');
            pdf.text(`[${question.topicName}]`, marginLeft + 10, yPosition);
          }

          // JMAP ID if available
          if (question.jmap_id) {
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`(${question.jmap_id})`, pageWidth - marginRight - 20, yPosition);
          }

          yPosition += 6;

          // Question text
          if (question.prompt_text) {
            pdf.setFontSize(10); // Slightly smaller for better fit
            pdf.setFont('helvetica', 'normal');
            // Apply encoding fix and sanitization before PDF rendering
            const sanitizedPrompt = formatPdfMathText(question.prompt_text);
            // Use 90% of content width for proper text wrapping
            const maxTextWidth = contentWidth * 0.9;
            const textLines = pdf.splitTextToSize(sanitizedPrompt, maxTextWidth);
            textLines.forEach((line: string) => {
              pdf.text(line, marginLeft + 8, yPosition);
              yPosition += 5;
            });
            pdf.setFontSize(11); // Reset
          }

          yPosition += 4;

          // Answer box
          const boxHeight = 35;
          pdf.setDrawColor(180);
          pdf.setLineWidth(0.3);
          pdf.rect(marginLeft, yPosition, contentWidth, boxHeight);
          
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          pdf.text('Show your work:', marginLeft + 3, yPosition + 5);
          pdf.setTextColor(0);

          yPosition += boxHeight + 10;
        }

        // Footer
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(
          `${student.studentName} | ${groupLabel} | Page ${i + 1} of ${selectedStudentsList.length}`,
          marginLeft,
          pageHeight - marginBottom
        );
        pdf.setTextColor(0);
      }

      // Save the PDF
      const fileName = `Remediation_${groupLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast.success(`Exported ${selectedStudentsList.length} personalized worksheet${selectedStudentsList.length !== 1 ? 's' : ''}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const canExport = selectedStudents.size > 0 && questions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Personalized PDFs - {groupLabel}
          </DialogTitle>
          <DialogDescription>
            Generate personalized worksheets targeting each student's specific weak areas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Weak Topics Summary */}
          <div className="bg-muted/50 rounded-lg p-3">
            <Label className="text-sm font-medium">Group Weak Topics:</Label>
            <div className="flex flex-wrap gap-1 mt-2">
              {weakTopics.map(topic => (
                <Badge key={topic.topicId} variant="secondary" className="text-xs">
                  {topic.topicName} ({topic.avgScore}%)
                </Badge>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-4 p-3 bg-primary/5 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                id="personalize"
                checked={personalizeByWeakness}
                onCheckedChange={(checked) => setPersonalizeByWeakness(checked as boolean)}
              />
              <Label htmlFor="personalize" className="text-sm cursor-pointer">
                Personalize questions by student weakness
              </Label>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm">Questions per student:</Label>
              <select
                value={maxQuestionsPerStudent}
                onChange={(e) => setMaxQuestionsPerStudent(Number(e.target.value))}
                className="text-sm border rounded px-2 py-1"
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={7}>7</option>
                <option value={10}>10</option>
              </select>
            </div>
          </div>

          {/* Students Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Students ({selectedStudents.size}/{students.length})
              </Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllStudents}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllStudents}>
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="h-48 border rounded-md p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                students.map((student) => {
                  const studentQuestionCount = getQuestionsForStudent(student).length;
                  return (
                    <div key={student.studentId} className="flex items-center gap-2 py-1.5">
                      <Checkbox
                        id={`student-${student.studentId}`}
                        checked={selectedStudents.has(student.studentId)}
                        onCheckedChange={() => toggleStudent(student.studentId)}
                      />
                      <Label htmlFor={`student-${student.studentId}`} className="text-sm cursor-pointer flex-1">
                        {student.studentName}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {student.overallMastery}%
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {studentQuestionCount} Qs
                      </Badge>
                    </div>
                  );
                })
              )}
              {!loading && students.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No students in this group
                </p>
              )}
            </ScrollArea>
          </div>

          {/* Export Progress */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Generating PDFs...</span>
                <span>{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
            </div>
          )}

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p>
              <strong>Ready to export:</strong> {selectedStudents.size} personalized worksheet{selectedStudents.size !== 1 ? 's' : ''} with up to {maxQuestionsPerStudent} questions each
            </p>
            {personalizeByWeakness && (
              <p className="text-muted-foreground mt-1">
                ✨ Each worksheet will prioritize questions targeting that student's specific weak topics.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={generatePDF} disabled={!canExport || exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {exporting ? 'Exporting...' : `Export ${selectedStudents.size} PDF${selectedStudents.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
