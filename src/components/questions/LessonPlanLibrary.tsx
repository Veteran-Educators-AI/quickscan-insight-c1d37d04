import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, Library, Search, Star, StarOff, Trash2, FileType, 
  Download, Calendar, Clock, BookOpen, Filter, Send, Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import jsPDF from 'jspdf';
import { fixEncodingCorruption, sanitizeForPDF } from '@/lib/mathRenderer';
import pptxgen from 'pptxgenjs';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { format } from 'date-fns';
import { NycologicPresentationBuilder } from '@/components/presentation/NycologicPresentationBuilder';

interface LessonSlide {
  slideNumber: number;
  title: string;
  content: string[];
  speakerNotes: string;
  slideType: 'title' | 'objective' | 'instruction' | 'example' | 'practice' | 'summary';
}

interface SavedLessonPlan {
  id: string;
  title: string;
  standard: string;
  topic_name: string;
  subject: string | null;
  aim: string;
  objective: string;
  duration: string;
  slides: LessonSlide[];
  recommended_worksheets: {
    topicName: string;
    standard: string;
    difficulty: string;
  }[];
  class_id: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

interface LessonPlanLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPlan?: (plan: SavedLessonPlan) => void;
}

export function LessonPlanLibrary({ open, onOpenChange, onSelectPlan }: LessonPlanLibraryProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { pushToSisterApp } = usePushToSisterApp();
  const [lessonPlans, setLessonPlans] = useState<SavedLessonPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SavedLessonPlan | null>(null);
  const [isPushingToSisterApp, setIsPushingToSisterApp] = useState(false);
  const [showNycologicBuilder, setShowNycologicBuilder] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadLessonPlans();
    }
  }, [open, user]);

  const loadLessonPlans = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lesson_plans')
        .select('*')
        .eq('teacher_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Parse JSONB fields with proper type casting
      const parsedPlans: SavedLessonPlan[] = (data || []).map(plan => ({
        id: plan.id,
        title: plan.title,
        standard: plan.standard,
        topic_name: plan.topic_name,
        subject: plan.subject,
        aim: (plan as { aim?: string | null }).aim || plan.objective,
        objective: plan.objective,
        duration: plan.duration,
        slides: (plan.slides as unknown as LessonSlide[]) || [],
        recommended_worksheets: (plan.recommended_worksheets as unknown as { topicName: string; standard: string; difficulty: string }[]) || [],
        class_id: plan.class_id,
        is_favorite: plan.is_favorite,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      }));
      
      setLessonPlans(parsedPlans);
    } catch (error) {
      console.error('Error loading lesson plans:', error);
      toast({
        title: 'Failed to load lesson plans',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async (plan: SavedLessonPlan) => {
    try {
      const { error } = await supabase
        .from('lesson_plans')
        .update({ is_favorite: !plan.is_favorite })
        .eq('id', plan.id);

      if (error) throw error;

      setLessonPlans(prev =>
        prev.map(p => p.id === plan.id ? { ...p, is_favorite: !p.is_favorite } : p)
      );
      
      toast({
        title: plan.is_favorite ? 'Removed from favorites' : 'Added to favorites',
      });
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: 'Failed to update favorite',
        variant: 'destructive',
      });
    }
  };

  const deleteLessonPlan = async (planId: string) => {
    try {
      const { error } = await supabase
        .from('lesson_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      setLessonPlans(prev => prev.filter(p => p.id !== planId));
      if (selectedPlan?.id === planId) {
        setSelectedPlan(null);
      }
      
      toast({
        title: 'Lesson plan deleted',
      });
    } catch (error) {
      console.error('Error deleting lesson plan:', error);
      toast({
        title: 'Failed to delete lesson plan',
        variant: 'destructive',
      });
    }
  };

  const downloadAsPowerPoint = (plan: SavedLessonPlan) => {
    const pptx = new pptxgen();
    pptx.author = 'NYCLogic Ai';
    pptx.title = plan.title;
    pptx.subject = `Lesson on ${plan.topic_name}`;
    
    const slideColors: Record<string, { bg: string; text: string }> = {
      title: { bg: '3B82F6', text: 'FFFFFF' },
      objective: { bg: '3B82F6', text: 'FFFFFF' },
      instruction: { bg: '10B981', text: 'FFFFFF' },
      example: { bg: 'A855F7', text: 'FFFFFF' },
      practice: { bg: 'F97316', text: 'FFFFFF' },
      summary: { bg: 'F43F5E', text: 'FFFFFF' },
    };

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(plan.title, {
      x: 0.5, y: 1.6, w: 9, h: 1,
      fontSize: 34, bold: true, color: '1F2937', align: 'center', valign: 'middle',
    });
    titleSlide.addText(`Standards: ${plan.standard}`, {
      x: 0.5, y: 2.9, w: 9, h: 0.45,
      fontSize: 18, color: '6B7280', align: 'center',
    });
    titleSlide.addText(plan.aim, {
      x: 0.8, y: 3.45, w: 8.4, h: 0.9,
      fontSize: 18, bold: true, color: '1F2937', align: 'center', valign: 'middle',
    });
    titleSlide.addText(`Duration: ${plan.duration}`, {
      x: 0.5, y: 4.45, w: 9, h: 0.4,
      fontSize: 16, color: '6B7280', align: 'center',
    });

    // Aim and standards slide
    const aimSlide = pptx.addSlide();
    aimSlide.addText('Aim & Standards', {
      x: 0.5, y: 0.5, w: 9, h: 0.8,
      fontSize: 28, bold: true, color: '1F2937',
    });
    aimSlide.addText([
      { text: plan.aim, options: { bullet: true, indentLevel: 0 } },
      { text: `Standards: ${plan.standard}`, options: { bullet: true, indentLevel: 0 } },
    ], {
      x: 0.5, y: 1.5, w: 9, h: 2.5,
      fontSize: 20, color: '374151', valign: 'top', lineSpacing: 28,
    });

    // Objective slide
    const objectiveSlide = pptx.addSlide();
    objectiveSlide.addText('Learning Objective', {
      x: 0.5, y: 0.5, w: 9, h: 0.8,
      fontSize: 28, bold: true, color: '1F2937',
    });
    objectiveSlide.addText(plan.objective, {
      x: 0.5, y: 1.5, w: 9, h: 3,
      fontSize: 20, color: '374151', valign: 'top',
    });

    // Content slides
    plan.slides.forEach((slide) => {
      const colors = slideColors[slide.slideType] || { bg: 'E5E7EB', text: '1F2937' };
      const pptSlide = pptx.addSlide();
      
      pptSlide.addText(slide.slideType.toUpperCase(), {
        x: 0.5, y: 0.3, w: 1.5, h: 0.35,
        fontSize: 10, bold: true, color: 'FFFFFF',
        fill: { color: colors.bg }, align: 'center', valign: 'middle',
      });

      pptSlide.addText(slide.title, {
        x: 0.5, y: 0.8, w: 9, h: 0.7,
        fontSize: 28, bold: true, color: '1F2937',
      });

      const bulletPoints = slide.content.map((item) => ({
        text: item,
        options: { bullet: true, indentLevel: 0 },
      }));

      pptSlide.addText(bulletPoints, {
        x: 0.5, y: 1.6, w: 9, h: 3.5,
        fontSize: 18, color: '374151', valign: 'top', lineSpacing: 28,
      });

      if (slide.speakerNotes) {
        pptSlide.addNotes(slide.speakerNotes);
      }
    });

    pptx.writeFile({ fileName: `${plan.title.replace(/\s+/g, '_')}_Lesson_Plan.pptx` });
    toast({ title: 'PowerPoint downloaded' });
  };

  const formatPdfText = (text: string) => sanitizeForPDF(fixEncodingCorruption(text));

  const downloadAsPDF = (plan: SavedLessonPlan) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatPdfText(plan.title), pageWidth / 2, yPosition + 20, { align: 'center' });
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.text(formatPdfText(`Standard: ${plan.standard}`), pageWidth / 2, yPosition + 35, { align: 'center' });
    pdf.text(formatPdfText(`Duration: ${plan.duration}`), pageWidth / 2, yPosition + 45, { align: 'center' });
    
    pdf.setFontSize(12);
    const objectiveLines = pdf.splitTextToSize(formatPdfText(`Objective: ${plan.objective}`), contentWidth);
    pdf.text(objectiveLines, margin, yPosition + 60);

    plan.slides.forEach((slide) => {
      pdf.addPage();
      yPosition = margin;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.text(formatPdfText(`Slide ${slide.slideNumber}`), margin, yPosition);
      
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      yPosition += 15;
      pdf.text(formatPdfText(slide.title), margin, yPosition);

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      yPosition += 15;

      slide.content.forEach((item) => {
        const lines = pdf.splitTextToSize(formatPdfText(`• ${item}`), contentWidth);
        if (yPosition + lines.length * 7 > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(lines, margin, yPosition);
        yPosition += lines.length * 7 + 5;
      });

      if (slide.speakerNotes) {
        yPosition += 10;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Speaker Notes:', margin, yPosition);
        yPosition += 7;
        const noteLines = pdf.splitTextToSize(formatPdfText(slide.speakerNotes), contentWidth);
        pdf.text(noteLines, margin, yPosition);
      }
    });

    pdf.save(`${plan.title.replace(/\s+/g, '_')}_Lesson_Plan.pdf`);
    toast({ title: 'PDF downloaded' });
  };

  const pushToSisterApps = async (plan: SavedLessonPlan) => {
    if (!plan.class_id) {
      toast({
        title: 'Cannot push to sister apps',
        description: 'This lesson plan is not associated with a class.',
        variant: 'destructive',
      });
      return;
    }

    setIsPushingToSisterApp(true);
    try {
      const result = await pushToSisterApp({
        type: 'assignment_push',
        source: 'scan_genius',
        class_id: plan.class_id,
        title: plan.title,
        description: `Lesson on ${plan.topic_name} - ${plan.objective}`,
        standard_code: plan.standard,
        topic_name: plan.topic_name,
        xp_reward: 50,
        coin_reward: 25,
        remediation_recommendations: [
          `Study ${plan.topic_name}`,
          `Review ${plan.standard} concepts`,
        ],
        difficulty_level: 'C',
      });

      if (result.success) {
        toast({ title: 'Pushed to sister apps!' });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error pushing to sister apps:', error);
      toast({
        title: 'Push failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsPushingToSisterApp(false);
    }
  };

  const filteredPlans = lessonPlans.filter(plan => {
    const matchesSearch = plan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.topic_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.standard.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = filterSubject === 'all' || plan.subject === filterSubject;
    const matchesFavorites = !filterFavorites || plan.is_favorite;
    return matchesSearch && matchesSubject && matchesFavorites;
  });

  const uniqueSubjects = [...new Set(lessonPlans.map(p => p.subject).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Lesson Plan Library
          </DialogTitle>
          <DialogDescription>
            Browse, organize, and reuse your saved lesson plans
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 h-[65vh]">
          {/* Left sidebar - list */}
          <div className="w-1/3 flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lesson plans..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex gap-2">
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="flex-1">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(subject => (
                    <SelectItem key={subject} value={subject!}>{subject}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={filterFavorites ? "default" : "outline"}
                size="icon"
                onClick={() => setFilterFavorites(!filterFavorites)}
              >
                <Star className={`h-4 w-4 ${filterFavorites ? 'fill-current' : ''}`} />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Library className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No lesson plans found</p>
                  <p className="text-sm">Generate and save lesson plans to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPlans.map(plan => (
                    <Card
                      key={plan.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedPlan?.id === plan.id ? 'border-primary bg-muted/50' : ''
                      }`}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              {plan.is_favorite && (
                                <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />
                              )}
                              <p className="font-medium truncate">{plan.title}</p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{plan.topic_name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                {plan.standard}
                              </Badge>
                              {plan.subject && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                  {plan.subject}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <Separator orientation="vertical" />

          {/* Right side - detail view */}
          <div className="flex-1 flex flex-col">
            {selectedPlan ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold">{selectedPlan.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{selectedPlan.standard}</Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {selectedPlan.duration}
                      </Badge>
                      {selectedPlan.subject && (
                        <Badge>{selectedPlan.subject}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleFavorite(selectedPlan)}
                    >
                      {selectedPlan.is_favorite ? (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                      ) : (
                        <StarOff className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteLessonPlan(selectedPlan.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-4">
                    <Card className="bg-muted/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <BookOpen className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">Learning Objective</p>
                            <p className="text-sm text-muted-foreground">{selectedPlan.objective}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div>
                      <h4 className="font-medium mb-2">Slides ({selectedPlan.slides.length})</h4>
                      <div className="grid gap-2">
                        {selectedPlan.slides.map((slide, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                            <Badge variant="outline" className="text-xs capitalize">{slide.slideType}</Badge>
                            <span className="truncate">{slide.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedPlan.recommended_worksheets.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Recommended Worksheets</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedPlan.recommended_worksheets.map((ws, index) => (
                            <Badge key={index} variant="outline">
                              {ws.topicName} ({ws.standard})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Created {format(new Date(selectedPlan.created_at), 'MMM d, yyyy')}
                      {selectedPlan.updated_at !== selectedPlan.created_at && (
                        <span>• Updated {format(new Date(selectedPlan.updated_at), 'MMM d, yyyy')}</span>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                <Separator className="my-4" />

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => downloadAsPowerPoint(selectedPlan)} className="flex-1">
                    <FileType className="h-4 w-4 mr-2" />
                    PowerPoint
                  </Button>
                  <Button onClick={() => downloadAsPDF(selectedPlan)} variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    onClick={() => setShowNycologicBuilder(true)}
                    className="flex-1 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Nycologic
                  </Button>
                  <Button
                    onClick={() => pushToSisterApps(selectedPlan)}
                    disabled={isPushingToSisterApp || !selectedPlan.class_id}
                    variant="secondary"
                    className="flex-1"
                  >
                    {isPushingToSisterApp ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Push to Apps
                  </Button>
                  {onSelectPlan && (
                    <Button
                      onClick={() => {
                        onSelectPlan(selectedPlan);
                        onOpenChange(false);
                      }}
                      variant="outline"
                    >
                      Open & Edit
                    </Button>
                  )}
                </div>

                {/* Nycologic Presentation Builder */}
                <NycologicPresentationBuilder
                  open={showNycologicBuilder}
                  onOpenChange={setShowNycologicBuilder}
                  topic={{
                    topicName: selectedPlan.topic_name,
                    standard: selectedPlan.standard,
                    subject: selectedPlan.subject || undefined,
                  }}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Library className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p>Select a lesson plan to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
