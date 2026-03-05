import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Presentation, Download, FileText, ChevronLeft, ChevronRight, BookOpen, Send, Printer, Clock, FileType, Pencil, Check, Plus, Trash2, X, Save, Library, ArrowUp, ArrowDown, Layers, FileSpreadsheet, Move, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { useAuth } from '@/lib/auth';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import jsPDF from 'jspdf';
import { fixEncodingCorruption, sanitizeForPDF } from '@/lib/mathRenderer';
import pptxgen from 'pptxgenjs';
import { StudentHandoutDialog, type HandoutOptions } from './StudentHandoutDialog';
import { SlideClipartPicker, getClipartSvg, getClipartPosition, getClipartLibrary, type SlideClipart } from './SlideClipartPicker';
import { DraggableClipart } from './DraggableClipart';
import { NycologicPresentationBuilder } from '@/components/presentation/NycologicPresentationBuilder';
import nyclogicLogo from '@/assets/nyclogic-presents-logo.png';

interface LessonSlide {
  slideNumber: number;
  title: string;
  content: string[];
  speakerNotes: string;
  slideType: 'title' | 'objective' | 'instruction' | 'example' | 'practice' | 'summary';
  clipart?: SlideClipart[];
}

interface LessonPlan {
  title: string;
  standard: string;
  topicName: string;
  aim: string;
  objective: string;
  duration: string;
  slides: LessonSlide[];
  recommendedWorksheets: {
    topicName: string;
    standard: string;
    difficulty: string;
  }[];
}

interface PresentationTheme {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  slideColors: {
    title: { bg: string; text: string };
    objective: { bg: string; text: string };
    instruction: { bg: string; text: string };
    example: { bg: string; text: string };
    practice: { bg: string; text: string };
    summary: { bg: string; text: string };
  };
}

interface LessonPlanGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: {
    topicName: string;
    standard: string;
    subject?: string;
  } | null;
  relatedTopics?: { topicName: string; standard: string }[];
  classId?: string;
  onOpenLibrary?: () => void;
  presentationTheme?: PresentationTheme | null;
  existingLessonId?: string | null;
}

