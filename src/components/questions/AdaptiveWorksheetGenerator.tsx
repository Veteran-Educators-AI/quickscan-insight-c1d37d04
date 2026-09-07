import { useState, useEffect } from 'react';
import { Loader2, Sparkles, Users, Download, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus, Brain, Target, AlertTriangle, QrCode, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';
import { useStudentWeaknesses, type StudentPerformanceProfile, type AdvancementLevel } from '@/hooks/useStudentWeaknesses';
import { fixEncodingCorruption, renderMathText, sanitizeForPDF } from '@/lib/mathRenderer';
import { generateQRCodePngDataUrl, generateStudentQuestionQRData, QR_PRINT_RENDER_SIZE } from '@/lib/qrCodeUtils';
import jsPDF from 'jspdf';

interface AdaptiveWorksheetGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  difficulty: string;
  advancementLevel: AdvancementLevel;
  hint?: string;
  targetMisconception?: string;
}

interface StudentWorksheet {
  studentId: string;
  firstName: string;
  lastName: string;
  level: AdvancementLevel;
  targetedTopics: string[];
  targetedMisconceptions: string[];
  questions: GeneratedQuestion[];
}

const LEVELS: AdvancementLevel[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const getLevelColor = (level: AdvancementLevel) => {
  const colors: Record<AdvancementLevel, string> = {
    'A': 'bg-green-100 text-green-800 border-green-300',
    'B': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'C': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'D': 'bg-orange-100 text-orange-800 border-orange-300',
    'E': 'bg-red-100 text-red-800 border-red-300',
    'F': 'bg-gray-100 text-gray-800 border-gray-300',
  };
  return colors[level];
};

const formatPdfText = (text: string) => sanitizeForPDF(renderMathText(fixEncodingCorruption(text)));

const getLevelDescription = (level: AdvancementLevel) => {
  const descriptions: Record<AdvancementLevel, string> = {
    'A': 'Advanced',
    'B': 'Proficient',
    'C': 'Developing',
    'D': 'Beginning',
    'E': 'Emerging',
    'F': 'Foundational',
  };
  return descriptions[level];
};

const getTrendIcon = (trend: 'improving' | 'stable' | 'declining') => {
  if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-600" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
};

// Generate QR code as PNG data URL
const generateQRCodeDataUrl = async (
  studentId: string,
  worksheetId: string,
  size: number = QR_PRINT_RENDER_SIZE
): Promise<string> => {
  const renderSize = Math.max(size, QR_PRINT_RENDER_SIZE);
  return generateQRCodePngDataUrl(generateStudentQuestionQRData(studentId, worksheetId), renderSize);
};

export function AdaptiveWorksheetGenerator({ open, onOpenChange }: AdaptiveWorksheetGeneratorProps) {
  const { getDisplayName } = useStudentNames();
  const { toast } = useToast();
  const { user } = useAuth();

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [questionCount, setQuestionCount] = useState('6');
  const [includeHints, setIncludeHints] = useState(true);
  const [includeQR, setIncludeQR] = useState(true);
  const [focusOnWeaknesses, setFocusOnWeaknesses] = useState(true);
  const [targetMisconceptions, setTargetMisconceptions] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generatedWorksheets, setGeneratedWorksheets] = useState<StudentWorksheet[]>([]);

  const { profiles, isLoading: isLoadingProfiles, studentsNeedingHelp } = useStudentWeaknesses({ 
    classId: selectedClassId 
  });

  // Fetch classes on open
  useEffect(() => {
    if (open && user) {
      fetchClasses();
    }
  }, [open, user]);

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const selectAllWithData = () => {
    const ids = profiles.filter(p => p.totalAttempts > 0 || p.diagnosticHistory.length > 0).map(p => p.studentId);
    setSelectedStudentIds(new Set(ids));
  };

  const deselectAll = () => {
    setSelectedStudentIds(new Set());
  };

  const generateAdaptiveWorksheets = async () => {
    const selectedProfiles = profiles.filter(p => selectedStudentIds.has(p.studentId));
    if (selectedProfiles.length === 0) {
      toast({
        title: 'No students selected',
        description: 'Please select at least one student with performance data.',
        variant: 'destructive',
      });
      return;
    }

    // Check if students have data
    const studentsWithoutData = selectedProfiles.filter(p => p.totalAttempts === 0 && p.diagnosticHistory.length === 0);
    if (studentsWithoutData.length > 0) {
      toast({
        title: 'Missing data',
        description: `${studentsWithoutData.length} student(s) have no diagnostic or grade history. Worksheets require prior assessment data.`,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus('Analyzing student performance data...');
    setGeneratedWorksheets([]);

    try {
      const worksheets: StudentWorksheet[] = [];
      const totalStudents = selectedProfiles.length;

      for (let i = 0; i < selectedProfiles.length; i++) {
        const profile = selectedProfiles[i];
        setGenerationStatus(`Generating personalized worksheet for ${getDisplayName(profile.studentId, profile.firstName, profile.lastName)}...`);
        setGenerationProgress(((i + 0.5) / totalStudents) * 100);

        // Determine topics to focus on based on weaknesses
        let targetTopics: { topicName: string; standard: string | null }[] = [];
        let targetMisconceptionTexts: string[] = [];

        if (focusOnWeaknesses && profile.weakTopics.length > 0) {
          // Focus on top 3 weakest topics
          targetTopics = profile.weakTopics.slice(0, 3).map(w => ({
            topicName: w.topicName,
            standard: w.standard,
          }));
        } else if (profile.diagnosticHistory.length > 0) {
          // Use topics from recent diagnostics
          const recentDiagnostics = profile.diagnosticHistory.slice(0, 3);
          targetTopics = recentDiagnostics.map(d => ({
            topicName: d.topicName,
            standard: null,
          }));
        } else if (profile.strongTopics.length > 0) {
          // Fall back to any topics they have data on
          targetTopics = profile.strongTopics.slice(0, 2).map(s => ({
            topicName: s.topicName,
            standard: s.standard,
          }));
        }

        // Get misconceptions to target
        if (targetMisconceptions && profile.misconceptions.length > 0) {
          targetMisconceptionTexts = profile.misconceptions.slice(0, 5).map(m => m.text);
        }

        // Determine difficulty based on level and trend
        let difficulty: string[];
        if (profile.overallLevel === 'A' || profile.overallLevel === 'B') {
          difficulty = profile.trend === 'improving' ? ['challenging', 'hard'] : ['hard', 'challenging'];
        } else if (profile.overallLevel === 'C' || profile.overallLevel === 'D') {
          difficulty = profile.trend === 'declining' ? ['medium', 'easy'] : ['medium', 'hard'];
        } else {
          difficulty = profile.trend === 'improving' ? ['easy', 'medium'] : ['super-easy', 'easy'];
        }

        // Build personalized prompt context
        const personalizationContext = {
          studentLevel: profile.overallLevel,
          trend: profile.trend,
          weakTopics: profile.weakTopics.map(w => w.topicName),
          misconceptions: targetMisconceptionTexts,
          averageScore: profile.averageGrade,
        };

        // Generate questions via edge function
        const { data, error } = await supabase.functions.invoke('generate-worksheet-questions', {
          body: {
            topics: targetTopics.length > 0 ? targetTopics.map(t => ({
              topicName: t.topicName,
              standard: t.standard || '',
              subject: 'Mathematics',
              category: 'Adaptive Practice',
            })) : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Adaptive' }],
            questionCount: parseInt(questionCount),
            difficultyLevels: difficulty,
            worksheetMode: 'diagnostic',
            includeHints,
            studentContext: personalizationContext,
            targetMisconceptions: targetMisconceptionTexts,
          },
        });

        if (error) {
          console.error('Error generating questions:', error);
          continue;
        }

        const questions: GeneratedQuestion[] = (data?.questions || []).map((q: any, idx: number) => ({
          ...q,
          questionNumber: idx + 1,
          advancementLevel: profile.overallLevel,
        }));

        worksheets.push({
          studentId: profile.studentId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          level: profile.overallLevel,
          targetedTopics: targetTopics.map(t => t.topicName),
          targetedMisconceptions: targetMisconceptionTexts,
          questions,
        });

        setGenerationProgress(((i + 1) / totalStudents) * 100);
      }

      setGeneratedWorksheets(worksheets);
      setGenerationStatus(`Generated ${worksheets.length} personalized worksheets!`);

    } catch (err) {
      console.error('Error generating worksheets:', err);
      toast({
        title: 'Generation failed',
        description: 'Could not generate worksheets. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (generatedWorksheets.length === 0) return;

    setGenerationStatus('Creating PDF...');
    setIsGenerating(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'letter');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let isFirstPage = true;

      for (const worksheet of generatedWorksheets) {
        if (!isFirstPage) pdf.addPage();
        isFirstPage = false;

        let yPosition = margin;

        // Header with level indicator
        const levelColors: Record<AdvancementLevel, [number, number, number]> = {
          'A': [34, 197, 94], 'B': [16, 185, 129], 'C': [250, 204, 21],
          'D': [251, 146, 60], 'E': [239, 68, 68], 'F': [156, 163, 175],
        };
        const [r, g, b] = levelColors[worksheet.level];
        pdf.setFillColor(r, g, b);
        pdf.rect(margin, yPosition - 5, contentWidth, 22, 'F');

        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0);
        pdf.text(`Personalized Practice - Level ${worksheet.level} (${getLevelDescription(worksheet.level)})`, pageWidth / 2, yPosition + 3, { align: 'center' });

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const topicsLabel = worksheet.targetedTopics.length > 0 
          ? worksheet.targetedTopics.slice(0, 2).join(', ') + (worksheet.targetedTopics.length > 2 ? '...' : '')
          : 'Adaptive Practice';
        pdf.text(`Focus: ${topicsLabel}`, pageWidth / 2, yPosition + 11, { align: 'center' });
        yPosition += 27;

        // Student info with QR
        pdf.setFontSize(11);
        pdf.text(`Name: ${getDisplayName(worksheet.studentId, worksheet.firstName, worksheet.lastName)}`, margin, yPosition);
        pdf.text('Date: _______________', pageWidth - margin - 50, yPosition);

        if (includeQR) {
          try {
            const worksheetId = `adaptive_${worksheet.studentId}_${Date.now()}`;
            const qrDataUrl = await generateQRCodeDataUrl(worksheet.studentId, worksheetId);
            pdf.addImage(qrDataUrl, 'PNG', pageWidth - margin - 15, yPosition - 8, 12, 12);
          } catch (e) {
            console.error('QR generation failed:', e);
          }
        }
        yPosition += 10;

        // Targeted areas callout
        if (worksheet.targetedMisconceptions.length > 0) {
          pdf.setFillColor(254, 243, 199);
          pdf.rect(margin, yPosition, contentWidth, 12, 'F');
          pdf.setFontSize(8);
          pdf.setTextColor(146, 64, 14);
          const miscText = `Focus areas: ${worksheet.targetedMisconceptions.slice(0, 2).join('; ')}`;
          const truncated = miscText.length > 100 ? miscText.substring(0, 97) + '...' : miscText;
          pdf.text(truncated, margin + 2, yPosition + 7);
          pdf.setTextColor(0);
          yPosition += 16;
        }

        // Questions
        pdf.setFontSize(10);
        for (const q of worksheet.questions) {
          // Check page break
          if (yPosition > pageHeight - 50) {
            pdf.addPage();
            yPosition = margin;
          }

          pdf.setFont('helvetica', 'bold');
          pdf.text(`${q.questionNumber}.`, margin, yPosition);

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10); // Slightly smaller for better fit
          const questionText = formatPdfText(q.question);
          // Use 85% of content width to prevent text overflow
          const lines = pdf.splitTextToSize(questionText, contentWidth * 0.85);
          lines.forEach((line: string) => {
            pdf.text(line, margin + 5, yPosition);
            yPosition += 4.5;
          });
          yPosition += 3;
          pdf.setFontSize(10); // Reset

          // Topic/Standard tag
          pdf.setFontSize(7);
          pdf.setTextColor(100);
          pdf.text(`[${q.topic}${q.standard ? ` - ${q.standard}` : ''}]`, margin + 8, yPosition);
          pdf.setTextColor(0);
          pdf.setFontSize(10);
          yPosition += 5;

          // Hint if enabled
          if (includeHints && q.hint) {
            pdf.setFontSize(8);
            pdf.setTextColor(59, 130, 246);
            // Use 85% of content width for hints
            const hintLines = pdf.splitTextToSize(formatPdfText(`Hint: ${q.hint}`), contentWidth * 0.85);
            hintLines.forEach((line: string) => {
              pdf.text(line, margin + 5, yPosition);
              yPosition += 3.5;
            });
            pdf.setTextColor(0);
            pdf.setFontSize(10);
            yPosition += 2;
          }

          // Answer space
          pdf.setDrawColor(200);
          pdf.setLineDashPattern([2, 2], 0);
          for (let line = 0; line < 3; line++) {
            pdf.line(margin + 8, yPosition + line * 7, margin + contentWidth - 5, yPosition + line * 7);
          }
          pdf.setLineDashPattern([], 0);
          yPosition += 25;
        }
      }

      pdf.save(`adaptive_worksheets_${new Date().toISOString().split('T')[0]}.pdf`);
      toast({ title: 'PDF downloaded!', description: `${generatedWorksheets.length} personalized worksheets saved.` });

    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: 'PDF failed', description: 'Could not create PDF.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const hasSelectedStudents = selectedStudentIds.size > 0;
  const selectedProfiles = profiles.filter(p => selectedStudentIds.has(p.studentId));
  const studentsWithData = selectedProfiles.filter(p => p.totalAttempts > 0 || p.diagnosticHistory.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Adaptive Worksheet Generator
          </DialogTitle>
          <DialogDescription>
            Generate personalized worksheets based on each student's diagnostic results and performance history. 
            Every worksheet is unique to the student's needs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Class Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Select Class</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Questions per Student</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['4', '5', '6', '8', '10'].map(n => (
                    <SelectItem key={n} value={n}>{n} questions</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2">
              <Switch checked={focusOnWeaknesses} onCheckedChange={setFocusOnWeaknesses} />
              <Label className="text-sm">Focus on weak topics</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={targetMisconceptions} onCheckedChange={setTargetMisconceptions} />
              <Label className="text-sm">Target misconceptions</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includeHints} onCheckedChange={setIncludeHints} />
              <Label className="text-sm">Include hints</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includeQR} onCheckedChange={setIncludeQR} />
              <Label className="text-sm">Include QR codes</Label>
            </div>
          </div>

          {/* Student Selection */}
          {selectedClassId && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Select Students</CardTitle>
                    <CardDescription>
                      Only students with diagnostic or grade history can receive personalized worksheets
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllWithData}>
                      Select with data
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAll}>
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingProfiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : profiles.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No students found in this class.</p>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {profiles.map(profile => {
                        const hasData = profile.totalAttempts > 0 || profile.diagnosticHistory.length > 0;
                        const isSelected = selectedStudentIds.has(profile.studentId);

                        return (
                          <div
                            key={profile.studentId}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                              isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                            } ${!hasData ? 'opacity-50' : ''}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleStudent(profile.studentId)}
                              disabled={!hasData}
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">
                                  {getDisplayName(profile.studentId, profile.firstName, profile.lastName)}
                                </span>
                                <Badge className={`text-xs ${getLevelColor(profile.overallLevel)}`}>
                                  {profile.overallLevel}
                                </Badge>
                                {getTrendIcon(profile.trend)}
                              </div>

                              {hasData ? (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span>Avg: {profile.averageGrade}%</span>
                                  <span>{profile.totalAttempts} attempts</span>
                                  {profile.weakTopics.length > 0 && (
                                    <span className="text-amber-600">
                                      {profile.weakTopics.length} weak topic(s)
                                    </span>
                                  )}
                                  {profile.misconceptions.length > 0 && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge variant="outline" className="text-xs gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            {profile.misconceptions.length}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs max-w-[200px]">
                                            {profile.misconceptions.slice(0, 3).map(m => m.text).join('; ')}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground mt-1">
                                  No diagnostic or grade data available
                                </p>
                              )}
                            </div>

                            {profile.weakTopics.length > 0 && (
                              <div className="hidden lg:flex flex-wrap gap-1 max-w-[150px]">
                                {profile.weakTopics.slice(0, 2).map((w, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs truncate max-w-[70px]">
                                    {w.topicName}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generation Progress */}
          {isGenerating && (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{generationStatus}</span>
                  </div>
                  <Progress value={generationProgress} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Results */}
          {generatedWorksheets.length > 0 && !isGenerating && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  {generatedWorksheets.length} Personalized Worksheets Ready
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[150px]">
                  <div className="grid gap-2 md:grid-cols-2">
                    {generatedWorksheets.map(ws => (
                      <div key={ws.studentId} className="flex items-center gap-2 p-2 bg-white rounded border">
                        <Badge className={getLevelColor(ws.level)}>{ws.level}</Badge>
                        <span className="text-sm font-medium">{getDisplayName(ws.studentId, ws.firstName, ws.lastName)}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {ws.questions.length} Qs
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {hasSelectedStudents ? (
              <>
                {selectedStudentIds.size} selected 
                {studentsWithData.length < selectedStudentIds.size && (
                  <span className="text-amber-600 ml-1">
                    ({selectedStudentIds.size - studentsWithData.length} missing data)
                  </span>
                )}
              </>
            ) : (
              'Select students with performance data'
            )}
          </div>

          <div className="flex gap-2">
            {generatedWorksheets.length > 0 ? (
              <Button onClick={downloadPDF} disabled={isGenerating}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            ) : (
              <Button
                onClick={generateAdaptiveWorksheets}
                disabled={!hasSelectedStudents || isGenerating || studentsWithData.length === 0}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Worksheets
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
