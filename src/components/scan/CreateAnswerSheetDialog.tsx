import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, Loader2, Printer, CheckCircle, AlertTriangle, BookOpen, X, Plus, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { resizeImage, blobToBase64, compressImage } from '@/lib/imageUtils';

interface AnswerSheetQuestion {
  number: string;
  question_text: string;
  topic: string;
  solution_steps: string[];
  final_answer: string;
  key_formula?: string;
  common_mistakes?: string[];
}

interface AnswerSheet {
  worksheet_title: string;
  subject: string;
  level?: string;
  total_questions: number;
  questions: AnswerSheetQuestion[];
}

interface CreateAnswerSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnswerSheetCreated?: (answerSheet: AnswerSheet, worksheetImage: string) => void;
}

export function CreateAnswerSheetDialog({ open, onOpenChange, onAnswerSheetCreated }: CreateAnswerSheetDialogProps) {
  const [worksheetImages, setWorksheetImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answerSheet, setAnswerSheet] = useState<AnswerSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File): Promise<string> => {
    try {
      const resizedBlob = await resizeImage(file);
      return await blobToBase64(resizedBlob);
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const newImages: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await processFile(file);
        newImages.push(dataUrl);
      }
      setWorksheetImages(prev => [...prev, ...newImages]);
      setAnswerSheet(null);
      setError(null);
    } catch {
      toast.error('Failed to process one or more images');
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setWorksheetImages(prev => prev.filter((_, i) => i !== index));
  };

  const generateAnswerSheet = async () => {
    if (!worksheetImages.length) return;
    setIsGenerating(true);
    setError(null);

    try {
      const compressed = await compressImage(worksheetImages[0], 1600, 0.8);
      const additionalImages: string[] = [];
      for (let i = 1; i < worksheetImages.length; i++) {
        additionalImages.push(await compressImage(worksheetImages[i], 1600, 0.8));
      }

      const { data, error: fnError } = await supabase.functions.invoke('generate-answer-sheet', {
        body: {
          imageBase64: compressed,
          ...(additionalImages.length > 0 ? { additionalImages } : {}),
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to generate answer sheet');
      }

      if (!data?.success || !data?.answerSheet) {
        throw new Error(data?.error || 'Invalid response from answer sheet generator');
      }

      setAnswerSheet(data.answerSheet);
      toast.success(`Answer sheet generated with ${data.answerSheet.questions?.length || 0} questions!`);
    } catch (err: any) {
      const msg = err.message || 'Failed to generate answer sheet';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseAsGuide = () => {
    if (answerSheet && worksheetImages.length && onAnswerSheetCreated) {
      onAnswerSheetCreated(answerSheet, worksheetImages[0]);
      onOpenChange(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !answerSheet) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Answer Sheet - ${answerSheet.worksheet_title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap');
          body { font-family: 'Caveat', cursive; font-size: 18px; line-height: 1.6; padding: 40px; color: #1a1a2e; max-width: 800px; margin: 0 auto; }
          h1 { font-family: 'Caveat', cursive; font-size: 32px; font-weight: 700; text-align: center; margin-bottom: 8px; color: #16213e; border-bottom: 3px solid #0f3460; padding-bottom: 8px; }
          .subtitle { text-align: center; font-size: 20px; color: #555; margin-bottom: 24px; }
          .question-block { margin-bottom: 28px; page-break-inside: avoid; border-left: 4px solid #0f3460; padding-left: 16px; }
          .question-number { font-weight: 700; font-size: 22px; color: #0f3460; margin-bottom: 4px; }
          .question-text { font-family: Arial, sans-serif; font-size: 14px; color: #333; background: #f5f5f5; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; }
          .solution-step { margin-left: 16px; margin-bottom: 4px; }
          .final-answer { font-weight: 700; font-size: 22px; color: #e94560; background: #fff3f3; padding: 6px 12px; border-radius: 6px; display: inline-block; margin-top: 6px; }
          .formula-tag { font-family: Arial, sans-serif; font-size: 12px; background: #e8f4fd; color: #0f3460; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px; }
          .common-mistakes { font-family: Arial, sans-serif; font-size: 12px; color: #b33; margin-top: 4px; padding: 4px 8px; background: #fff8f0; border-radius: 4px; }
          @media print { body { padding: 20px; } .question-block { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>📝 Answer Key</h1>
        <div class="subtitle">${answerSheet.worksheet_title}${answerSheet.level ? ` — ${answerSheet.level}` : ''}</div>
        ${answerSheet.questions.map(q => `
          <div class="question-block">
            <div class="question-number">Question ${q.number}</div>
            <div class="question-text">${q.question_text}</div>
            ${q.solution_steps.map(step => `<div class="solution-step">${step}</div>`).join('')}
            <div class="final-answer">Answer: ${q.final_answer}</div>
            ${q.key_formula ? `<div class="formula-tag">Formula: ${q.key_formula}</div>` : ''}
            ${q.common_mistakes?.length ? `<div class="common-mistakes">⚠️ Common mistakes: ${q.common_mistakes.join('; ')}</div>` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleReset = () => {
    setWorksheetImages([]);
    setAnswerSheet(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Create Answer Sheet
          </DialogTitle>
          <DialogDescription>
            Upload your answer key pages (single or multi-page) to generate a complete grading guide. You can also upload a blank worksheet to have solutions generated automatically.
          </DialogDescription>
        </DialogHeader>

        {worksheetImages.length === 0 && !answerSheet ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Upload Answer Key or Blank Worksheet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select one or more pages — supports multi-page answer keys
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Select Pages
            </Button>
          </div>
        ) : !answerSheet ? (
          <div className="space-y-4">
            {/* Multi-page thumbnail strip */}
            <ScrollArea className="max-h-[280px]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {worksheetImages.map((img, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                    <img
                      src={img}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-36 object-contain"
                    />
                    <div className="absolute top-1 left-1">
                      <Badge variant="secondary" className="text-xs">
                        Page {idx + 1}
                      </Badge>
                    </div>
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {/* Add more pages tile */}
                <button
                  onClick={() => addMoreRef.current?.click()}
                  className="flex flex-col items-center justify-center h-36 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors gap-2"
                >
                  <Plus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add Pages</span>
                </button>
              </div>
            </ScrollArea>

            <input
              ref={addMoreRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              {worksheetImages.length} page{worksheetImages.length !== 1 ? 's' : ''} uploaded
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReset} disabled={isGenerating}>
                Start Over
              </Button>
              <Button onClick={generateAnswerSheet} disabled={isGenerating} className="flex-1">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Answer Sheet...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Answer Sheet ({worksheetImages.length} page{worksheetImages.length !== 1 ? 's' : ''})
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{answerSheet.worksheet_title}</h3>
                <div className="flex gap-2 mt-1">
                  {answerSheet.subject && <Badge variant="secondary">{answerSheet.subject}</Badge>}
                  {answerSheet.level && <Badge variant="outline">{answerSheet.level}</Badge>}
                  <Badge>{answerSheet.total_questions} questions</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 max-h-[400px]">
              <div className="space-y-4 pr-4">
                {answerSheet.questions.map((q, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">{q.number}</span>
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                            {q.question_text}
                          </p>
                          {q.topic && (
                            <Badge variant="outline" className="text-xs">{q.topic}</Badge>
                          )}
                          <div className="space-y-1" style={{ fontFamily: "'Caveat', cursive" }}>
                            {q.solution_steps.map((step, si) => (
                              <p key={si} className="text-base leading-relaxed">
                                {step}
                              </p>
                            ))}
                          </div>
                          <div
                            className="inline-block bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-md font-bold text-lg"
                            style={{ fontFamily: "'Caveat', cursive" }}
                          >
                            ✓ {q.final_answer}
                          </div>
                          {q.key_formula && (
                            <p className="text-xs text-muted-foreground">
                              📐 Formula: <span className="font-mono">{q.key_formula}</span>
                            </p>
                          )}
                          {q.common_mistakes?.length ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              ⚠️ Watch for: {q.common_mistakes.join('; ')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
              <Button onClick={handleUseAsGuide} className="flex-1">
                <CheckCircle className="h-4 w-4 mr-2" />
                Use as Grading Guide
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
