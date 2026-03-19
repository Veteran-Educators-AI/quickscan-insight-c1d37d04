import { useState, useRef } from 'react';
import { Bot, Upload, CheckCircle, X, BookOpen, Scale, Play, Pencil, Brain, Plus, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { resizeImage, blobToBase64 } from '@/lib/imageUtils';
import { useAILearningStatus } from '@/hooks/useAILearningStatus';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

export type BatchGradingMode = 'ai' | 'ai-learned' | 'teacher-guided' | 'manual';

interface BatchGradingModeSelectorProps {
  itemCount: number;
  onSelectMode: (mode: BatchGradingMode, answerGuideImages?: string[]) => void;
  onCancel: () => void;
  isProcessing?: boolean;
  initialAnswerGuideImages?: string[];
}

export function BatchGradingModeSelector({
  itemCount,
  onSelectMode,
  onCancel,
  isProcessing = false,
  initialAnswerGuideImages = [],
}: BatchGradingModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<BatchGradingMode | null>(null);
  const [answerGuideImages, setAnswerGuideImages] = useState<string[]>(initialAnswerGuideImages);
  const answerGuideInputRef = useRef<HTMLInputElement>(null);
  const { isReady: aiLearningReady, correctionCount, readinessPercent, isLoading: learningStatusLoading } = useAILearningStatus();

  const processFile = async (file: File): Promise<string> => {
    try {
      const resizedBlob = await resizeImage(file);
      return await blobToBase64(resizedBlob);
    } catch (err) {
      console.error('Error resizing image:', err);
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  };

  const handleAnswerGuideUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    try {
      const uploadedImages = await Promise.all(Array.from(files).map(processFile));
      setAnswerGuideImages(prev => [...prev, ...uploadedImages]);
      toast.success(`${uploadedImages.length} answer guide page${uploadedImages.length === 1 ? '' : 's'} uploaded!`);
    } catch {
      toast.error('Failed to upload one or more answer guide pages');
    }

    e.target.value = '';
  };

  const removeAnswerGuideImage = (index: number) => {
    setAnswerGuideImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAnswerGuideImages = () => {
    setAnswerGuideImages([]);
  };

  const handleProceed = () => {
    if (selectedMode === 'ai') {
      onSelectMode('ai');
    } else if (selectedMode === 'ai-learned') {
      onSelectMode('ai-learned');
    } else if (selectedMode === 'teacher-guided' && answerGuideImages.length > 0) {
      onSelectMode('teacher-guided', answerGuideImages);
    } else if (selectedMode === 'manual') {
      onSelectMode('manual');
    }
  };

  const canProceed =
    selectedMode === 'ai' ||
    selectedMode === 'ai-learned' ||
    selectedMode === 'manual' ||
    (selectedMode === 'teacher-guided' && answerGuideImages.length > 0);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Scale className="h-5 w-5 text-primary" />
          Choose Grading Method
        </CardTitle>
        <CardDescription>
          Select how you want to grade {itemCount} paper{itemCount !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          ref={answerGuideInputRef}
          onChange={handleAnswerGuideUpload}
          accept="image/*"
          multiple
          className="hidden"
        />

        <Tabs value={selectedMode || ''} onValueChange={(v) => setSelectedMode(v as BatchGradingMode)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI Only</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger
              value="ai-learned"
              className="flex items-center gap-1.5 relative"
              disabled={!aiLearningReady && !learningStatusLoading}
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">AI Learned</span>
              <span className="sm:hidden">Learned</span>
              {aiLearningReady && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-success" />
              )}
            </TabsTrigger>
            <TabsTrigger value="teacher-guided" className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">With Guide</span>
              <span className="sm:hidden">Guide</span>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-1.5">
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Manual</span>
              <span className="sm:hidden">Manual</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Bot className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">AI Analysis</p>
                  <p className="text-xs text-muted-foreground">
                    AI grades each paper using its knowledge of math concepts and common rubrics.
                    Fast and consistent grading for the entire batch.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success" />
                Fastest option for batch grading
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai-learned" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/10 p-3">
                <Brain className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium">AI Learned Your Style</p>
                  <p className="text-xs text-muted-foreground">
                    AI grades using patterns learned from your {correctionCount} grading corrections.
                    Applies your preferences for strictness, partial credit, and grading focus.
                  </p>
                </div>
              </div>

              {!aiLearningReady ? (
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Learning progress</span>
                    <span className="font-medium">{correctionCount}/10 corrections</span>
                  </div>
                  <Progress value={readinessPercent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Grade more papers and make corrections to teach the AI your style.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  AI has learned from {correctionCount} of your corrections
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="teacher-guided" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-3">
                <BookOpen className="mt-0.5 h-5 w-5 text-warning" />
                <div>
                  <p className="text-sm font-medium">Teacher-Guided AI</p>
                  <p className="text-xs text-muted-foreground">
                    Upload one or more answer-sheet pages or solution sets. AI first matches each student's work
                    to the most relevant guide page(s), then grades only against that matched answer set.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Answer Guide Pages (Required)</p>
                  {answerGuideImages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearAnswerGuideImages}>
                      Clear all
                    </Button>
                  )}
                </div>

                {answerGuideImages.length > 0 ? (
                  <>
                    <div className="max-h-[300px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-2 gap-3">
                        {answerGuideImages.map((image, index) => (
                          <div key={`${image.slice(0, 24)}-${index}`} className="group relative overflow-hidden rounded-lg border bg-muted/30">
                            <img
                              src={image}
                              alt={`Answer guide page ${index + 1}`}
                              className="h-32 w-full object-contain"
                            />
                            <div className="absolute left-1 top-1">
                              <Badge variant="secondary" className="text-xs">
                                Page {index + 1}
                              </Badge>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAnswerGuideImage(index)}
                              className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label={`Remove answer guide page ${index + 1}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => answerGuideInputRef.current?.click()}
                          className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                        >
                          <Plus className="h-5 w-5" />
                          <span className="text-xs">Add Pages</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {answerGuideImages.length} answer guide page{answerGuideImages.length === 1 ? '' : 's'} ready
                    </div>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    className="h-20 w-full border-dashed"
                    onClick={() => answerGuideInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Upload answer key / solution pages</span>
                    </div>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success" />
                AI matches each paper to the relevant guide page(s)
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3">
                <Pencil className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Manual Scoring</p>
                  <p className="text-xs text-muted-foreground">
                    Skip AI analysis. You'll manually enter scores for each paper
                    after viewing the scanned work.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-success" />
                Full control over grading
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="hero"
            className="flex-1"
            onClick={handleProceed}
            disabled={!canProceed || isProcessing}
          >
            {isProcessing ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Processing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {selectedMode === 'manual' ? 'Start Manual Scoring' : `Analyze ${itemCount} Papers`}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
