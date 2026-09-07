import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Check, Loader2, QrCode, Eye, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PrintableWorksheet } from './PrintableWorksheet';
import { AIScanPreviewDialog } from './AIScanPreviewDialog';
import { StudentScanningGuide } from './StudentScanningGuide';
import { ClassroomScanningPoster } from './ClassroomScanningPoster';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
}

interface Question {
  id: string;
  jmap_id: string | null;
  prompt_text: string | null;
  prompt_image_url: string | null;
}

type AdvancementLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

interface StudentLevel {
  student_id: string;
  level: AdvancementLevel;
  topic_name: string;
}

interface PrintWorksheetDialogProps {
  classId: string;
  students: Student[];
  trigger?: React.ReactNode;
  topicName?: string;
}

export function PrintWorksheetDialog({ classId, students, trigger, topicName }: PrintWorksheetDialogProps) {
  const { getDisplayName } = useStudentNames();
  const { toast } = useToast();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [open, setOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [assessmentName, setAssessmentName] = useState('Geometry Assessment');
  const [showPreview, setShowPreview] = useState(false);
  const [showAIScanPreview, setShowAIScanPreview] = useState(false);
  const [includeQRCodes, setIncludeQRCodes] = useState(true);
  const [includeLevels, setIncludeLevels] = useState(true);
  const [aiOptimizedLayout, setAIOptimizedLayout] = useState(true);
  const [studentLevels, setStudentLevels] = useState<Map<string, StudentLevel>>(new Map());

  // Handle ESC key to close preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPreview) {
        setShowPreview(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPreview]);

  useEffect(() => {
    if (open) {
      fetchQuestions();
      fetchStudentLevels();
      // Select all students by default
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  }, [open, students]);

  async function fetchQuestions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('id, jmap_id, prompt_text, prompt_image_url')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load questions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudentLevels() {
    if (!user) return;
    
    try {
      // Fetch most recent diagnostic results for each student
      const studentIds = students.map(s => s.id);
      const { data, error } = await supabase
        .from('diagnostic_results')
        .select('student_id, recommended_level, topic_name, created_at')
        .eq('teacher_id', user.id)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get most recent level for each student
      const levelsMap = new Map<string, StudentLevel>();
      if (data) {
        for (const result of data) {
          if (!levelsMap.has(result.student_id) && result.recommended_level) {
            levelsMap.set(result.student_id, {
              student_id: result.student_id,
              level: result.recommended_level as AdvancementLevel,
              topic_name: result.topic_name,
            });
          }
        }
      }
      setStudentLevels(levelsMap);
    } catch (error) {
      console.error('Error fetching student levels:', error);
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

  const toggleQuestion = (questionId: string) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionId)) {
      newSelected.delete(questionId);
    } else {
      newSelected.add(questionId);
    }
    setSelectedQuestions(newSelected);
  };

  const selectAllStudents = () => {
    setSelectedStudents(new Set(students.map(s => s.id)));
  };

  const selectAllQuestions = () => {
    setSelectedQuestions(new Set(questions.map(q => q.id)));
  };

  const getSelectedStudents = () => students.filter(s => selectedStudents.has(s.id));
  const getSelectedQuestions = () => questions.filter(q => selectedQuestions.has(q.id));

  const handlePrint = () => {
    if (selectedStudents.size === 0 || selectedQuestions.size === 0) {
      toast({
        title: 'Selection required',
        description: 'Please select at least one student and one question',
        variant: 'destructive',
      });
      return;
    }
    setShowPreview(true);
    
    // Wait for render then print
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const canPrint = selectedStudents.size > 0 && selectedQuestions.size > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Worksheets
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Print Worksheets with QR Codes</DialogTitle>
            <DialogDescription>
              Generate personalized worksheets with QR codes for automatic student identification when scanning
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Assessment Name */}
            <div className="space-y-2">
              <Label htmlFor="assessmentName">Assessment Name</Label>
              <Input
                id="assessmentName"
                value={assessmentName}
                onChange={(e) => setAssessmentName(e.target.value)}
                placeholder="Enter assessment name"
              />
            </div>

            {/* QR Code Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="qr-toggle" className="flex items-center gap-2 cursor-pointer">
                  <QrCode className="h-4 w-4 text-primary" />
                  Embed Student QR Codes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Each worksheet will have QR codes linking student to each question for auto-identification during scanning
                </p>
              </div>
              <Switch
                id="qr-toggle"
                checked={includeQRCodes}
                onCheckedChange={setIncludeQRCodes}
              />
            </div>

            {/* Student Level Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20">
              <div className="space-y-0.5">
                <Label htmlFor="level-toggle" className="flex items-center gap-2 cursor-pointer">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-xs font-bold">A</span>
                  Show Student Levels (A-F)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display each student's current advancement level on their worksheet (A = Best, F = Needs Support)
                </p>
              </div>
              <Switch
                id="level-toggle"
                checked={includeLevels}
                onCheckedChange={setIncludeLevels}
              />
            </div>

            {/* AI-Optimized Layout Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20">
              <div className="space-y-0.5">
                <Label htmlFor="ai-layout-toggle" className="flex items-center gap-2 cursor-pointer">
                  <Eye className="h-4 w-4 text-purple-600" />
                  AI-Optimized Layout
                </Label>
                <p className="text-xs text-muted-foreground">
                  Bounded answer zones with clear work areas for improved AI scanning accuracy
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAIScanPreview(true)}
                  className="text-xs h-7"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Preview Scan Zones
                </Button>
                <Switch
                  id="ai-layout-toggle"
                  checked={aiOptimizedLayout}
                  onCheckedChange={setAIOptimizedLayout}
                />
              </div>
            </div>

            {/* Student Training Guide */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-600" />
                  Student Training Guide
                </Label>
                <p className="text-xs text-muted-foreground">
                  Printable guides showing students where to write work and answers for optimal scanning
                </p>
              </div>
              <div className="flex gap-2">
                <StudentScanningGuide />
                <ClassroomScanningPoster />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Students Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Students ({selectedStudents.size}/{students.length})</Label>
                  <Button variant="ghost" size="sm" onClick={selectAllStudents}>
                    Select All
                  </Button>
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {students.map((student) => {
                    const levelInfo = studentLevels.get(student.id);
                    return (
                      <div key={student.id} className="flex items-center gap-2 py-1">
                        <Checkbox
                          id={`student-${student.id}`}
                          checked={selectedStudents.has(student.id)}
                          onCheckedChange={() => toggleStudent(student.id)}
                        />
                        <Label htmlFor={`student-${student.id}`} className="text-sm cursor-pointer flex-1 flex items-center gap-2">
                          {getDisplayName(student.id, student.first_name, student.last_name)}
                          {levelInfo && (
                            <Badge 
                              variant="secondary" 
                              className={`text-xs px-1.5 py-0 ${
                                levelInfo.level === 'A' ? 'bg-green-100 text-green-800' :
                                levelInfo.level === 'B' ? 'bg-teal-100 text-teal-800' :
                                levelInfo.level === 'C' ? 'bg-yellow-100 text-yellow-800' :
                                levelInfo.level === 'D' ? 'bg-orange-100 text-orange-800' :
                                levelInfo.level === 'E' ? 'bg-red-100 text-red-800' :
                                'bg-red-200 text-red-900'
                              }`}
                            >
                              {levelInfo.level}
                            </Badge>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                  {students.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No students in this class
                    </p>
                  )}
                </ScrollArea>
              </div>

              {/* Questions Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Questions ({selectedQuestions.size}/{questions.length})</Label>
                  <Button variant="ghost" size="sm" onClick={selectAllQuestions}>
                    Select All
                  </Button>
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    questions.map((question) => (
                      <div key={question.id} className="flex items-center gap-2 py-1">
                        <Checkbox
                          id={`question-${question.id}`}
                          checked={selectedQuestions.has(question.id)}
                          onCheckedChange={() => toggleQuestion(question.id)}
                        />
                        <Label htmlFor={`question-${question.id}`} className="text-sm cursor-pointer truncate">
                          {question.jmap_id || question.prompt_text?.slice(0, 50) || 'Question'}
                        </Label>
                      </div>
                    ))
                  )}
                  {!loading && questions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No questions available
                    </p>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p>
                <strong>Ready to print:</strong> {selectedStudents.size} worksheet(s) with {selectedQuestions.size} question(s) each
              </p>
              <p className="text-muted-foreground mt-1">
                Each worksheet includes QR codes that encode the student ID and question ID for automatic detection during scanning.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrint} disabled={!canPrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print {selectedStudents.size} Worksheet(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Content - Using Portal to ensure it renders at document body level */}
      {showPreview && createPortal(
        <div 
          className="fixed inset-0 bg-white overflow-auto print:static print:overflow-visible"
          style={{ zIndex: 99999 }}
        >
          {/* Fixed close button in top-right corner - always visible */}
          <button 
            type="button"
            onClick={() => setShowPreview(false)}
            style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              zIndex: 100000,
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              fontSize: '24px',
              fontWeight: 'bold',
            }}
            className="print:hidden"
          >
            ✕
          </button>
          
          <div className="print:hidden p-4 bg-gray-100 border-b flex items-center justify-between sticky top-0" style={{ zIndex: 99998 }}>
            <p className="text-sm text-gray-700">Print preview - press Ctrl+P or Cmd+P to print, or press <kbd className="px-1.5 py-0.5 bg-white rounded border text-xs">ESC</kbd> to close</p>
            <button 
              type="button"
              onClick={() => setShowPreview(false)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <X className="h-4 w-4" />
              Close Preview
            </button>
          </div>
          <div ref={printRef}>
            {getSelectedStudents().map((student) => {
              const levelInfo = studentLevels.get(student.id);
              return (
                <PrintableWorksheet
                  key={student.id}
                  student={student}
                  questions={getSelectedQuestions()}
                  assessmentName={assessmentName}
                  showQRCodes={includeQRCodes}
                  studentLevel={includeLevels ? levelInfo?.level : undefined}
                  topicName={includeLevels ? (topicName || levelInfo?.topic_name) : undefined}
                  aiOptimizedLayout={aiOptimizedLayout}
                />
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* AI Scan Preview Dialog */}
      <AIScanPreviewDialog
        open={showAIScanPreview}
        onOpenChange={setShowAIScanPreview}
        questions={getSelectedQuestions().length > 0 ? getSelectedQuestions() : questions.slice(0, 3)}
        studentName={
          getSelectedStudents()[0]
            ? getDisplayName(
                getSelectedStudents()[0].id,
                getSelectedStudents()[0].first_name,
                getSelectedStudents()[0].last_name,
              )
            : 'Sample Student'
        }
      />

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-worksheet, .print-worksheet * {
            visibility: visible;
          }
          .print-worksheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 8.5in;
            box-sizing: border-box;
          }
          @page {
            size: letter;
            margin: 0.5in 0.75in;
          }
          .question-block {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Ensure text wraps properly */
          p, span, div {
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 100%;
          }
          /* Hide overflow */
          .print-worksheet {
            overflow: hidden;
          }
        }
        @media screen {
          .print-worksheet {
            max-width: 8.5in;
            margin: 0 auto;
          }
        }
      `}</style>
    </>
  );
}