export function LessonPlanGenerator({ 
  open, 
  onOpenChange, 
  topic, 
  relatedTopics = [],
  classId,
  onOpenLibrary,
  presentationTheme,
  existingLessonId
}: LessonPlanGeneratorProps) {
  const hasExplicitExitTicket = (slides: LessonSlide[]) =>
    slides.some((slide) => {
      const title = slide.title.toLowerCase();
      const content = slide.content.join(' ').toLowerCase();
      return title.includes('exit ticket') || content.includes('exit ticket');
    });

  const buildExitTicketSlide = (plan: LessonPlan): LessonSlide => ({
    slideNumber: plan.slides.length + 1,
    title: 'Exit Ticket',
    slideType: 'summary',
    content: [
      `Exit Ticket: Show what you learned about ${plan.topicName}.`,
      `Solve one final problem aligned to ${plan.standard}.`,
      'Explain the strategy you used.',
      'Name one mistake to avoid next time.',
    ],
    speakerNotes: 'Give students 3-5 minutes to complete this exit ticket independently, then use responses to gauge mastery and plan follow-up support.',
  });

  const ensureExitTicketSlide = (plan: LessonPlan): LessonPlan =>
    hasExplicitExitTicket(plan.slides)
      ? plan
      : { ...plan, slides: [...plan.slides, buildExitTicketSlide(plan)] };

  const { toast } = useToast();
  const { user } = useAuth();
  const { pushToSisterApp } = usePushToSisterApp();
  const { trackFeature } = useFeatureTracking();
  const [isGenerating, setIsGenerating] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lessonDuration, setLessonDuration] = useState('45 minutes');
  const [isPushingToSisterApp, setIsPushingToSisterApp] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingContentIndex, setEditingContentIndex] = useState<number | null>(null);
  const [showHandoutDialog, setShowHandoutDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [slideClipart, setSlideClipart] = useState<Record<number, SlideClipart[]>>({});
  const [showNycologicPresents, setShowNycologicPresents] = useState(false);

  // Load existing lesson plan if ID is provided
  useEffect(() => {
    async function loadExistingLesson() {
      if (!open || !existingLessonId) return;
      
      setIsLoadingExisting(true);
      try {
        const { data, error } = await supabase
          .from('lesson_plans')
          .select('*')
          .eq('id', existingLessonId)
          .single();

        if (error) throw error;

        if (data) {
          const slides = (data.slides as unknown as LessonSlide[]) || [];
          const recommendedWorksheets = (data.recommended_worksheets as unknown as { topicName: string; standard: string; difficulty: string }[]) || [];
          const savedAim = (data as { aim?: string | null }).aim;
          
          setLessonPlan({
            title: data.title,
            standard: data.standard,
            topicName: data.topic_name,
            aim: savedAim || data.objective,
            objective: data.objective,
            duration: data.duration,
            slides,
            recommendedWorksheets
          });
          setLessonDuration(data.duration);
          setCurrentSlide(0);
        }
      } catch (error) {
        console.error('Error loading lesson plan:', error);
        toast({
          title: "Error",
          description: "Failed to load lesson plan",
          variant: "destructive"
        });
      } finally {
        setIsLoadingExisting(false);
      }
    }

    loadExistingLesson();
  }, [open, existingLessonId, toast]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setLessonPlan(null);
      setCurrentSlide(0);
      setIsEditing(false);
      setSlideClipart({});
    }
  }, [open]);

  // Ref for the slide container (for draggable clipart)
  const slideContainerRef = useRef<HTMLDivElement>(null);

  // Update clipart for a specific slide
  const updateSlideClipart = (slideIndex: number, clipart: SlideClipart[]) => {
    setSlideClipart(prev => ({
      ...prev,
      [slideIndex]: clipart
    }));
  };

  // Update clipart position
  const updateClipartPosition = (slideIndex: number, clipartIndex: number, x: number, y: number) => {
    setSlideClipart(prev => {
      const currentClipart = prev[slideIndex] || [];
      const updated = [...currentClipart];
      updated[clipartIndex] = { ...updated[clipartIndex], position: 'custom', x, y };
      return { ...prev, [slideIndex]: updated };
    });
  };

  // Remove clipart by index
  const removeClipartByIndex = (slideIndex: number, clipartIndex: number) => {
    setSlideClipart(prev => {
      const currentClipart = prev[slideIndex] || [];
      return { ...prev, [slideIndex]: currentClipart.filter((_, i) => i !== clipartIndex) };
    });
  };

  // Edit handlers
  const updateSlideTitle = (newTitle: string) => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], title: newTitle };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
  };

  const updateSlideContent = (index: number, newContent: string) => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    const updatedContent = [...updatedSlides[currentSlide].content];
    updatedContent[index] = newContent;
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], content: updatedContent };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
  };

  const addContentBullet = () => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    const updatedContent = [...updatedSlides[currentSlide].content, 'New bullet point'];
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], content: updatedContent };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setEditingContentIndex(updatedContent.length - 1);
  };

  const removeContentBullet = (index: number) => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    const updatedContent = updatedSlides[currentSlide].content.filter((_, i) => i !== index);
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], content: updatedContent };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setEditingContentIndex(null);
  };

  const updateSpeakerNotes = (newNotes: string) => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], speakerNotes: newNotes };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
  };

  const updateLessonTitle = (newTitle: string) => {
    if (!lessonPlan) return;
    setLessonPlan({ ...lessonPlan, title: newTitle });
  };

  const updateAim = (newAim: string) => {
    if (!lessonPlan) return;
    setLessonPlan({ ...lessonPlan, aim: newAim });
  };

  const updateObjective = (newObjective: string) => {
    if (!lessonPlan) return;
    setLessonPlan({ ...lessonPlan, objective: newObjective });
  };

  const updateSlideType = (newType: LessonSlide['slideType']) => {
    if (!lessonPlan) return;
    const updatedSlides = [...lessonPlan.slides];
    updatedSlides[currentSlide] = { ...updatedSlides[currentSlide], slideType: newType };
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
  };

  const moveSlideUp = () => {
    if (!lessonPlan || currentSlide === 0) return;
    const updatedSlides = [...lessonPlan.slides];
    const temp = updatedSlides[currentSlide];
    updatedSlides[currentSlide] = updatedSlides[currentSlide - 1];
    updatedSlides[currentSlide - 1] = temp;
    // Update slide numbers
    updatedSlides[currentSlide].slideNumber = currentSlide + 1;
    updatedSlides[currentSlide - 1].slideNumber = currentSlide;
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setCurrentSlide(currentSlide - 1);
  };

  const moveSlideDown = () => {
    if (!lessonPlan || currentSlide === lessonPlan.slides.length - 1) return;
    const updatedSlides = [...lessonPlan.slides];
    const temp = updatedSlides[currentSlide];
    updatedSlides[currentSlide] = updatedSlides[currentSlide + 1];
    updatedSlides[currentSlide + 1] = temp;
    // Update slide numbers
    updatedSlides[currentSlide].slideNumber = currentSlide + 1;
    updatedSlides[currentSlide + 1].slideNumber = currentSlide + 2;
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setCurrentSlide(currentSlide + 1);
  };

  const slideTypes: { value: LessonSlide['slideType']; label: string }[] = [
    { value: 'title', label: 'Title' },
    { value: 'objective', label: 'Objective' },
    { value: 'instruction', label: 'Instruction' },
    { value: 'example', label: 'Example' },
    { value: 'practice', label: 'Practice' },
    { value: 'summary', label: 'Summary' },
  ];

  const addNewSlide = () => {
    if (!lessonPlan) return;
    const newSlide: LessonSlide = {
      slideNumber: lessonPlan.slides.length + 1,
      title: 'New Slide',
      content: ['Add your content here'],
      speakerNotes: '',
      slideType: 'instruction',
    };
    const updatedSlides = [
      ...lessonPlan.slides.slice(0, currentSlide + 1),
      newSlide,
      ...lessonPlan.slides.slice(currentSlide + 1).map((s, i) => ({
        ...s,
        slideNumber: currentSlide + 3 + i,
      })),
    ];
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setCurrentSlide(currentSlide + 1);
  };

  const deleteCurrentSlide = () => {
    if (!lessonPlan || lessonPlan.slides.length <= 1) return;
    const updatedSlides = lessonPlan.slides
      .filter((_, i) => i !== currentSlide)
      .map((s, i) => ({ ...s, slideNumber: i + 1 }));
    setLessonPlan({ ...lessonPlan, slides: updatedSlides });
    setCurrentSlide(Math.max(0, currentSlide - 1));
    setEditingContentIndex(null);
  };

  const saveLessonPlan = async () => {
    if (!lessonPlan || !user) {
      toast({
        title: 'Cannot save',
        description: 'Please log in to save lesson plans.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const insertData = {
        teacher_id: user.id,
        title: lessonPlan.title,
        standard: lessonPlan.standard,
        topic_name: lessonPlan.topicName,
        subject: topic?.subject || null,
        aim: lessonPlan.aim,
        objective: lessonPlan.objective,
        duration: lessonPlan.duration,
        slides: lessonPlan.slides as unknown,
        recommended_worksheets: lessonPlan.recommendedWorksheets as unknown,
        class_id: classId || null,
      };
      
      const { error } = await supabase.from('lesson_plans').insert(insertData as any);

      if (error) throw error;

      // Track lesson plan save
      trackFeature({
        featureName: 'Save Lesson Plan',
        category: 'lessons',
        action: 'saved',
        metadata: {
          topicName: lessonPlan.topicName,
          standard: lessonPlan.standard,
          slideCount: lessonPlan.slides?.length || 0,
        },
      });

      toast({
        title: 'Lesson plan saved!',
        description: 'You can find it in your Lesson Plan Library.',
      });
    } catch (error) {
      console.error('Error saving lesson plan:', error);
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generateLessonPlan = async () => {
    if (!topic || !user) return;

    setIsGenerating(true);
    setLessonPlan(null);
    setCurrentSlide(0);

    try {
      const { data, error } = await supabase.functions.invoke('generate-lesson-plan', {
        body: {
          topicName: topic.topicName,
          standard: topic.standard,
          subject: topic.subject,
          relatedTopics,
          lessonDuration,
        },
      });

      if (error) throw error;

      if (data.lessonPlan) {
        const generatedLessonPlan = ensureExitTicketSlide({
          ...data.lessonPlan,
          aim: data.lessonPlan.aim || data.lessonPlan.objective,
        });

        setLessonPlan(generatedLessonPlan);
        
        // Auto-save the lesson plan to the database
        const insertData = {
          teacher_id: user.id,
          title: generatedLessonPlan.title,
          standard: generatedLessonPlan.standard,
          topic_name: generatedLessonPlan.topicName,
          subject: topic.subject || null,
          aim: generatedLessonPlan.aim,
          objective: generatedLessonPlan.objective,
          duration: generatedLessonPlan.duration,
          slides: generatedLessonPlan.slides as unknown,
          recommended_worksheets: generatedLessonPlan.recommendedWorksheets as unknown,
          class_id: classId || null,
        };
        
        const { error: saveError } = await supabase.from('lesson_plans').insert(insertData as any);
        
        if (saveError) {
          console.error('Auto-save failed:', saveError);
        }
        
        // Track lesson plan generation
        trackFeature({
          featureName: 'Generate Lesson Plan',
          category: 'lessons',
          action: 'generated',
          metadata: {
            topicName: topic.topicName,
            standard: topic.standard,
            slideCount: data.lessonPlan.slides?.length || 0,
            duration: lessonDuration,
          },
        });

        toast({
          title: 'Lesson plan generated & saved!',
          description: `Created ${data.lessonPlan.slides?.length || 0} slides for "${topic.topicName}"`,
        });
      }
    } catch (error) {
      console.error('Error generating lesson plan:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate lesson plan',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatPdfText = (text: string) => sanitizeForPDF(fixEncodingCorruption(text));

  const downloadAsPDF = () => {
    if (!lessonPlan) return;

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Title page
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatPdfText(lessonPlan.title), pageWidth / 2, yPosition + 20, { align: 'center' });
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.text(formatPdfText(`Standard: ${lessonPlan.standard}`), pageWidth / 2, yPosition + 35, { align: 'center' });
    pdf.text(formatPdfText(`Duration: ${lessonPlan.duration}`), pageWidth / 2, yPosition + 45, { align: 'center' });
    
    pdf.setFontSize(12);
    const objectiveLines = pdf.splitTextToSize(formatPdfText(`Objective: ${lessonPlan.objective}`), contentWidth);
    pdf.text(objectiveLines, margin, yPosition + 60);

    // Slides
    lessonPlan.slides.forEach((slide, index) => {
      pdf.addPage();
      yPosition = margin;

      // Slide header
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.text(formatPdfText(`Slide ${slide.slideNumber}`), margin, yPosition);
      
      // Slide title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      yPosition += 15;
      pdf.text(formatPdfText(slide.title), margin, yPosition);

      // Content
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

      // Speaker notes
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

    // Recommended worksheets page
    pdf.addPage();
    yPosition = margin;
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Recommended Practice Worksheets', margin, yPosition);
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    lessonPlan.recommendedWorksheets.forEach((worksheet, index) => {
      pdf.text(formatPdfText(`${index + 1}. ${worksheet.topicName}`), margin, yPosition);
      yPosition += 7;
      pdf.setFont('helvetica', 'italic');
      pdf.text(
        formatPdfText(`   Standard: ${worksheet.standard} | Difficulty: ${worksheet.difficulty}`),
        margin,
        yPosition
      );
      pdf.setFont('helvetica', 'normal');
      yPosition += 12;
    });

    pdf.save(`${lessonPlan.title.replace(/\s+/g, '_')}_Lesson_Plan.pdf`);
    
    toast({
      title: 'PDF downloaded',
      description: 'Your lesson plan has been saved as a PDF.',
    });
  };

  // Helper function to create fill-in-the-blank text
  const createFillInBlank = (text: string, maxBlanks: number = 2): { display: string; answers: string[] } => {
    const words = text.split(' ');
    const answers: string[] = [];
    
    // Find important words (longer words, likely key terms)
    const importantWords = words.filter((word) => {
      const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
      return cleanWord.length >= 5 && 
             !['which', 'where', 'there', 'these', 'those', 'would', 'could', 'should', 'about', 'after', 'before', 'between', 'through'].includes(cleanWord.toLowerCase());
    });
    
    // Select up to maxBlanks words to blank out per sentence
    const wordsToBlank = importantWords.slice(0, Math.min(maxBlanks, importantWords.length));
    
    const display = words.map(word => {
      const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
      if (wordsToBlank.includes(word)) {
        answers.push(cleanWord);
        const punctuation = word.replace(cleanWord, '');
        return '_'.repeat(Math.max(8, cleanWord.length)) + punctuation;
      }
      return word;
    }).join(' ');
    
    return { display, answers };
  };

  const downloadStudentHandout = (options: HandoutOptions) => {
    if (!lessonPlan) return;

    const { blanksPerSection, includedSlideIndices, includeAnswerKey, includeObjective, includePracticeWorkSpace } = options;

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Get selected slides
    const selectedSlides = lessonPlan.slides.filter((_, idx) => includedSlideIndices.includes(idx));

    // Header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Student Notes', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;
    
    pdf.setFontSize(14);
    pdf.text(lessonPlan.title, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Standard: ${lessonPlan.standard}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;

    // Name and date line
    pdf.setFontSize(11);
    pdf.text('Name: _______________________________', margin, yPosition);
    pdf.text('Date: ________________', pageWidth - margin - 50, yPosition);
    yPosition += 10;

    // Answer key collection
    const allAnswers: { section: string; answers: string[] }[] = [];

    // Objective (fill in the blank)
    if (includeObjective) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Learning Objective:', margin, yPosition);
      yPosition += 7;
      pdf.setFont('helvetica', 'normal');
      const objectiveBlank = createFillInBlank(lessonPlan.objective, blanksPerSection);
      const objectiveLines = pdf.splitTextToSize(objectiveBlank.display, contentWidth);
      pdf.text(objectiveLines, margin, yPosition);
      yPosition += objectiveLines.length * 6 + 8;

      if (objectiveBlank.answers.length > 0) {
        allAnswers.push({ section: 'Objective', answers: objectiveBlank.answers });
      }
    }

    // Process instruction and example slides for notes
    const noteSlides = selectedSlides.filter(s => 
      ['instruction', 'example', 'objective'].includes(s.slideType)
    );

    noteSlides.forEach((slide, slideIndex) => {
      if (yPosition > pageHeight - 50) {
        pdf.addPage();
        yPosition = margin;
      }

      // Section header
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${slideIndex + 1}. ${slide.title}`, margin, yPosition);
      yPosition += 8;

      const slideAnswers: string[] = [];

      // Fill-in-the-blank notes
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      slide.content.forEach((item) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }

        const blankVersion = createFillInBlank(item, blanksPerSection);
        slideAnswers.push(...blankVersion.answers);
        
        const lines = pdf.splitTextToSize(`• ${blankVersion.display}`, contentWidth - 5);
        pdf.text(lines, margin + 5, yPosition);
        yPosition += lines.length * 5 + 4;
      });

      if (slideAnswers.length > 0) {
        allAnswers.push({ section: slide.title, answers: slideAnswers });
      }

      yPosition += 5;
    });

    // Practice problems section
    const practiceSlides = selectedSlides.filter(s => s.slideType === 'practice');
    
    if (practiceSlides.length > 0) {
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Practice Problems', margin, yPosition);
      yPosition += 10;

      practiceSlides.forEach((slide, index) => {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Practice ${index + 1}: ${slide.title}`, margin, yPosition);
        yPosition += 7;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        slide.content.forEach((item, i) => {
          if (yPosition > pageHeight - 25) {
            pdf.addPage();
            yPosition = margin;
          }

          const lines = pdf.splitTextToSize(`${i + 1}. ${item}`, contentWidth - 10);
          pdf.text(lines, margin + 5, yPosition);
          yPosition += lines.length * 5 + 3;
          
          // Add work space if enabled
          if (includePracticeWorkSpace) {
            yPosition += 15;
            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin + 10, yPosition, pageWidth - margin, yPosition);
            yPosition += 8;
          } else {
            yPosition += 5;
          }
        });

        yPosition += 5;
      });
    }

    // Summary section with blanks
    const summarySlides = selectedSlides.filter(s => s.slideType === 'summary');
    
    if (summarySlides.length > 0) {
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Key Takeaways', margin, yPosition);
      yPosition += 10;

      summarySlides.forEach(slide => {
        const summaryAnswers: string[] = [];
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        slide.content.forEach(item => {
          if (yPosition > pageHeight - 25) {
            pdf.addPage();
            yPosition = margin;
          }

          const blankVersion = createFillInBlank(item, blanksPerSection);
          summaryAnswers.push(...blankVersion.answers);
          
          const lines = pdf.splitTextToSize(`✓ ${blankVersion.display}`, contentWidth);
          pdf.text(lines, margin, yPosition);
          yPosition += lines.length * 5 + 4;
        });

        if (summaryAnswers.length > 0) {
          allAnswers.push({ section: 'Key Takeaways', answers: summaryAnswers });
        }
      });
    }

    // Answer key page (for teacher)
    if (includeAnswerKey && allAnswers.length > 0) {
      pdf.addPage();
      yPosition = margin;
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('ANSWER KEY (Teacher Copy)', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 12;

      pdf.setFontSize(10);
      allAnswers.forEach(section => {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.text(section.section + ':', margin, yPosition);
        yPosition += 6;

        pdf.setFont('helvetica', 'normal');
        const answersText = section.answers.join(', ');
        const answerLines = pdf.splitTextToSize(answersText, contentWidth - 10);
        pdf.text(answerLines, margin + 5, yPosition);
        yPosition += answerLines.length * 5 + 6;
      });
    }

    pdf.save(`${lessonPlan.title.replace(/\s+/g, '_')}_Student_Handout.pdf`);
    
    toast({
      title: 'Student handout downloaded',
      description: `Fill-in-the-blank notes with ${blanksPerSection} blank(s) per section.`,
    });
  };

  const downloadAsPowerPoint = () => {
    if (!lessonPlan) return;

    const pptx = new pptxgen();
    
    // Set presentation properties
    pptx.author = 'NYCLogic Ai';
    pptx.title = lessonPlan.title;
    pptx.subject = `Lesson on ${lessonPlan.topicName}`;
    
    // Slide dimensions and margins (in inches)
    const slideMargin = 0.5;
    const contentWidth = 9; // 10" slide width - margins
    const maxContentY = 4.8; // Maximum Y position before needing new slide
    const titleHeight = 0.7;
    const bulletLineHeight = 0.35; // Approximate height per bullet line at fontSize 16
    const maxCharsPerLine = 85; // Max characters per line at fontSize 16
    
    // Use theme colors if provided, otherwise fall back to defaults
    const defaultSlideColors: Record<string, { bg: string; text: string }> = {
      title: { bg: '3B82F6', text: 'FFFFFF' },
      objective: { bg: '3B82F6', text: 'FFFFFF' },
      instruction: { bg: '10B981', text: 'FFFFFF' },
      example: { bg: 'A855F7', text: 'FFFFFF' },
      practice: { bg: 'F97316', text: 'FFFFFF' },
      summary: { bg: 'F43F5E', text: 'FFFFFF' },
    };

    const slideColors = presentationTheme?.slideColors || defaultSlideColors;
    const themeColors = presentationTheme?.colors || { primary: '3B82F6', text: '1F2937', background: 'FFFFFF' };

    // Helper function to estimate lines needed for text
    const estimateLines = (text: string, maxChars: number): number => {
      return Math.ceil(text.length / maxChars);
    };

    // Helper function to add decorative elements (shapes/clipart)
    const addSlideDecoration = (pptSlide: any, slideType: string, colors: { bg: string; text: string }) => {
      // Add corner accent shape based on slide type
      const shapeConfigs: Record<string, { shape: string; x: number; y: number; w: number; h: number; rotate?: number }> = {
        title: { shape: 'diamond', x: 8.8, y: 0.2, w: 0.6, h: 0.6 },
        objective: { shape: 'ellipse', x: 9.0, y: 4.8, w: 0.5, h: 0.5 },
        instruction: { shape: 'rect', x: 9.1, y: 0.15, w: 0.4, h: 0.4, rotate: 45 },
        example: { shape: 'triangle', x: 8.9, y: 4.7, w: 0.5, h: 0.5 },
        practice: { shape: 'ellipse', x: 0.15, y: 4.8, w: 0.4, h: 0.4 },
        summary: { shape: 'diamond', x: 9.0, y: 4.7, w: 0.5, h: 0.5 },
      };

      const config = shapeConfigs[slideType] || shapeConfigs.instruction;
      
      // Add main decorative shape
      pptSlide.addShape(config.shape as any, {
        x: config.x,
        y: config.y,
        w: config.w,
        h: config.h,
        fill: { color: colors.bg, transparency: 30 },
        rotate: config.rotate || 0,
      });

      // Add smaller accent shape
      pptSlide.addShape('ellipse', {
        x: config.x - 0.3,
        y: config.y + 0.15,
        w: 0.2,
        h: 0.2,
        fill: { color: colors.bg, transparency: 50 },
      });
    };

    // Helper function to add themed background and borders
    const addSlideBackground = (pptSlide: any, colors: { bg: string; text: string }) => {
      if (presentationTheme) {
        pptSlide.addShape('rect', {
          x: 0,
          y: 0,
          w: '100%',
          h: '100%',
          fill: { color: themeColors.background },
        });
      }
      
      // Add top accent bar
      pptSlide.addShape('rect', {
        x: 0,
        y: 0,
        w: '100%',
        h: 0.12,
        fill: { type: 'solid', color: colors.bg },
      });
      
      // Add left sidebar accent
      pptSlide.addShape('rect', {
        x: 0,
        y: 0,
        w: 0.06,
        h: '100%',
        fill: { type: 'solid', color: colors.bg },
      });

      // Add bottom border line for visual containment
      pptSlide.addShape('rect', {
        x: slideMargin,
        y: 5.2,
        w: contentWidth,
        h: 0.02,
        fill: { type: 'solid', color: colors.bg, transparency: 60 },
      });
    };

    // Helper function to add user clipart to a slide
    const addUserClipart = (pptSlide: any, slideIndex: number, colors: { bg: string; text: string }) => {
      const clipartItems = slideClipart[slideIndex] || [];
      
      clipartItems.forEach(item => {
        // Pass custom x/y coordinates to getClipartPosition
        const pos = getClipartPosition(item.position, item.size, item.x, item.y);
        
        // Check if this is an AI-generated image
        if (item.isGenerated && item.imageUrl) {
          // Add AI-generated image directly
          try {
            pptSlide.addImage({
              data: item.imageUrl, // base64 data URL
              x: pos.x,
              y: pos.y,
              w: pos.w * 1.5, // Make AI images slightly larger
              h: pos.h * 1.5,
            });
          } catch (error) {
            console.error('Failed to add AI image to slide:', error);
            // Fallback to placeholder
            pptSlide.addShape('rect', {
              x: pos.x,
              y: pos.y,
              w: pos.w,
              h: pos.h,
              fill: { color: colors.bg, transparency: 80 },
              line: { color: colors.bg, width: 2 },
            });
          }
        } else {
          // Standard SVG clipart - use shape placeholder
          const svg = getClipartSvg(item.clipartId);
          if (!svg) return;
          
          // Add a colored shape as a placeholder (pptxgenjs doesn't support inline SVG directly)
          pptSlide.addShape('rect', {
            x: pos.x,
            y: pos.y,
            w: pos.w,
            h: pos.h,
            fill: { color: colors.bg, transparency: 80 },
            line: { color: colors.bg, width: 2 },
          });
          
          // Add a label below for what the clipart represents
          const clipartName = item.clipartId.charAt(0).toUpperCase() + item.clipartId.slice(1).replace(/-/g, ' ');
          pptSlide.addText(clipartName, {
            x: pos.x,
            y: pos.y + pos.h + 0.05,
            w: pos.w,
            h: 0.2,
            fontSize: 7,
            color: colors.bg,
            align: 'center',
          });
        }
      });
    };

    // Helper to split content into multiple slides if needed
    const createContentSlides = (slide: typeof lessonPlan.slides[0], slideIndex: number) => {
      const colors = slideColors[slide.slideType] || { bg: 'E5E7EB', text: '1F2937' };
      const contentStartY = 1.7;
      const maxBulletsPerSlide = 5; // Maximum bullets per slide to prevent overflow
      
      // Calculate total lines needed
      let totalLines = 0;
      slide.content.forEach(item => {
        totalLines += estimateLines(item, maxCharsPerLine);
      });

      // Determine if we need to split
      const needsSplit = slide.content.length > maxBulletsPerSlide || totalLines > 12;
      
      if (!needsSplit) {
        // Single slide - existing behavior with proper margins
        const pptSlide = pptx.addSlide();
        addSlideBackground(pptSlide, colors);
        addSlideDecoration(pptSlide, slide.slideType, colors);
        addUserClipart(pptSlide, slideIndex, colors);
        
        pptSlide.addText(slide.slideType.toUpperCase(), {
          x: slideMargin,
          y: 0.25,
          w: 1.6,
          h: 0.35,
          fontSize: 10,
          bold: true,
          color: colors.text,
          fill: { color: colors.bg },
          align: 'center',
          valign: 'middle',
        });

        // Slide title with proper width constraint
        pptSlide.addText(slide.title, {
          x: slideMargin,
          y: 0.75,
          w: contentWidth,
          h: titleHeight,
          fontSize: 26,
          bold: true,
          color: presentationTheme ? themeColors.text : '1F2937',
          wrap: true,
        });

        // Content bullets with proper margins and smaller font for better fit
        const bulletPoints = slide.content.map((item) => ({
          text: item,
          options: { 
            bullet: { type: 'bullet' as const, color: colors.bg }, 
            indentLevel: 0,
            breakLine: true,
          },
        }));

        pptSlide.addText(bulletPoints, {
          x: slideMargin,
          y: contentStartY,
          w: contentWidth,
          h: 3.3,
          fontSize: 16,
          color: presentationTheme ? themeColors.text : '374151',
          valign: 'top',
          lineSpacing: 26,
          wrap: true,
        });

        // Speaker notes
        if (slide.speakerNotes) {
          pptSlide.addNotes(slide.speakerNotes);
        }
      } else {
        // Split into multiple slides
        const chunks: string[][] = [];
        let currentChunk: string[] = [];
        let currentLines = 0;

        slide.content.forEach(item => {
          const itemLines = estimateLines(item, maxCharsPerLine);
          
          if (currentChunk.length >= maxBulletsPerSlide || currentLines + itemLines > 10) {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk);
            }
            currentChunk = [item];
            currentLines = itemLines;
          } else {
            currentChunk.push(item);
            currentLines += itemLines;
          }
        });
        
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }

        // Create a slide for each chunk
        chunks.forEach((chunk, chunkIndex) => {
          const pptSlide = pptx.addSlide();
          addSlideBackground(pptSlide, colors);
          addSlideDecoration(pptSlide, slide.slideType, colors);
          // Only add clipart to first chunk of split slides
          if (chunkIndex === 0) {
            addUserClipart(pptSlide, slideIndex, colors);
          }
          
          // Slide type badge with continuation indicator
          const badgeText = chunkIndex > 0 
            ? `${slide.slideType.toUpperCase()} (cont.)`
            : slide.slideType.toUpperCase();
          
          pptSlide.addText(badgeText, {
            x: slideMargin,
            y: 0.25,
            w: chunkIndex > 0 ? 2.0 : 1.6,
            h: 0.35,
            fontSize: 10,
            bold: true,
            color: colors.text,
            fill: { color: colors.bg },
            align: 'center',
            valign: 'middle',
          });

          // Slide title (same on all continuation slides)
          const titleSuffix = chunkIndex > 0 ? ` (${chunkIndex + 1}/${chunks.length})` : '';
          pptSlide.addText(slide.title + titleSuffix, {
            x: slideMargin,
            y: 0.75,
            w: contentWidth,
            h: titleHeight,
            fontSize: 26,
            bold: true,
            color: presentationTheme ? themeColors.text : '1F2937',
            wrap: true,
          });

          // Content bullets for this chunk
          const bulletPoints = chunk.map((item) => ({
            text: item,
            options: { 
              bullet: { type: 'bullet' as const, color: colors.bg }, 
              indentLevel: 0,
              breakLine: true,
            },
          }));

          pptSlide.addText(bulletPoints, {
            x: slideMargin,
            y: contentStartY,
            w: contentWidth,
            h: 3.3,
            fontSize: 16,
            color: presentationTheme ? themeColors.text : '374151',
            valign: 'top',
            lineSpacing: 26,
            wrap: true,
          });

          // Speaker notes only on first slide of split
          if (chunkIndex === 0 && slide.speakerNotes) {
            pptSlide.addNotes(slide.speakerNotes);
          } else if (chunkIndex > 0) {
            pptSlide.addNotes(`Continuation of: ${slide.title}`);
          }
        });
      }
    };

    // Title slide with theme background
    const titleSlide = pptx.addSlide();
    const titleColors = slideColors.title || { bg: '3B82F6', text: 'FFFFFF' };
    
    if (presentationTheme) {
      titleSlide.addShape('rect', {
        x: 0,
        y: 0,
        w: '100%',
        h: '100%',
        fill: { color: themeColors.background },
      });
    }
    
    // Decorative accent bar at top
    titleSlide.addShape('rect', {
      x: 0,
      y: 0,
      w: '100%',
      h: 0.25,
      fill: { type: 'solid', color: themeColors.primary },
    });

    // Decorative corner shapes for title slide
    titleSlide.addShape('diamond', {
      x: 0.3,
      y: 0.5,
      w: 0.5,
      h: 0.5,
      fill: { color: themeColors.primary, transparency: 40 },
    });
    titleSlide.addShape('ellipse', {
      x: 9.2,
      y: 4.6,
      w: 0.4,
      h: 0.4,
      fill: { color: themeColors.primary, transparency: 40 },
    });

    // Title slide with standards and aim
    titleSlide.addText(lessonPlan.title, {
      x: slideMargin,
      y: 1.35,
      w: contentWidth,
      h: 1.1,
      fontSize: 34,
      bold: true,
      color: themeColors.text,
      align: 'center',
      valign: 'middle',
      wrap: true,
    });
    
    titleSlide.addText(`Standards: ${lessonPlan.standard}`, {
      x: slideMargin,
      y: 2.7,
      w: contentWidth,
      h: 0.45,
      fontSize: 18,
      color: themeColors.primary,
      align: 'center',
      wrap: true,
    });

    titleSlide.addText(lessonPlan.aim, {
      x: slideMargin + 0.4,
      y: 3.25,
      w: contentWidth - 0.8,
      h: 1,
      fontSize: 18,
      bold: true,
      color: themeColors.text,
      align: 'center',
      valign: 'middle',
      wrap: true,
    });
    
    titleSlide.addText(`Duration: ${lessonPlan.duration}`, {
      x: slideMargin,
      y: 4.45,
      w: contentWidth,
      h: 0.4,
      fontSize: 16,
      color: '6B7280',
      align: 'center',
    });

    // Aim and standards slide
    const aimSlide = pptx.addSlide();
    const aimColors = slideColors.objective || { bg: '3B82F6', text: 'FFFFFF' };
    addSlideBackground(aimSlide, aimColors);
    addSlideDecoration(aimSlide, 'objective', aimColors);

    aimSlide.addText('Aim & Standards', {
      x: slideMargin,
      y: 0.5,
      w: contentWidth,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: presentationTheme ? themeColors.text : '1F2937',
    });

    aimSlide.addText([
      { text: lessonPlan.aim, options: { bullet: true, indentLevel: 0 } },
      { text: `Standards: ${lessonPlan.standard}`, options: { bullet: true, indentLevel: 0 } },
    ], {
      x: slideMargin,
      y: 1.5,
      w: contentWidth,
      h: 2.4,
      fontSize: 18,
      color: presentationTheme ? themeColors.text : '374151',
      valign: 'top',
      wrap: true,
      lineSpacing: 28,
    });

    // Objective slide with proper margins
    const objectiveSlide = pptx.addSlide();
    const objColors = slideColors.objective || { bg: '3B82F6', text: 'FFFFFF' };
    addSlideBackground(objectiveSlide, objColors);
    addSlideDecoration(objectiveSlide, 'objective', objColors);
    
    objectiveSlide.addText('Learning Objective', {
      x: slideMargin,
      y: 0.5,
      w: contentWidth,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: presentationTheme ? themeColors.text : '1F2937',
    });
    
    objectiveSlide.addText(lessonPlan.objective, {
      x: slideMargin,
      y: 1.5,
      w: contentWidth,
      h: 3.3,
      fontSize: 18,
      color: presentationTheme ? themeColors.text : '374151',
      valign: 'top',
      wrap: true,
      lineSpacing: 28,
    });

    // Content slides - using the helper that handles splitting
    lessonPlan.slides.forEach((slide, slideIndex) => {
      createContentSlides(slide, slideIndex);
    });

    // Recommended worksheets slide with proper margins
    if (lessonPlan.recommendedWorksheets.length > 0) {
      const worksheetSlide = pptx.addSlide();
      const summaryColors = slideColors.summary || { bg: 'F43F5E', text: 'FFFFFF' };
      addSlideBackground(worksheetSlide, summaryColors);
      addSlideDecoration(worksheetSlide, 'summary', summaryColors);
      
      worksheetSlide.addText('Recommended Practice Worksheets', {
        x: slideMargin,
        y: 0.5,
        w: contentWidth,
        h: 0.8,
        fontSize: 26,
        bold: true,
        color: presentationTheme ? themeColors.text : '1F2937',
      });

      const worksheetBullets = lessonPlan.recommendedWorksheets.map((ws) => ({
        text: `${ws.topicName} (${ws.standard}) - ${ws.difficulty}`,
        options: { bullet: true, indentLevel: 0 },
      }));

      worksheetSlide.addText(worksheetBullets, {
        x: slideMargin,
        y: 1.5,
        w: contentWidth,
        h: 3.3,
        fontSize: 16,
        color: presentationTheme ? themeColors.text : '374151',
        valign: 'top',
        lineSpacing: 26,
        wrap: true,
      });
    }

    // Save the PowerPoint file
    pptx.writeFile({ fileName: `${lessonPlan.title.replace(/\s+/g, '_')}_Lesson_Plan.pptx` });

    toast({
      title: 'PowerPoint downloaded',
      description: 'Your lesson plan has been saved as a .pptx file with proper margins and decorative shapes.',
    });
  };

  const pushToSisterApps = async () => {
    if (!lessonPlan || !classId) {
      toast({
        title: 'Cannot push to sister apps',
        description: 'Please select a class first.',
        variant: 'destructive',
      });
      return;
    }

    setIsPushingToSisterApp(true);

    try {
      const result = await pushToSisterApp({
        type: 'assignment_push',
        source: 'scan_genius',
        class_id: classId,
        title: lessonPlan.title,
        description: `Lesson on ${lessonPlan.topicName} - ${lessonPlan.objective}`,
        standard_code: lessonPlan.standard,
        topic_name: lessonPlan.topicName,
        xp_reward: 50,
        coin_reward: 25,
        remediation_recommendations: [
          `Study ${lessonPlan.topicName}`,
          `Review ${lessonPlan.standard} concepts`,
        ],
        difficulty_level: 'C',
      });

      if (result.success) {
        toast({
          title: 'Pushed to sister apps!',
          description: 'The lesson plan has been shared with connected apps.',
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error pushing to sister apps:', error);
      toast({
        title: 'Push failed',
        description: error instanceof Error ? error.message : 'Failed to push to sister apps',
        variant: 'destructive',
      });
    } finally {
      setIsPushingToSisterApp(false);
    }
  };

  const getSlideTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      title: 'bg-primary text-primary-foreground',
      objective: 'bg-blue-500 text-white',
      instruction: 'bg-emerald-500 text-white',
      example: 'bg-purple-500 text-white',
      practice: 'bg-orange-500 text-white',
      summary: 'bg-rose-500 text-white',
    };
    return colors[type] || 'bg-muted';
  };

  const currentSlideData = lessonPlan?.slides?.[currentSlide];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="h-5 w-5" />
            AI Lesson Plan Generator
          </DialogTitle>
          <DialogDescription>
            {topic ? `Generate a standards-aligned lesson for "${topic.topicName}" (${topic.standard})` : 'Select a topic to generate a lesson plan'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {!lessonPlan ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-1 block">Lesson Duration</label>
                    <Select value={lessonDuration} onValueChange={setLessonDuration}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30 minutes">30 minutes</SelectItem>
                        <SelectItem value="45 minutes">45 minutes</SelectItem>
                        <SelectItem value="60 minutes">60 minutes</SelectItem>
                        <SelectItem value="90 minutes">90 minutes (block)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {topic && (
                  <Card className="bg-muted/50">
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <BookOpen className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{topic.topicName}</p>
                          <p className="text-sm text-muted-foreground">
                            Standard: {topic.standard} {topic.subject && `• ${topic.subject}`}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={generateLessonPlan}
                    disabled={!topic || isGenerating}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Presentation className="h-4 w-4 mr-2" />
                        PowerPoint Style
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setShowNycologicPresents(true)}
                    disabled={!topic}
                    variant="secondary"
                    className="w-full bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 hover:from-slate-700 hover:via-slate-600 hover:to-slate-700 text-white border-2 border-amber-400/50 shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <img src={nyclogicLogo} alt="NYClogic" className="h-6 w-6 mr-2" />
                    <span className="font-semibold">NYClogic PRESENTS:</span>
                    <span className="ml-2 text-xs bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full">NEW</span>
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Choose PowerPoint for traditional slides, or NYClogic PRESENTS: for a modern, interactive web-style presentation
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Lesson header with edit toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input
                        value={lessonPlan.title}
                        onChange={(e) => updateLessonTitle(e.target.value)}
                        className="text-base font-bold mb-1 h-8"
                      />
                    ) : (
                      <h3 className="text-base font-bold truncate">{lessonPlan.title}</h3>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{lessonPlan.standard}</Badge>
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {lessonPlan.duration}
                      </Badge>
                    </div>
                    {isEditing ? (
                      <div className="mt-1 space-y-2">
                        <Textarea
                          value={lessonPlan.aim}
                          onChange={(e) => updateAim(e.target.value)}
                          className="text-sm"
                          rows={2}
                          placeholder="Aim: Students will..."
                        />
                        <Textarea
                          value={lessonPlan.objective}
                          onChange={(e) => updateObjective(e.target.value)}
                          className="text-sm"
                          rows={2}
                        />
                      </div>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-muted-foreground line-clamp-2"><span className="font-medium text-foreground">Aim:</span> {lessonPlan.aim}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2"><span className="font-medium text-foreground">Objective:</span> {lessonPlan.objective}</p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant={isEditing ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsEditing(!isEditing);
                      setEditingContentIndex(null);
                    }}
                    className="flex-shrink-0 h-7 px-2 text-xs"
                  >
                    {isEditing ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Done
                      </>
                    ) : (
                      <>
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Slide viewer */}
                {currentSlideData && (
                  <Card 
                    ref={slideContainerRef}
                    className={`${getSlideTypeColor(currentSlideData.slideType)} min-h-[180px] relative overflow-hidden`}
                  >
                    {/* Draggable clipart overlays */}
                    {(slideClipart[currentSlide]?.length > 0) && slideClipart[currentSlide].map((item, idx) => (
                      <DraggableClipart
                        key={`${item.clipartId}-${idx}`}
                        item={item}
                        index={idx}
                        onPositionChange={(clipartIdx, x, y) => updateClipartPosition(currentSlide, clipartIdx, x, y)}
                        onRemove={(clipartIdx) => removeClipartByIndex(currentSlide, clipartIdx)}
                        containerRef={slideContainerRef}
                        isEditing={isEditing}
                      />
                    ))}
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 opacity-75" />
                          <Select
                            value={currentSlideData.slideType}
                            onValueChange={(value) => updateSlideType(value as LessonSlide['slideType'])}
                          >
                            <SelectTrigger className="w-[130px] h-8 bg-white/20 border-white/30 text-inherit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {slideTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="capitalize">
                          {currentSlideData.slideType}
                        </Badge>
                      )}
                      <div className="flex items-center gap-2">
                        {isEditing && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-inherit hover:bg-white/20"
                              onClick={addNewSlide}
                              title="Add slide after current"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-inherit hover:bg-white/20 hover:text-red-200"
                              onClick={deleteCurrentSlide}
                              disabled={lessonPlan.slides.length <= 1}
                              title="Delete current slide"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-5 bg-white/30 mx-1" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-inherit hover:bg-white/20"
                              onClick={moveSlideUp}
                              disabled={currentSlide === 0}
                              title="Move slide up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-inherit hover:bg-white/20"
                              onClick={moveSlideDown}
                              disabled={currentSlide === lessonPlan.slides.length - 1}
                              title="Move slide down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-5 bg-white/30 mx-1" />
                            <SlideClipartPicker
                              slideClipart={slideClipart[currentSlide] || []}
                              onClipartChange={(clipart) => updateSlideClipart(currentSlide, clipart)}
                            />
                          </div>
                        )}
                        <span className="text-sm opacity-75">
                          Slide {currentSlide + 1} of {lessonPlan.slides.length}
                        </span>
                      </div>
                    </div>
                    {isEditing ? (
                      <Input
                        value={currentSlideData.title}
                        onChange={(e) => updateSlideTitle(e.target.value)}
                        className="text-xl font-bold bg-white/20 border-white/30 text-inherit placeholder:text-inherit/50"
                      />
                    ) : (
                      <CardTitle className="text-2xl">{currentSlideData.title}</CardTitle>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {currentSlideData.content.map((item, index) => (
                        <li key={index} className="text-lg flex items-start gap-2 group">
                          <span className="opacity-75 mt-2">•</span>
                          {isEditing ? (
                            <div className="flex-1 flex items-start gap-2">
                              {editingContentIndex === index ? (
                                <Textarea
                                  value={item}
                                  onChange={(e) => updateSlideContent(index, e.target.value)}
                                  onBlur={() => setEditingContentIndex(null)}
                                  autoFocus
                                  className="flex-1 bg-white/20 border-white/30 text-inherit placeholder:text-inherit/50"
                                  rows={2}
                                />
                              ) : (
                                <span 
                                  onClick={() => setEditingContentIndex(index)}
                                  className="flex-1 cursor-text hover:bg-white/10 rounded px-1 -mx-1"
                                >
                                  {item}
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-inherit hover:bg-white/20"
                                onClick={() => removeContentBullet(index)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span>{item}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addContentBullet}
                        className="mt-3 text-inherit hover:bg-white/20"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add bullet point
                      </Button>
                    )}
                    {/* Clipart hint when editing */}
                    {isEditing && (slideClipart[currentSlide]?.length > 0) && (
                      <div className="mt-3 text-xs opacity-60 flex items-center gap-1">
                        <Move className="h-3 w-3" />
                        Drag clipart on slide to reposition • {slideClipart[currentSlide].length} item(s)
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Slide navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentSlide(Math.max(0, currentSlide - 1));
                    setEditingContentIndex(null);
                  }}
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex gap-1">
                  {lessonPlan.slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentSlide(index);
                        setEditingContentIndex(null);
                      }}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        index === currentSlide ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentSlide(Math.min(lessonPlan.slides.length - 1, currentSlide + 1));
                    setEditingContentIndex(null);
                  }}
                  disabled={currentSlide === lessonPlan.slides.length - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

                {/* Speaker notes - collapsible */}
                <Card className="bg-muted/50">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      Speaker Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 px-3">
                    {isEditing ? (
                      <Textarea
                        value={currentSlideData?.speakerNotes || ''}
                        onChange={(e) => updateSpeakerNotes(e.target.value)}
                        placeholder="Add speaker notes for this slide..."
                        className="text-xs"
                        rows={2}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {currentSlideData?.speakerNotes || 'No speaker notes for this slide.'}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Recommended worksheets - compact */}
                {lessonPlan.recommendedWorksheets.length > 0 && (
                  <Card>
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <Printer className="h-3 w-3" />
                        Recommended Worksheets
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {lessonPlan.recommendedWorksheets.map((worksheet, index) => (
                          <Badge key={index} variant="outline" className="text-xs py-0.5">
                            {worksheet.topicName}
                            <span className="ml-1 opacity-75">• {worksheet.difficulty}</span>
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Actions - compact grid layout */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-2">
                  <Button onClick={saveLessonPlan} disabled={isSaving} variant="default" size="sm" className="h-8 px-2 text-xs">
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button 
                    onClick={() => setShowNycologicPresents(true)}
                    variant="outline" 
                    size="sm" 
                    className="h-8 px-3 text-xs bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 hover:from-slate-700 hover:via-slate-600 hover:to-slate-700 text-white border border-amber-400/50 shadow-md shadow-amber-400/20 hover:shadow-amber-400/30 transition-all duration-300"
                  >
                    <Sparkles className="h-3 w-3 mr-1 text-amber-400 animate-pulse" />
                    <span className="font-medium">Nycologic</span>
                  </Button>
                  <Button onClick={downloadAsPowerPoint} variant="outline" size="sm" className="h-8 px-2 text-xs">
                    <FileType className="h-3 w-3 mr-1" />
                    PPTX
                  </Button>
                  <Button onClick={downloadAsPDF} variant="outline" size="sm" className="h-8 px-2 text-xs">
                    <Download className="h-3 w-3 mr-1" />
                    PDF
                  </Button>
                  <Button onClick={() => setShowHandoutDialog(true)} variant="outline" size="sm" className="h-8 px-2 text-xs">
                    <FileSpreadsheet className="h-3 w-3 mr-1" />
                    Handout
                  </Button>
                  <Button 
                    onClick={pushToSisterApps} 
                    disabled={isPushingToSisterApp || !classId}
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2 text-xs"
                  >
                    {isPushingToSisterApp ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    Push
                  </Button>
                  {onOpenLibrary && (
                    <Button
                      onClick={() => onOpenLibrary()}
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                    >
                      <Library className="h-3 w-3 mr-1" />
                      Library
                    </Button>
                  )}
                  <Button 
                    onClick={() => {
                      setLessonPlan(null);
                      setCurrentSlide(0);
                    }} 
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                  >
                    New
                  </Button>
                </div>
            </div>
          )}
          </div>
        </ScrollArea>

        {/* Student Handout Customization Dialog */}
        {lessonPlan && (
          <StudentHandoutDialog
            open={showHandoutDialog}
            onOpenChange={setShowHandoutDialog}
            slides={lessonPlan.slides}
            onGenerate={downloadStudentHandout}
          />
        )}

        {/* Nycologic Presents Builder */}
        <NycologicPresentationBuilder
          open={showNycologicPresents}
          onOpenChange={setShowNycologicPresents}
          topic={topic}
        />
      </DialogContent>
    </Dialog>
  );
}
