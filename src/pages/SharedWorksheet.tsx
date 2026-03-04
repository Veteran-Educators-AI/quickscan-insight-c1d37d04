import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, Printer, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { fixEncodingCorruption, renderMathText, sanitizeForPDF } from '@/lib/mathRenderer';
import jsPDF from 'jspdf';

interface GeometryMetadataLite {
  type: string;
  [key: string]: unknown;
}

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  difficulty: 'medium' | 'hard' | 'challenging';
  svg?: string;
  imageUrl?: string;
  imagePrompt?: string;
  geometry?: GeometryMetadataLite;
}

interface SharedWorksheetData {
  id: string;
  title: string;
  teacher_name: string | null;
  questions: GeneratedQuestion[];
  settings: {
    showAnswerLines: boolean;
  };
  created_at: string;
}

export default function SharedWorksheet() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const [worksheet, setWorksheet] = useState<SharedWorksheetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingShapes, setGeneratingShapes] = useState<Set<number>>(new Set());
  const shapeGenTriggered = useRef(false);

  useEffect(() => {
    const fetchWorksheet = async () => {
      if (!shareCode) {
        setError('No share code provided');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('worksheets')
          .select('*')
          .eq('share_code', shareCode)
          .eq('is_shared', true)
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Worksheet not found');

        setWorksheet({
          id: data.id,
          title: data.title,
          teacher_name: data.teacher_name,
          questions: data.questions as unknown as GeneratedQuestion[],
          settings: data.settings as unknown as SharedWorksheetData['settings'],
          created_at: data.created_at,
        });
      } catch (err) {
        console.error('Error fetching worksheet:', err);
        setError('Worksheet not found or no longer shared');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorksheet();
  }, [shareCode]);

  // Auto-generate shapes for questions with imagePrompt or structured geometry but no rendered diagram yet
  useEffect(() => {
    if (!worksheet || shapeGenTriggered.current) return;

    const questionsNeedingShapes = worksheet.questions.filter(
      (q) => (q.imagePrompt || q.geometry) && !q.svg && !q.imageUrl
    );

    if (questionsNeedingShapes.length === 0) return;
    shapeGenTriggered.current = true;

    setGeneratingShapes(new Set(questionsNeedingShapes.map((q) => q.questionNumber)));

    Promise.all(
      questionsNeedingShapes.map(async (q) => {
        try {
          const { data, error } = await supabase.functions.invoke('generate-diagram-images', {
            body: {
              questions: [{
                questionNumber: q.questionNumber,
                imagePrompt: q.imagePrompt || `Create a clean black-and-white geometry diagram for: ${q.question}`,
                ...(q.geometry ? { geometry: q.geometry } : {}),
              }],
              useNanoBanana: false,
              preferDeterministicSVG: true,
            },
          });

          if (error) {
            console.error(`Shape gen error for Q${q.questionNumber}:`, error);
            return null;
          }

          const imageUrl = data?.results?.[0]?.imageUrl;
          if (imageUrl) {
            return { questionNumber: q.questionNumber, imageUrl };
          }
          return null;
        } catch (err) {
          console.error(`Shape gen failed for Q${q.questionNumber}:`, err);
          return null;
        } finally {
          setGeneratingShapes((prev) => {
            const next = new Set(prev);
            next.delete(q.questionNumber);
            return next;
          });
        }
      })
    ).then((results) => {
      const successful = results.filter(Boolean) as { questionNumber: number; imageUrl: string }[];
      if (successful.length === 0) return;

      setWorksheet((prev) => {
        if (!prev) return prev;
        const updated = prev.questions.map((q) => {
          const match = successful.find((r) => r.questionNumber === q.questionNumber);
          return match ? { ...q, imageUrl: match.imageUrl } : q;
        });
        return { ...prev, questions: updated };
      });
    });
  }, [worksheet]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'hard': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'challenging': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatWorksheetText = (text: string) => renderMathText(fixEncodingCorruption(text));
  const formatWorksheetTextForPdf = (text: string) => sanitizeForPDF(formatWorksheetText(text));

  const generatePDF = async () => {
    if (!worksheet) return;

    // Wait for pending shapes
    if (generatingShapes.size > 0) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          setGeneratingShapes((current) => {
            if (current.size === 0) {
              clearInterval(interval);
              resolve();
            }
            return current;
          });
        }, 300);
      });
    }

    setIsGenerating(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'letter');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPosition = margin;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatWorksheetTextForPdf(worksheet.title), pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      if (worksheet.teacher_name) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Teacher: ${formatWorksheetTextForPdf(worksheet.teacher_name)}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 6;
      }

      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(`Worksheet Created: ${new Date(worksheet.created_at).toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
      pdf.setTextColor(0);
      yPosition += 8;

      pdf.setFontSize(11);
      pdf.text('Name: _______________________   Date: ___________   Period: _____', margin, yPosition);
      yPosition += 15;

      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);

      for (const question of worksheet.questions) {
        if (yPosition > pageHeight - 80) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        const difficultyText = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1);
        pdf.text(`${question.questionNumber}. [${difficultyText}]`, margin, yPosition);
        yPosition += 6;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text(formatWorksheetTextForPdf(`${question.topic} (${question.standard})`), margin + 5, yPosition);
        pdf.setTextColor(0);
        yPosition += 8;

        pdf.setFontSize(10);
        const sanitizedQuestion = formatWorksheetTextForPdf(question.question);
        const lines = pdf.splitTextToSize(sanitizedQuestion, contentWidth * 0.85);

        lines.forEach((line: string) => {
          if (yPosition > pageHeight - 40) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(line, margin + 5, yPosition);
          yPosition += 5;
        });
        pdf.setFontSize(11);

        yPosition += 4;

        // Render generated diagram as image if present
        if (question.imageUrl || question.svg) {
          try {
            const imageSource = question.imageUrl || URL.createObjectURL(new Blob([question.svg!], { type: 'image/svg+xml;charset=utf-8' }));
            const shouldRevokeObjectUrl = !question.imageUrl && Boolean(question.svg);

            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = imageSource;
            });
            
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, 200, 200);
              ctx.drawImage(img, 0, 0, 200, 200);
              const pngDataUrl = canvas.toDataURL('image/png');
              
              if (yPosition > pageHeight - 70) {
                pdf.addPage();
                yPosition = margin;
              }
              
              const imgWidth = 50;
              const imgHeight = 50;
              const imgX = (pageWidth - imgWidth) / 2;
              pdf.addImage(pngDataUrl, 'PNG', imgX, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 5;
            }
            
            if (shouldRevokeObjectUrl) {
              URL.revokeObjectURL(imageSource);
            }
          } catch (svgError) {
            console.error('Error rendering SVG to PDF:', svgError);
          }
        }

        if (worksheet.settings?.showAnswerLines !== false) {
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.2);
          for (let i = 0; i < 5; i++) {
            if (yPosition > pageHeight - 30) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.line(margin + 5, yPosition + (i * 8), pageWidth - margin, yPosition + (i * 8));
          }
          yPosition += 45;
        } else {
          yPosition += 15;
        }
      }

      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text('Generated with NYCLogic Ai - NYS Regents Aligned', pageWidth / 2, pageHeight - 10, { align: 'center' });

      pdf.save(`${worksheet.title.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading worksheet...</p>
        </div>
      </div>
    );
  }

  if (error || !worksheet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Worksheet Not Found</h2>
            <p className="text-muted-foreground mb-4">
              {error || 'This worksheet may have been removed or is no longer shared.'}
            </p>
            <Link to="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to NYCLogic Ai
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{worksheet.title}</CardTitle>
                {worksheet.teacher_name && (
                  <p className="text-muted-foreground mt-1">By {worksheet.teacher_name}</p>
                )}
              </div>
              <Badge variant="secondary">
                {worksheet.questions.length} questions
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-96 rounded-md border p-4">
              {worksheet.questions.map((question) => (
                <div
                  key={question.questionNumber}
                  className="py-3 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold">{question.questionNumber}.</span>
                    <Badge variant="outline" className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
                      {question.difficulty}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {question.topic} ({question.standard})
                  </p>
                  {/* Shape: spinner while generating, SVG when ready */}
                  {generatingShapes.has(question.questionNumber) && (
                    <div className="flex items-center gap-2 my-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Generating diagram…</span>
                    </div>
                  )}
                  {question.imageUrl && (
                    <div className="my-2 flex justify-center">
                      <img src={question.imageUrl} alt={`Diagram for question ${question.questionNumber}`} className="max-h-48 w-auto" />
                    </div>
                  )}
                  {!question.imageUrl && question.svg && (
                    <div 
                      className="my-2 flex justify-center"
                      dangerouslySetInnerHTML={{ __html: question.svg }}
                    />
                  )}
                  <p className="text-sm whitespace-pre-line">{formatWorksheetText(question.question)}</p>
                </div>
              ))}
            </ScrollArea>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={generatePDF}
                disabled={isGenerating || generatingShapes.size > 0}
              >
                {generatingShapes.size > 0 ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating shapes…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    {isGenerating ? 'Generating...' : 'Download PDF'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Shared on {new Date(worksheet.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
