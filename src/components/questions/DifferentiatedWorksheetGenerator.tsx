import { useState, useEffect, useRef } from 'react';
import { Loader2, Sparkles, Users, Download, FileText, CheckCircle, AlertCircle, Save, Trash2, TrendingUp, Brain, Eye, ZoomIn, ZoomOut, X, Printer, RefreshCw, QrCode, Palette, BookOpen, ImageIcon, FileType } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { QuestionPreviewPanel } from './QuestionPreviewPanel';
import { GenerationTimeEstimator } from './GenerationTimeEstimator';
import { GenerationProgressCounter } from './GenerationProgressCounter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { useAdaptiveLevels } from '@/hooks/useAdaptiveLevels';
import { fixEncodingCorruption, renderMathText, sanitizeForPDF, sanitizeForWord } from '@/lib/mathRenderer';
import { generateQRCodePngDataUrl, generateStudentQuestionQRData, QR_PRINT_RENDER_SIZE } from '@/lib/qrCodeUtils';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, PageOrientation, BorderStyle, AlignmentType, convertInchesToTwip, ImageRun, Table, TableRow, TableCell, WidthType, VerticalAlign, Header, Footer } from 'docx';

interface WorksheetPreset {
  id: string;
  name: string;
  questionCount: string;
  warmUpCount: string;
  warmUpDifficulty: 'super-easy' | 'easy' | 'very-easy';
  formCount: string;
  includeHints?: boolean;
}

const FORM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
type FormLetter = typeof FORM_LETTERS[number];

type AdvancementLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const formatPdfText = (text: string) => sanitizeForPDF(renderMathText(fixEncodingCorruption(text)));
const formatWordText = (text: string) => sanitizeForWord(text);

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

interface DiagnosticResult {
  id: string;
  student_id: string;
  topic_name: string;
  standard: string | null;
  recommended_level: string | null;
  level_a_score: number;
  level_a_total: number;
  level_b_score: number;
  level_b_total: number;
  level_c_score: number;
  level_c_total: number;
  level_d_score: number;
  level_d_total: number;
  level_e_score: number;
  level_e_total: number;
  level_f_score: number;
  level_f_total: number;
  created_at: string;
}

interface StudentWithDiagnostic extends Student {
  diagnosticResult?: DiagnosticResult;
  recommendedLevel: AdvancementLevel;
  selected: boolean;
  hasAdaptiveData?: boolean;
}

interface GeometryMetadataLite {
  type: string;
  vertices?: Array<{ label: string; x: number; y: number }>;
  axes?: { minX: number; maxX: number; minY: number; maxY: number; showGrid?: boolean; showNumbers?: boolean };
  circle?: { center: { x: number; y: number; label?: string }; radius: number; chordPoints?: Array<{ label: string; x: number; y: number }> };
  measurements?: Array<{ type: string; value: number; unit: string; label?: string }>;
  [key: string]: unknown;
}

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  answer?: string;
  difficulty: string;
  advancementLevel: AdvancementLevel;
  hint?: string;
  svg?: string;
  imageUrl?: string;
  imagePrompt?: string;
  geometry?: GeometryMetadataLite;
}

// Placeholder SVG for when shape generation fails
const PLACEHOLDER_SHAPE_SVG = `data:image/svg+xml;base64,${btoa(`<svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="300" height="200" fill="#f9fafb" stroke="#d1d5db" stroke-width="2" rx="8"/>
  <text x="150" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#6b7280">Diagram not available</text>
  <text x="150" y="115" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#9ca3af">Click ↻ to regenerate</text>
  <path d="M140 50 L160 50 L150 35 Z" fill="none" stroke="#9ca3af" stroke-width="1.5"/>
  <rect x="143" y="52" width="14" height="14" fill="none" stroke="#9ca3af" stroke-width="1.5"/>
  <circle cx="150" cy="50" r="20" fill="none" stroke="#d1d5db" stroke-width="1"/>
</svg>`)}`;

interface DifferentiatedWorksheetGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnosticMode?: boolean;
  initialTopics?: { topicName: string; standard: string }[];
}

const LEVELS: AdvancementLevel[] = ['A', 'B', 'C', 'D', 'E', 'F'];

const getLevelColor = (level: AdvancementLevel) => {
  switch (level) {
    case 'A': return 'bg-green-100 text-green-800 border-green-300';
    case 'B': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'D': return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'E': return 'bg-red-100 text-red-800 border-red-300';
    case 'F': return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

const getLevelDescription = (level: AdvancementLevel) => {
  switch (level) {
    case 'A': return 'Advanced';
    case 'B': return 'Proficient';
    case 'C': return 'Developing';
    case 'D': return 'Beginning';
    case 'E': return 'Emerging';
    case 'F': return 'Foundational';
  }
};

// Generate a simple hash from student name for variation
const getStudentVariationSeed = (firstName: string, lastName: string): number => {
  const str = `${firstName}${lastName}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Convert SVG string to data URI for display
const svgToDataUri = (svg: string): string => {
  if (!svg) return '';
  // Check if it's already a data URI or URL
  if (svg.startsWith('data:') || svg.startsWith('http')) {
    return svg;
  }
  // Convert SVG string to data URI
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
};

// Convert SVG to PNG data URL for PDF embedding
const svgToPngDataUrl = async (svgInput: string, width: number = 200, height: number = 200): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!svgInput) {
      reject(new Error('No SVG input provided'));
      return;
    }
    
    // If it's already a PNG or JPEG data URL, return it as-is
    if (svgInput.startsWith('data:image/png') || svgInput.startsWith('data:image/jpeg')) {
      resolve(svgInput);
      return;
    }
    
    // Create an image element
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    let objectUrl: string | null = null;
    
    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load timeout'));
    }, 10000);
    
    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement('canvas');
        const naturalWidth = img.naturalWidth || img.width || width;
        const naturalHeight = img.naturalHeight || img.height || height;
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          
          // Scale image to fit while maintaining aspect ratio
          const scale = Math.min(width / naturalWidth, height / naturalHeight);
          const scaledWidth = naturalWidth * scale;
          const scaledHeight = naturalHeight * scale;
          const x = (width - scaledWidth) / 2;
          const y = (height - scaledHeight) / 2;
          
          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          const pngDataUrl = canvas.toDataURL('image/png', 1.0);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          resolve(pngDataUrl);
        } else {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not get canvas context'));
        }
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    
    img.onerror = () => {
      clearTimeout(timeoutId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load SVG'));
    };
    
    // Handle different input types
    if (svgInput.startsWith('data:image/svg+xml')) {
      // SVG data URL - use directly
      img.src = svgInput;
    } else if (svgInput.startsWith('http://') || svgInput.startsWith('https://')) {
      // HTTP URL - try to load and convert via canvas
      img.src = svgInput;
    } else if (svgInput.startsWith('<svg') || svgInput.includes('xmlns') || svgInput.includes('<svg')) {
      // Raw SVG string - create blob URL
      let svgContent = svgInput.trim();
      if (!svgContent.startsWith('<?xml')) {
        svgContent = '<?xml version="1.0" encoding="UTF-8"?>' + svgContent;
      }
      if (!svgContent.includes('xmlns=')) {
        svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      objectUrl = URL.createObjectURL(svgBlob);
      img.src = objectUrl;
    } else {
      // Unknown format, try using as-is
      img.src = svgInput;
    }
  });
};

// Generate QR code as PNG data URL for PDF embedding
const generateQRCodeDataUrl = async (
  studentId: string,
  worksheetId: string,
  size: number = QR_PRINT_RENDER_SIZE
): Promise<string> => {
  const renderSize = Math.max(size, QR_PRINT_RENDER_SIZE);
  return generateQRCodePngDataUrl(generateStudentQuestionQRData(studentId, worksheetId), renderSize);
};

interface ClassOption {
  id: string;
  name: string;
}

export function DifferentiatedWorksheetGenerator({ open, onOpenChange, diagnosticMode = false, initialTopics = [] }: DifferentiatedWorksheetGeneratorProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { trackFeature } = useFeatureTracking();
  
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentWithDiagnostic[]>([]);
  const [questionCount, setQuestionCount] = useState('5');
  const [warmUpCount, setWarmUpCount] = useState('2');
  const [warmUpDifficulty, setWarmUpDifficulty] = useState<'super-easy' | 'easy' | 'very-easy'>('very-easy');
  const [formCount, setFormCount] = useState(diagnosticMode ? '4' : '1');
  const [includeHints, setIncludeHints] = useState(false);
  const [useAdaptiveDifficulty, setUseAdaptiveDifficulty] = useState(true);
  const [includeStudentQR, setIncludeStudentQR] = useState(true);
  const [onlyWithoutDiagnostic, setOnlyWithoutDiagnostic] = useState(false);
  const [marginSize, setMarginSize] = useState<'small' | 'medium' | 'large'>('medium');
  
  // Storyboard art settings for non-math subjects
  const [includeStoryboardArt, setIncludeStoryboardArt] = useState(false);
  const [storyboardSubject, setStoryboardSubject] = useState<'english' | 'history' | 'biology' | 'chemistry' | 'physics' | 'science' | 'social-studies'>('english');
  const [storyboardStyle, setStoryboardStyle] = useState<'storyboard' | 'illustration' | 'diagram'>('storyboard');
  const [storyboardImages, setStoryboardImages] = useState<Record<string, string>>({});
  const [regeneratingImageKey, setRegeneratingImageKey] = useState<string | null>(null);
  
  // Topics from standards menu selection
  const [customTopics, setCustomTopics] = useState<{ topicName: string; standard: string }[]>([]);
  // Adaptive levels based on student performance data
  const { 
    students: adaptiveStudents, 
    isLoading: isLoadingAdaptive,
    studentLevelMap: adaptiveLevelMap,
  } = useAdaptiveLevels({ 
    classId: selectedClassId, 
    topicName: selectedTopics.length > 0 ? selectedTopics[0] : (customTopics.length > 0 ? customTopics[0].topicName : '')
  });

  // Toggle topic selection
  const toggleTopicSelection = (topicName: string) => {
    setSelectedTopics(prev => 
      prev.includes(topicName) 
        ? prev.filter(t => t !== topicName)
        : [...prev, topicName]
    );
  };

  // Pre-configure for diagnostic mode and load initial topics when opened
  useEffect(() => {
    if (open) {
      if (diagnosticMode) {
        setFormCount('4');
        setWarmUpDifficulty('easy');
      }
      // Load initial topics from standards menu selection
      if (initialTopics.length > 0) {
        setCustomTopics(initialTopics);
        // Auto-select all passed topics
        setSelectedTopics(initialTopics.map(t => t.topicName));
      }
    } else {
      // Reset custom topics and selection when closing
      setCustomTopics([]);
      setSelectedTopics([]);
    }
  }, [open, diagnosticMode, initialTopics]);
  
  // Presets
  const [presets, setPresets] = useState<WorksheetPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(75);
  const [previewData, setPreviewData] = useState<{
    students: StudentWithDiagnostic[];
    questions: Record<string, { warmUp: GeneratedQuestion[], main: GeneratedQuestion[] }>;
  } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  
  // Subjects that should NEVER have geometry shapes/diagrams
  const noShapeSubjectKeywords = ['financial', 'finance', 'economics', 'history', 'government', 'english', 'ela', 'bond', 'investment', 'insurance', 'retirement'];
  
  const isNoShapeSubject = customTopics.some((t) => {
    const topicName = t.topicName?.toLowerCase() || "";
    const standard = t.standard?.toLowerCase() || "";
    return noShapeSubjectKeywords.some(ns => topicName.includes(ns) || standard.includes(ns));
  }) || selectedTopics.some((topic) => {
    const topicLower = topic?.toLowerCase() || "";
    return noShapeSubjectKeywords.some(ns => topicLower.includes(ns));
  });
  
  // Selective regeneration state
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [selectedRegenerateKeys, setSelectedRegenerateKeys] = useState<Set<string>>(new Set());
  
  // Geometry shape auto-generation state
  const [includeGeometry] = useState(false);
  const [useAIImages] = useState(false);
  const [preferDeterministicSVG] = useState(false);
  const [geometryShapes, setGeometryShapes] = useState<Record<string, string>>({});
  const [regeneratingShapeKey, setRegeneratingShapeKey] = useState<string | null>(null);
  const pendingShapeCount = useRef(0);
  const [shapesReady, setShapesReady] = useState(true);
  
  // Placeholder Shapes icon component (hidden feature)
  const Shapes = ({ className }: { className?: string }) => null;
  
  // Image generation warning dialog state
  const [showImageWarning, setShowImageWarning] = useState(false);
  const [pendingImageOption, setPendingImageOption] = useState<'geometry' | 'aiImages' | 'storyboard' | null>(null);
  
  // Handler to show warning before enabling image generation
  const handleImageToggle = (option: 'geometry' | 'aiImages' | 'storyboard', currentValue: boolean) => {
    if (!currentValue) {
      // Turning ON - show warning
      setPendingImageOption(option);
      setShowImageWarning(true);
    } else {
      // Turning OFF - no warning needed
      if (option === 'storyboard') setIncludeStoryboardArt(false);
    }
  };
  
  const confirmImageGeneration = () => {
    if (pendingImageOption === 'storyboard') setIncludeStoryboardArt(true);
    setShowImageWarning(false);
    setPendingImageOption(null);
  };
  
  const cancelImageGeneration = () => {
    setShowImageWarning(false);
    setPendingImageOption(null);
  };

  // Auto-generate geometry shapes for questions with imagePrompt when previewData changes
  useEffect(() => {
    if (!previewData) return;

    const questionsToGenerate: { text: string; key: string; prompt: string; geometry?: GeometryMetadataLite }[] = [];

    Object.entries(previewData.questions).forEach(([cacheKey, qs]) => {
      qs.warmUp?.forEach((q, idx) => {
        const key = `${cacheKey}-warmUp-${idx}`;
        if ((q.imagePrompt || q.geometry) && !geometryShapes[key]) {
          questionsToGenerate.push({ text: q.question, key, prompt: q.imagePrompt || '', geometry: q.geometry });
        }
      });
      qs.main?.forEach((q, idx) => {
        const key = `${cacheKey}-main-${idx}`;
        if ((q.imagePrompt || q.geometry) && !geometryShapes[key]) {
          questionsToGenerate.push({ text: q.question, key, prompt: q.imagePrompt || '', geometry: q.geometry });
        }
      });
    });

    if (questionsToGenerate.length === 0) return;

    setShapesReady(false);
    pendingShapeCount.current = questionsToGenerate.length;

    // Generate all shapes in parallel
    const generateAll = async () => {
      await Promise.all(
        questionsToGenerate.map(async ({ text, key, prompt, geometry }) => {
          try {
            await generateGeometryShapeForQuestion(text, key, prompt, geometry);
          } catch (err) {
            console.error(`Failed to auto-generate shape for ${key}:`, err);
          } finally {
            pendingShapeCount.current--;
            if (pendingShapeCount.current <= 0) {
              setShapesReady(true);
            }
          }
        })
      );
      setShapesReady(true);
    };

    generateAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData]);

  // Load presets from localStorage on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem('worksheet-presets');
    if (savedPresets) {
      try {
        setPresets(JSON.parse(savedPresets));
      } catch (e) {
        console.error('Error loading presets:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (open && user) {
      fetchClasses();
    }
  }, [open, user]);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudentsWithDiagnostics();
      fetchTopics();
    }
  }, [selectedClassId]);

  useEffect(() => {
    if ((selectedTopics.length > 0 || customTopics.length > 0) && selectedClassId) {
      fetchStudentsWithDiagnostics();
    }
  }, [selectedTopics, customTopics, adaptiveLevelMap, useAdaptiveDifficulty]);

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

  const fetchTopics = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('diagnostic_results')
        .select('topic_name')
        .eq('teacher_id', user.id);

      if (error) throw error;
      
      const uniqueTopics = [...new Set((data || []).map(d => d.topic_name))];
      setTopics(uniqueTopics);
    } catch (error) {
      console.error('Error fetching topics:', error);
    }
  };

  const fetchStudentsWithDiagnostics = async () => {
    if (!selectedClassId || !user) return;

    setIsLoading(true);
    try {
      // Fetch students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('class_id', selectedClassId)
        .order('last_name');

      if (studentsError) throw studentsError;

      // Fetch diagnostic results for these students
      const studentIds = (studentsData || []).map(s => s.id);
      
      let diagnosticQuery = supabase
        .from('diagnostic_results')
        .select('*')
        .in('student_id', studentIds)
        .eq('teacher_id', user.id);
      
      if (selectedTopics.length > 0) {
        diagnosticQuery = diagnosticQuery.in('topic_name', selectedTopics);
      }
      
      const { data: diagnosticsData, error: diagnosticsError } = await diagnosticQuery;

      if (diagnosticsError) throw diagnosticsError;

      // Check if we have custom topics from standards menu (new diagnostic mode)
      const isNewDiagnosticFromStandards = customTopics.length > 0;
      
      // For new topics, ALL students start at the same intermediate level (C)
      // This ensures fair differentiation only after we see their performance
      const defaultStartingLevel: AdvancementLevel = 'C';

      // Merge students with their most recent diagnostic result and adaptive levels
      const studentsWithDiagnostics: StudentWithDiagnostic[] = (studentsData || []).map(student => {
        const studentDiagnostics = (diagnosticsData || [])
          .filter(d => d.student_id === student.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const latestDiagnostic = studentDiagnostics[0];
        
        // Get adaptive level if available and enabled
        const adaptiveLevel = adaptiveLevelMap[student.id];
        const adaptiveStudent = adaptiveStudents.find(s => s.studentId === student.id);
        const hasPerformanceData = adaptiveStudent?.hasPerformanceData ?? false;
        
        // For NEW topics from standards menu: ALL students start at intermediate level (C)
        // Only use performance-based differentiation for follow-up worksheets
        let recommendedLevel: AdvancementLevel;
        
        if (isNewDiagnosticFromStandards) {
          // New topic = everyone starts equal at intermediate level
          recommendedLevel = defaultStartingLevel;
        } else if (useAdaptiveDifficulty && adaptiveLevel) {
          // Use adaptive level based on past performance for this topic
          recommendedLevel = adaptiveLevel;
        } else {
          // Fall back to diagnostic or default
          recommendedLevel = (latestDiagnostic?.recommended_level as AdvancementLevel) || defaultStartingLevel;
        }
        
        // For new diagnostics from standards, pre-select all students
        // For follow-up worksheets, only select students with existing data
        const shouldBeSelected = isNewDiagnosticFromStandards 
          ? true  // Select all students for new diagnostic
          : (!!latestDiagnostic || hasPerformanceData);  // Only select if has data
        
        return {
          ...student,
          diagnosticResult: latestDiagnostic,
          recommendedLevel,
          selected: shouldBeSelected,
          hasAdaptiveData: hasPerformanceData,
        };
      });

      setStudents(studentsWithDiagnostics);
    } catch (error) {
      console.error('Error fetching students with diagnostics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Preset functions
  const savePreset = () => {
    if (!newPresetName.trim()) {
      toast({ title: 'Please enter a preset name', variant: 'destructive' });
      return;
    }
    
    const newPreset: WorksheetPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      questionCount,
      warmUpCount,
      warmUpDifficulty,
      formCount,
      includeHints,
    };
    
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('worksheet-presets', JSON.stringify(updatedPresets));
    setNewPresetName('');
    setShowSavePreset(false);
    toast({ title: 'Preset saved!', description: `"${newPreset.name}" saved for quick reuse.` });
  };

  const loadPreset = (preset: WorksheetPreset) => {
    setQuestionCount(preset.questionCount);
    setWarmUpCount(preset.warmUpCount);
    setWarmUpDifficulty(preset.warmUpDifficulty);
    setFormCount(preset.formCount || '1');
    setIncludeHints(preset.includeHints ?? false);
    toast({ title: 'Preset loaded', description: `Applied "${preset.name}" settings.` });
  };

  const deletePreset = (presetId: string) => {
    const updatedPresets = presets.filter(p => p.id !== presetId);
    setPresets(updatedPresets);
    localStorage.setItem('worksheet-presets', JSON.stringify(updatedPresets));
    toast({ title: 'Preset deleted' });
  };

const toggleStudent = (studentId: string) => {
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, selected: !s.selected } : s
    ));
  };

  // Allow manual level override for students without data
  const setStudentLevel = (studentId: string, level: AdvancementLevel) => {
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, recommendedLevel: level } : s
    ));
  };

  const selectAll = () => {
    // In diagnostic mode with "only without diagnostic" filter, select students without data
    if (diagnosticMode && onlyWithoutDiagnostic) {
      setStudents(prev => prev.map(s => ({ ...s, selected: !s.diagnosticResult && !s.hasAdaptiveData })));
    } else {
      setStudents(prev => prev.map(s => ({ ...s, selected: !!s.diagnosticResult || !!s.hasAdaptiveData })));
    }
  };

  const deselectAll = () => {
    setStudents(prev => prev.map(s => ({ ...s, selected: false })));
  };

  // Select only students without any diagnostic data (for first-time diagnostics)
  const selectOnlyWithoutDiagnostic = () => {
    setStudents(prev => prev.map(s => ({ ...s, selected: !s.diagnosticResult && !s.hasAdaptiveData })));
  };

  // Helper function to fetch image as ArrayBuffer for Word document
  const fetchImageAsArrayBuffer = async (imageUrl: string): Promise<ArrayBuffer | null> => {
    try {
      // Handle data URLs directly
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      
      // Fetch external URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.error('Failed to fetch image:', response.statusText);
        return null;
      }
      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error fetching image for Word doc:', error);
      return null;
    }
  };

  // Generate Word document with same margins as PDF
  const generateWordDocument = async () => {
    if (!previewData) {
      toast({
        title: 'No preview data',
        description: 'Please generate a preview first.',
        variant: 'destructive',
      });
      return;
    }

    // Wait for any pending shape generations to complete
    if (!shapesReady) {
      setGenerationStatus('Waiting for geometry shapes to finish generating...');
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (pendingShapeCount.current <= 0) {
            clearInterval(interval);
            resolve();
          }
        }, 200);
      });
    }

    setIsGenerating(true);
    setGenerationStatus('Creating Word document...');
    setGenerationProgress(0);

    try {
      const sections: any[] = [];
      const numForms = parseInt(formCount);
      const formsToGenerate = FORM_LETTERS.slice(0, numForms);
      const totalStudents = previewData.students.length;
      let processedStudents = 0;

      for (const student of previewData.students) {
        const studentIdx = previewData.students.filter(s => s.recommendedLevel === student.recommendedLevel)
          .indexOf(student);
        const formIndex = studentIdx % numForms;
        const assignedForm = formsToGenerate[formIndex];
        const cacheKey = `${assignedForm}-${student.recommendedLevel}`;
        const questions = previewData.questions[cacheKey];

        setGenerationStatus(`Processing ${student.first_name} ${student.last_name}...`);

        const children: any[] = [];
        const topicsLabel = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'Math Practice';

        // Generate QR code for student identification - appears on EVERY page
        // Generate QR codes for BOTH sides of the page for reliable scanning
        let qrCodeBuffer: ArrayBuffer | null = null;
        try {
          const { fetchQRCodeAsArrayBuffer } = await import('@/lib/qrCodeUtils');
          qrCodeBuffer = await fetchQRCodeAsArrayBuffer(student.id, 1, 1);
        } catch (qrError) {
          console.error('Error generating QR code for Word document:', qrError);
        }

        // Create page header with QR codes on BOTH SIDES that repeats on EVERY page
        let pageHeader: Header | undefined;
        if (qrCodeBuffer) {
          pageHeader = new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                },
                rows: [
                  new TableRow({
                    children: [
                      // LEFT QR CODE
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new ImageRun({
                                data: qrCodeBuffer,
                                transformation: { width: 60, height: 60 },
                                type: "png",
                              }),
                            ],
                            alignment: AlignmentType.LEFT,
                          }),
                          new Paragraph({
                            children: [
                              new TextRun({ text: "📷 Scan", size: 12, color: "666666" }),
                            ],
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                        verticalAlign: VerticalAlign.CENTER,
                        borders: {
                          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        },
                      }),
                      // CENTER - Student name and level
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${student.first_name} ${student.last_name} - Level ${student.recommendedLevel}`,
                                bold: true,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                          }),
                        ],
                        width: { size: 70, type: WidthType.PERCENTAGE },
                        verticalAlign: VerticalAlign.CENTER,
                        borders: {
                          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        },
                      }),
                      // RIGHT QR CODE (mirror of left)
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new ImageRun({
                                data: qrCodeBuffer,
                                transformation: { width: 60, height: 60 },
                                type: "png",
                              }),
                            ],
                            alignment: AlignmentType.RIGHT,
                          }),
                          new Paragraph({
                            children: [
                              new TextRun({ text: "📷 Scan", size: 12, color: "666666" }),
                            ],
                            alignment: AlignmentType.RIGHT,
                          }),
                        ],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                        verticalAlign: VerticalAlign.CENTER,
                        borders: {
                          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        }

        // Main document header in content area (larger, on first page)
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Level ${student.recommendedLevel} - ${getLevelDescription(student.recommendedLevel)}${numForms > 1 ? ` | Form ${assignedForm}` : ''}`,
                bold: true,
                size: 32,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${topicsLabel.length > 50 ? topicsLabel.substring(0, 47) + '...' : topicsLabel} - Diagnostic Worksheet`,
                size: 24,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );

        // Student info line
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Name: ', bold: true, size: 22 }),
              new TextRun({ text: `${student.first_name} ${student.last_name}`, size: 22 }),
              new TextRun({ text: '          Date: _______________', size: 22 }),
              ...(numForms > 1 ? [new TextRun({ text: `          Form ${assignedForm}`, bold: true, size: 22 })] : []),
            ],
            spacing: { before: 200, after: 200 },
          })
        );

        // AI Grading Instructions Box
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: '[!] IMPORTANT: AI Grading Instructions',
                bold: true,
                size: 18,
              }),
            ],
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
              left: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
              right: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
            },
            shading: { fill: 'EFF6FF' },
            spacing: { before: 200 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '• Write ALL work inside the bordered "WORK AREA" boxes only.  ', size: 16 }),
              new TextRun({ text: '• Work outside boxes may NOT be graded by AI.', size: 16 }),
            ],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
              left: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
              right: { style: BorderStyle.SINGLE, size: 6, color: '3B82F6' },
            },
            shading: { fill: 'EFF6FF' },
            spacing: { after: 300 },
          })
        );

        // Warm-up section
        if (questions?.warmUp && questions.warmUp.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '🔥 Warm-Up: Let\'s Get Started!', bold: true, size: 20, color: '166534' }),
              ],
              shading: { fill: 'F0FDF4' },
              spacing: { before: 200, after: 100 },
            })
          );

          for (let warmUpIdx = 0; warmUpIdx < questions.warmUp.length; warmUpIdx++) {
            const q = questions.warmUp[warmUpIdx];
            const sanitizedQuestion = formatWordText(q.question);
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${q.questionNumber}. `, bold: true, size: 22 }),
                  new TextRun({ text: sanitizedQuestion, size: 20 }),
                ],
                spacing: { before: 100, after: 50 },
              })
            );

            if (q.hint && includeHints) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Hint: ', italics: true, size: 16, color: '6B7280' }),
                    new TextRun({ text: q.hint, italics: true, size: 16, color: '6B7280' }),
                  ],
                  spacing: { after: 100 },
                })
              );
            }

            // Work area box
            children.push(
              new Paragraph({
                children: [new TextRun({ text: '' })],
                border: {
                  top: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  bottom: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  left: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  right: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                },
                spacing: { before: 50, after: 200 },
              })
            );
            // Empty lines for work area
            for (let i = 0; i < 3; i++) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: '' })],
                  border: {
                    left: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                    right: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  },
                })
              );
            }
            children.push(
              new Paragraph({
                children: [new TextRun({ text: '' })],
                border: {
                  bottom: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  left: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                  right: { style: BorderStyle.DASHED, size: 4, color: '9CA3AF' },
                },
                spacing: { after: 200 },
              })
            );
          }
        }

        // Main questions section
        if (questions?.main && questions.main.length > 0) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '📝 Practice Questions', bold: true, size: 20 }),
              ],
              spacing: { before: 300, after: 150 },
            })
          );

          for (let idx = 0; idx < questions.main.length; idx++) {
            const q = questions.main[idx];
            const sanitizedQuestion = formatWordText(q.question);

            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${idx + 1}. `, bold: true, size: 22 }),
                  new TextRun({ text: sanitizedQuestion, size: 20 }),
                ],
                spacing: { before: 150, after: 50 },
              })
            );

            // Also add storyboard art if available
            const storyboardKey = `${cacheKey}-main-${idx}`;
            const storyboardImage = storyboardImages[storyboardKey];
            if (storyboardImage && includeStoryboardArt) {
              try {
                const imageBuffer = await fetchImageAsArrayBuffer(storyboardImage);
                if (imageBuffer) {
                  children.push(
                    new Paragraph({
                      children: [
                        new ImageRun({
                          data: imageBuffer,
                          transformation: {
                            width: 200,
                            height: 150,
                          },
                          type: 'png',
                        }),
                      ],
                      spacing: { before: 100, after: 100 },
                    })
                  );
                }
              } catch (imgError) {
                console.error('Error adding storyboard image to Word doc:', imgError);
              }
            }

            // Add geometry shape if available
            const geoKey = `${cacheKey}-main-${idx}`;
            const geoShapeUrl = geometryShapes[geoKey];
            if (geoShapeUrl) {
              try {
                const pngDataUrl = await svgToPngDataUrl(geoShapeUrl, 200, 200);
                const pngResponse = await fetch(pngDataUrl);
                const pngBuffer = await pngResponse.arrayBuffer();
                if (pngBuffer) {
                  children.push(
                    new Paragraph({
                      children: [
                        new ImageRun({
                          data: pngBuffer,
                          transformation: { width: 180, height: 180 },
                          type: 'png',
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 100, after: 100 },
                    })
                  );
                }
              } catch (geoError) {
                console.error('Error adding geometry shape to Word doc:', geoError);
              }
            }

            if (q.hint && includeHints) {
              children.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Hint: ', italics: true, size: 16, color: '6B7280' }),
                    new TextRun({ text: q.hint, italics: true, size: 16, color: '6B7280' }),
                  ],
                  spacing: { after: 100 },
                })
              );
            }

            // Work area with label
            children.push(
              new Paragraph({
                children: [new TextRun({ text: 'WORK AREA:', bold: true, size: 14, color: '374151' })],
                border: {
                  top: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                  left: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                  right: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                },
                spacing: { before: 100 },
              })
            );

            // Empty lines for work area (more space for main questions)
            for (let i = 0; i < 6; i++) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: '' })],
                  border: {
                    left: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                    right: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                  },
                })
              );
            }

            // Answer section (highlighted)
            children.push(
              new Paragraph({
                children: [new TextRun({ text: 'ANSWER: _______________________________', bold: true, size: 18 })],
                shading: { fill: 'FEF9C3' },
                border: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'EAB308' },
                  bottom: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                  left: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                  right: { style: BorderStyle.SINGLE, size: 8, color: '374151' },
                },
                spacing: { after: 300 },
              })
            );
          }
        }

        // Add section with page break for each student (except last)
        // Include page header with QR code that repeats on ALL pages for this student
        sections.push({
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1.0), // Extra top margin for header
                right: convertInchesToTwip(0.75),
                bottom: convertInchesToTwip(0.75),
                left: convertInchesToTwip(0.75),
              },
              size: {
                orientation: PageOrientation.PORTRAIT,
                width: convertInchesToTwip(8.5),
                height: convertInchesToTwip(11),
              },
            },
          },
          headers: pageHeader ? { default: pageHeader } : undefined,
          children: children,
        });

        processedStudents++;
        setGenerationProgress((processedStudents / totalStudents) * 100);
      }

      // Create the document
      const doc = new Document({
        sections: sections,
      });

      // Generate and download
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Diagnostic_Worksheets_${selectedTopics[0]?.substring(0, 20) || 'Math'}_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: '📄 Word document ready!',
        description: `Created ${totalStudents} worksheet${totalStudents !== 1 ? 's' : ''} in Word format.`,
      });

    } catch (error) {
      console.error('Error generating Word document:', error);
      toast({
        title: 'Word generation failed',
        description: 'Could not generate Word document.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const generateDifferentiatedWorksheets = async () => {
    const selectedStudents = students.filter(s => s.selected);
    if (selectedStudents.length === 0) {
      toast({
        title: 'No students selected',
        description: 'Please select at least one student.',
        variant: 'destructive',
      });
      return;
    }

    // Wait for any pending shape generations to complete
    if (!shapesReady) {
      setGenerationStatus('Waiting for geometry shapes to finish generating...');
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (pendingShapeCount.current <= 0) {
            clearInterval(interval);
            resolve();
          }
        }, 200);
      });
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus('Preparing differentiated worksheets...');

    try {
      // Group students by their recommended level
      const studentsByLevel = selectedStudents.reduce((acc, student) => {
        const level = student.recommendedLevel;
        if (!acc[level]) acc[level] = [];
        acc[level].push(student);
        return acc;
      }, {} as Record<AdvancementLevel, StudentWithDiagnostic[]>);

      const pdf = new jsPDF('p', 'mm', 'letter');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      // Use consistent 19mm (~0.75in) margins to match print preview exactly
      const margin = marginSize === 'small' ? 15 : marginSize === 'large' ? 25 : 19;
      const contentWidth = pageWidth - margin * 2;
      // Conservative text width to prevent ANY overflow - 80% of content area
      const safeTextWidth = contentWidth * 0.80;
      const textIndent = margin + 8; // Consistent left indent for all text
      let isFirstPage = true;

      const numForms = parseInt(formCount);
      const formsToGenerate = FORM_LETTERS.slice(0, numForms);
      
      // Pre-generate unique question sets for each form and level combination
      // This ensures students with the same level but different forms get different questions
      const formQuestionCache: Record<string, { warmUp: GeneratedQuestion[], main: GeneratedQuestion[] }> = {};
      
      // Calculate total work: forms * levels with students
      const levelsWithStudents = LEVELS.filter(l => studentsByLevel[l]?.length > 0);
      const totalGenerations = numForms * levelsWithStudents.length;
      let generationsComplete = 0;
      
      // Pre-generate questions for each form/level combination
      for (const form of formsToGenerate) {
        for (const level of levelsWithStudents) {
          const cacheKey = `${form}-${level}`;
          setGenerationStatus(`Generating Form ${form} questions for Level ${level}...`);
          
          // Generate warm-up questions for this form
          let warmUpQuestions: GeneratedQuestion[] = [];
          if (parseInt(warmUpCount) > 0) {
            // Build topics array for warm-up
            const warmUpTopicsPayload = selectedTopics.length > 0
              ? selectedTopics.map(t => ({
                  topicName: t,
                  standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
                  subject: 'Mathematics',
                  category: 'Warm-Up',
                }))
              : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Warm-Up' }];
            
            const { data: warmUpData } = await supabase.functions.invoke('generate-worksheet-questions', {
              body: {
                topics: warmUpTopicsPayload,
                questionCount: parseInt(warmUpCount),
                difficultyLevels: [warmUpDifficulty],
                worksheetMode: 'warmup',
                formVariation: form,
                formSeed: form.charCodeAt(0) * 1000 + level.charCodeAt(0),
                includeHints,
                includeAnswerKey: true,
              },
            });
            warmUpQuestions = warmUpData?.questions || [];
          }
          
          // Build topics array for main questions
          const mainTopicsPayload = selectedTopics.length > 0
            ? selectedTopics.map(t => ({
                topicName: t,
                standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
                subject: 'Mathematics',
                category: 'Differentiated Practice',
              }))
            : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Differentiated Practice' }];
          
          // Generate main questions for this form/level
          const { data } = await supabase.functions.invoke('generate-worksheet-questions', {
            body: {
              topics: mainTopicsPayload,
              questionCount: parseInt(questionCount),
              difficultyLevels: level === 'A' || level === 'B' 
                ? ['hard', 'challenging'] 
                : level === 'C' || level === 'D'
                ? ['medium', 'hard']
                : ['easy', 'super-easy', 'medium'],
              worksheetMode: 'diagnostic',
              formVariation: form,
              formSeed: form.charCodeAt(0) * 1000 + level.charCodeAt(0),
              includeHints,
              includeAnswerKey: true,
            },
          });
          
          formQuestionCache[cacheKey] = {
            warmUp: warmUpQuestions,
            main: data?.questions || [],
          };
          
          generationsComplete++;
          setGenerationProgress((generationsComplete / totalGenerations) * 50);
        }
      }
      
      const totalWorksheets = selectedStudents.length;
      let processedWorksheets = 0;

      for (const level of LEVELS) {
        const studentsAtLevel = studentsByLevel[level];
        if (!studentsAtLevel || studentsAtLevel.length === 0) continue;

        // Generate worksheets for each student at this level
        for (let studentIdx = 0; studentIdx < studentsAtLevel.length; studentIdx++) {
          const student = studentsAtLevel[studentIdx];
          
          // Assign form based on student index (rotating through available forms)
          const formIndex = studentIdx % numForms;
          const assignedForm = formsToGenerate[formIndex];
          const cacheKey = `${assignedForm}-${level}`;
          
          setGenerationStatus(`Creating worksheet for ${student.first_name} ${student.last_name} (Level ${level}, Form ${assignedForm})...`);

          // Use pre-generated questions from cache
          const cachedQuestions = formQuestionCache[cacheKey];
          const warmUpQuestions = cachedQuestions?.warmUp || [];
          const questions: GeneratedQuestion[] = cachedQuestions?.main || [];
          
          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;

          let yPosition = margin;

          // Header with level and form indicator
          pdf.setFillColor(
            level === 'A' ? 34 : level === 'B' ? 16 : level === 'C' ? 250 : level === 'D' ? 251 : level === 'E' ? 254 : 243,
            level === 'A' ? 197 : level === 'B' ? 185 : level === 'C' ? 204 : level === 'D' ? 146 : level === 'E' ? 202 : 244,
            level === 'A' ? 94 : level === 'B' ? 129 : level === 'C' ? 21 : level === 'D' ? 68 : level === 'E' ? 202 : 246
          );
          pdf.rect(margin, yPosition - 5, contentWidth, 25, 'F');

          pdf.setFontSize(16);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0);
          pdf.text(`Level ${level} - ${getLevelDescription(level)}${numForms > 1 ? ` | Form ${assignedForm}` : ''}`, pageWidth / 2, yPosition + 5, { align: 'center' });

          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'normal');
          const topicsLabel = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'Math Practice';
          const truncatedTopics = topicsLabel.length > 50 ? topicsLabel.substring(0, 47) + '...' : topicsLabel;
          pdf.text(`${truncatedTopics} - Diagnostic Worksheet`, pageWidth / 2, yPosition + 12, { align: 'center' });
          yPosition += 30;

          // Student info with form indicator and inline QR code next to name
          pdf.setFontSize(11);
          pdf.text(`Name: ${student.first_name} ${student.last_name}`, margin, yPosition);
          
          // Add small QR code next to student name
          if (includeStudentQR) {
            try {
              const headerWorksheetId = `diag_${selectedTopics[0]?.substring(0, 10) || 'math'}_${level}_${assignedForm}_${Date.now()}`;
              const headerQrDataUrl = await generateQRCodeDataUrl(student.id, headerWorksheetId, 80);
              const headerQrSize = 12; // smaller QR for header
              const nameWidth = pdf.getTextWidth(`Name: ${student.first_name} ${student.last_name}`);
              pdf.addImage(headerQrDataUrl, 'PNG', margin + nameWidth + 3, yPosition - 8, headerQrSize, headerQrSize);
            } catch (qrError) {
              console.error('Error generating header QR code:', qrError);
            }
          }
          
          if (numForms > 1) {
            pdf.setFont('helvetica', 'bold');
            pdf.text(`Form ${assignedForm}`, pageWidth - margin - 25, yPosition);
            pdf.setFont('helvetica', 'normal');
          }
          pdf.text(`Date: _______________`, pageWidth - margin - 75, yPosition);
          yPosition += 10;

          pdf.setLineWidth(0.5);
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 8;
          
          // AI Grading Instructions Box
          pdf.setFillColor(239, 246, 255); // Light blue background
          pdf.setDrawColor(59, 130, 246); // Blue border
          pdf.setLineWidth(0.4);
          pdf.roundedRect(margin, yPosition, contentWidth, 18, 2, 2, 'FD');
          
          // Warning icon (use asterisk/star instead of emoji to avoid encoding issues)
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(30, 64, 175);
          pdf.text('[!] IMPORTANT: AI Grading Instructions', margin + 3, yPosition + 5);
          
          // Instructions text
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(55, 65, 81);
          pdf.text('- Write ALL work inside the bordered "WORK AREA" boxes only.', margin + 5, yPosition + 10);
          pdf.text('- Write your FINAL ANSWER in the highlighted yellow section.', margin + 5, yPosition + 14);
          pdf.text('- Work outside boxes may NOT be graded by AI.', pageWidth / 2 + 5, yPosition + 10);
          pdf.text('- Keep handwriting clear and legible for scanning.', pageWidth / 2 + 5, yPosition + 14);
          
          pdf.setTextColor(0);
          pdf.setDrawColor(0);
          yPosition += 22;

          // Helper function to add continuation page header with QR
          const addContinuationPageHeader = async (currentPage: number) => {
            // Add student identifier strip at top of continuation page
            pdf.setFillColor(245, 245, 245);
            pdf.rect(0, 0, pageWidth, 18, 'F');
            
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(80);
            pdf.text(`${student.first_name} ${student.last_name}`, margin, 10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Level ${level}${numForms > 1 ? ` | Form ${assignedForm}` : ''} | Page ${currentPage}`, margin + 60, 10);
            
            // Add QR code to continuation page header for identification
            if (includeStudentQR) {
              try {
                const contWorksheetId = `diag_${selectedTopics[0]?.substring(0, 10) || 'math'}_${level}_${assignedForm}_${Date.now()}`;
                const contQrDataUrl = await generateQRCodeDataUrl(student.id, contWorksheetId, 80);
                const contQrSize = 14;
                pdf.addImage(contQrDataUrl, 'PNG', pageWidth - margin - contQrSize, 2, contQrSize, contQrSize);
              } catch (qrError) {
                console.error('Error generating continuation QR code:', qrError);
              }
            }
            
            pdf.setTextColor(0);
            pdf.setLineWidth(0.3);
            pdf.setDrawColor(200);
            pdf.line(margin, 18, pageWidth - margin, 18);
          };

          let pageCount = 1;

          // Warm-Up Section (confidence builders)
          if (warmUpQuestions.length > 0) {
            pdf.setFillColor(240, 253, 244); // Light green
            pdf.rect(margin, yPosition - 3, contentWidth, 8, 'F');
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(22, 101, 52);
            pdf.text('* Warm-Up: Let\'s Get Started!', margin + 3, yPosition + 2);
            yPosition += 12;
            pdf.setTextColor(0);

            for (let warmUpIdx = 0; warmUpIdx < warmUpQuestions.length; warmUpIdx++) {
              const question = warmUpQuestions[warmUpIdx];
              if (yPosition > pageHeight - 50) {
                pdf.addPage();
                pageCount++;
                await addContinuationPageHeader(pageCount);
                yPosition = 25; // Start below the continuation header
              }

              pdf.setFontSize(11);
              pdf.setFont('helvetica', 'bold');
              pdf.text(`${question.questionNumber}.`, margin, yPosition);
              yPosition += 6;

              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(10); // Slightly smaller font for better fit
              const sanitizedQuestion = formatPdfText(question.question);
              // Use safe text width to prevent margin overflow
              const lines = pdf.splitTextToSize(sanitizedQuestion, safeTextWidth);
              lines.forEach((line: string) => {
                pdf.text(line, textIndent, yPosition);
                yPosition += 4.5;
              });
              pdf.setFontSize(11); // Reset font size

              // Add hint if available
              if (question.hint && includeHints) {
                yPosition += 2;
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'italic');
                pdf.setTextColor(120, 100, 50);
                const sanitizedHint = formatPdfText(question.hint);
                // Use safe text width for hints
                const hintLines = pdf.splitTextToSize(`Hint: ${sanitizedHint}`, safeTextWidth);
                hintLines.forEach((line: string) => {
                  pdf.text(line, textIndent, yPosition);
                  yPosition += 3.5;
                });
                pdf.setTextColor(0);
                pdf.setFontSize(11);
              }

              // AI-Optimized Work/Answer Zone for warm-up
              yPosition += 3;
              
              // Check if we need a new page for the zone box
              const warmUpZoneHeight = 35; // Total height for work area + answer
              if (yPosition > pageHeight - warmUpZoneHeight - 15) {
                pdf.addPage();
                pageCount++;
                await addContinuationPageHeader(pageCount);
                yPosition = 25;
              }
              
              const boxMarginLeft = margin + 2;
              const boxWidth = contentWidth - 4; // Slightly smaller to stay safely inside margins
              const warmUpWorkAreaHeight = 20;
              const warmUpAnswerHeight = 12;
              
              // Main container border (dark blue)
              pdf.setDrawColor(30, 58, 95);
              pdf.setLineWidth(0.5);
              pdf.rect(boxMarginLeft, yPosition, boxWidth, warmUpZoneHeight);
              
              // Work Area background (light gray)
              pdf.setFillColor(248, 250, 252);
              pdf.rect(boxMarginLeft, yPosition, boxWidth, warmUpWorkAreaHeight, 'F');
              
              // Work Area label
              pdf.setFontSize(7);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(30, 58, 95);
              pdf.text(`WORK AREA W${question.questionNumber}`, boxMarginLeft + 2, yPosition + 4);
              
              // Corner markers for AI zone detection
              pdf.setDrawColor(30, 58, 95);
              pdf.setLineWidth(0.3);
              // Top-left
              pdf.line(boxMarginLeft + 2, yPosition + 6, boxMarginLeft + 2, yPosition + 10);
              pdf.line(boxMarginLeft + 2, yPosition + 6, boxMarginLeft + 6, yPosition + 6);
              // Top-right
              pdf.line(boxMarginLeft + boxWidth - 2, yPosition + 6, boxMarginLeft + boxWidth - 2, yPosition + 10);
              pdf.line(boxMarginLeft + boxWidth - 6, yPosition + 6, boxMarginLeft + boxWidth - 2, yPosition + 6);
              // Bottom-left
              pdf.line(boxMarginLeft + 2, yPosition + warmUpWorkAreaHeight - 4, boxMarginLeft + 2, yPosition + warmUpWorkAreaHeight);
              pdf.line(boxMarginLeft + 2, yPosition + warmUpWorkAreaHeight, boxMarginLeft + 6, yPosition + warmUpWorkAreaHeight);
              // Bottom-right
              pdf.line(boxMarginLeft + boxWidth - 2, yPosition + warmUpWorkAreaHeight - 4, boxMarginLeft + boxWidth - 2, yPosition + warmUpWorkAreaHeight);
              pdf.line(boxMarginLeft + boxWidth - 6, yPosition + warmUpWorkAreaHeight, boxMarginLeft + boxWidth - 2, yPosition + warmUpWorkAreaHeight);
              
              // Reminder text at bottom of work area
              pdf.setFontSize(5.5);
              pdf.setFont('helvetica', 'italic');
              pdf.setTextColor(120, 130, 140);
              pdf.text('Stay inside the lines for AI grading', boxMarginLeft + boxWidth / 2, yPosition + warmUpWorkAreaHeight - 2, { align: 'center' });
              
              // Dashed line separator
              pdf.setDrawColor(148, 163, 184);
              pdf.setLineDashPattern([1, 1], 0);
              pdf.line(boxMarginLeft, yPosition + warmUpWorkAreaHeight, boxMarginLeft + boxWidth, yPosition + warmUpWorkAreaHeight);
              pdf.setLineDashPattern([], 0);
              
              // Final Answer section (amber background)
              pdf.setFillColor(254, 243, 199);
              pdf.rect(boxMarginLeft, yPosition + warmUpWorkAreaHeight, boxWidth, warmUpAnswerHeight, 'F');
              
              // Answer border top (amber accent)
              pdf.setDrawColor(245, 158, 11);
              pdf.setLineWidth(0.4);
              pdf.line(boxMarginLeft, yPosition + warmUpWorkAreaHeight, boxMarginLeft + boxWidth, yPosition + warmUpWorkAreaHeight);
              
              // Final Answer label
              pdf.setFontSize(7);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(146, 64, 14);
              pdf.text('FINAL ANSWER', boxMarginLeft + 2, yPosition + warmUpWorkAreaHeight + 4);
              
              // Answer line
              pdf.setDrawColor(180, 140, 80);
              pdf.setLineWidth(0.2);
              pdf.line(boxMarginLeft + 25, yPosition + warmUpWorkAreaHeight + 8, boxMarginLeft + boxWidth - 5, yPosition + warmUpWorkAreaHeight + 8);
              
              // Reset colors
              pdf.setDrawColor(0);
              pdf.setTextColor(0);
              pdf.setLineWidth(0.2);
              
              yPosition += warmUpZoneHeight + 5;
            }

            // Separator before main questions
            yPosition += 5;
            pdf.setLineWidth(0.3);
            pdf.setDrawColor(150);
            pdf.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 8;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(60);
            pdf.text('Practice Questions', margin, yPosition);
            yPosition += 10;
            pdf.setTextColor(0);
          }

          // Main Questions
          for (let questionIdx = 0; questionIdx < questions.length; questionIdx++) {
            const question = questions[questionIdx];
            if (yPosition > pageHeight - 60) {
              pdf.addPage();
              pageCount++;
              await addContinuationPageHeader(pageCount);
              yPosition = 25; // Start below the continuation header
            }

            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${question.questionNumber}.`, margin, yPosition);
            yPosition += 6;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10); // Slightly smaller font for better fit
            const sanitizedQuestion = formatPdfText(question.question);
            // Use safe text width to prevent margin overflow
            const lines = pdf.splitTextToSize(sanitizedQuestion, safeTextWidth);
            for (const line of lines) {
              if (yPosition > pageHeight - 30) {
                pdf.addPage();
                pageCount++;
                await addContinuationPageHeader(pageCount);
                yPosition = 25; // Start below the continuation header
              }
              pdf.text(line, textIndent, yPosition);
              yPosition += 4.5;
            }
            pdf.setFontSize(11); // Reset font size

            // Add storyboard art if available
            if (includeStoryboardArt) {
              const storyboardKey = `${cacheKey}-main-${questionIdx}`;
              const storyboardImageUrl = storyboardImages[storyboardKey];
              if (storyboardImageUrl) {
                try {
                  if (yPosition > pageHeight - 65) {
                    pdf.addPage();
                    pageCount++;
                    await addContinuationPageHeader(pageCount);
                    yPosition = 25;
                  }
                  
                  const imgWidth = 55;
                  const imgHeight = 45;
                  const imgX = (pageWidth - imgWidth) / 2; // Center the image
                  
                  yPosition += 3;
                  pdf.addImage(storyboardImageUrl, 'PNG', imgX, yPosition, imgWidth, imgHeight);
                  yPosition += imgHeight + 5;
                } catch (storyboardError) {
                  console.error('Error adding storyboard image to PDF:', storyboardError);
                }
              }
            }
            // Add geometry shape if available
            const shapeKey = `${cacheKey}-main-${questionIdx}`;
            const shapeUrl = geometryShapes[shapeKey];
            if (shapeUrl) {
              try {
                if (yPosition > pageHeight - 65) {
                  pdf.addPage();
                  pageCount++;
                  await addContinuationPageHeader(pageCount);
                  yPosition = 25;
                }
                const pngDataUrl = await svgToPngDataUrl(shapeUrl, 200, 200);
                const imgWidth = 50;
                const imgHeight = 50;
                const imgX = (pageWidth - imgWidth) / 2;
                yPosition += 3;
                pdf.addImage(pngDataUrl, 'PNG', imgX, yPosition, imgWidth, imgHeight);
                yPosition += imgHeight + 5;
              } catch (shapeError) {
                console.error('Error adding geometry shape to PDF:', shapeError);
              }
            }
            if (question.hint && includeHints) {
              yPosition += 2;
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'italic');
              pdf.setTextColor(120, 100, 50);
              const sanitizedHint = formatPdfText(question.hint);
              // Use safe text width for hints
              const hintLines = pdf.splitTextToSize(`Hint: ${sanitizedHint}`, safeTextWidth);
              for (const line of hintLines) {
                if (yPosition > pageHeight - 25) {
                  pdf.addPage();
                  pageCount++;
                  await addContinuationPageHeader(pageCount);
                  yPosition = 25; // Start below the continuation header
                }
                pdf.text(line, textIndent, yPosition);
                yPosition += 3.5;
              }
              pdf.setTextColor(0);
              pdf.setFontSize(11);
            }

            // AI-Optimized Work/Answer Zone for main questions
            yPosition += 5;
            
            // Zone dimensions
            const mainZoneHeight = 55; // Total height for work area + answer
            const mainWorkAreaHeight = 40;
            const mainAnswerHeight = 12;
            const boxMarginLeft = margin + 2;
            const boxWidth = contentWidth - 4; // Slightly smaller to stay safely inside margins
            
            // Check if we need a new page for the zone box
            if (yPosition > pageHeight - mainZoneHeight - 15) {
              pdf.addPage();
              pageCount++;
              await addContinuationPageHeader(pageCount);
              yPosition = 25;
            }
            
            // Main container border (dark blue)
            pdf.setDrawColor(30, 58, 95);
            pdf.setLineWidth(0.5);
            pdf.rect(boxMarginLeft, yPosition, boxWidth, mainZoneHeight);
            
            // Work Area background (light gray)
            pdf.setFillColor(248, 250, 252);
            pdf.rect(boxMarginLeft, yPosition, boxWidth, mainWorkAreaHeight, 'F');
            
            // Work Area label
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(30, 58, 95);
            pdf.text(`WORK AREA Q${question.questionNumber}`, boxMarginLeft + 2, yPosition + 5);
            
            // Corner markers for AI zone detection
            pdf.setDrawColor(30, 58, 95);
            pdf.setLineWidth(0.3);
            // Top-left corner marker
            pdf.line(boxMarginLeft + 2, yPosition + 7, boxMarginLeft + 2, yPosition + 12);
            pdf.line(boxMarginLeft + 2, yPosition + 7, boxMarginLeft + 7, yPosition + 7);
            // Top-right corner marker
            pdf.line(boxMarginLeft + boxWidth - 2, yPosition + 7, boxMarginLeft + boxWidth - 2, yPosition + 12);
            pdf.line(boxMarginLeft + boxWidth - 7, yPosition + 7, boxMarginLeft + boxWidth - 2, yPosition + 7);
            // Bottom-left corner marker
            pdf.line(boxMarginLeft + 2, yPosition + mainWorkAreaHeight - 5, boxMarginLeft + 2, yPosition + mainWorkAreaHeight);
            pdf.line(boxMarginLeft + 2, yPosition + mainWorkAreaHeight, boxMarginLeft + 7, yPosition + mainWorkAreaHeight);
            // Bottom-right corner marker
            pdf.line(boxMarginLeft + boxWidth - 2, yPosition + mainWorkAreaHeight - 5, boxMarginLeft + boxWidth - 2, yPosition + mainWorkAreaHeight);
            pdf.line(boxMarginLeft + boxWidth - 7, yPosition + mainWorkAreaHeight, boxMarginLeft + boxWidth - 2, yPosition + mainWorkAreaHeight);
            
            // Work area lines (light guidelines)
            pdf.setDrawColor(220, 220, 220);
            pdf.setLineWidth(0.1);
            for (let i = 1; i <= 3; i++) {
              const lineY = yPosition + 10 + (i * 8);
              if (lineY < yPosition + mainWorkAreaHeight - 2) {
                pdf.line(boxMarginLeft + 5, lineY, boxMarginLeft + boxWidth - 5, lineY);
              }
            }
            
            // Reminder text at bottom of work area
            pdf.setFontSize(6);
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(120, 130, 140);
            pdf.text('Stay inside the lines for AI grading', boxMarginLeft + boxWidth / 2, yPosition + mainWorkAreaHeight - 3, { align: 'center' });
            
            // Dashed line separator between work and answer
            pdf.setDrawColor(148, 163, 184);
            pdf.setLineDashPattern([1.5, 1.5], 0);
            pdf.line(boxMarginLeft, yPosition + mainWorkAreaHeight, boxMarginLeft + boxWidth, yPosition + mainWorkAreaHeight);
            pdf.setLineDashPattern([], 0);
            
            // Final Answer section (amber background)
            pdf.setFillColor(254, 243, 199);
            pdf.rect(boxMarginLeft, yPosition + mainWorkAreaHeight, boxWidth, mainAnswerHeight, 'F');
            
            // Answer border top (amber accent line)
            pdf.setDrawColor(245, 158, 11);
            pdf.setLineWidth(0.4);
            pdf.line(boxMarginLeft, yPosition + mainWorkAreaHeight, boxMarginLeft + boxWidth, yPosition + mainWorkAreaHeight);
            
            // Final Answer label
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(146, 64, 14);
            pdf.text('FINAL ANSWER', boxMarginLeft + 2, yPosition + mainWorkAreaHeight + 5);
            
            // Answer line
            pdf.setDrawColor(180, 140, 80);
            pdf.setLineWidth(0.2);
            pdf.line(boxMarginLeft + 30, yPosition + mainWorkAreaHeight + 8, boxMarginLeft + boxWidth - 5, yPosition + mainWorkAreaHeight + 8);
            
            // Reset colors and line settings
            pdf.setDrawColor(0);
            pdf.setTextColor(0);
            pdf.setLineWidth(0.2);
            pdf.setFont('helvetica', 'normal');
            
            yPosition += mainZoneHeight + 8;
          }

          // Footer with optional QR code
          if (includeStudentQR) {
            try {
              // Generate unique worksheet ID for this student
              const worksheetId = `diag_${selectedTopics[0]?.substring(0, 10) || 'math'}_${level}_${assignedForm}_${Date.now()}`;
              const qrDataUrl = await generateQRCodeDataUrl(student.id, worksheetId, 120);
              
              // Add QR code in bottom-right corner
              const qrSize = 18; // mm
              const qrX = pageWidth - margin - qrSize;
              const qrY = pageHeight - qrSize - 5;
              pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
              
              // Add small label under QR
              pdf.setFontSize(6);
              pdf.setTextColor(150);
              pdf.text('Scan to grade', qrX + qrSize / 2, pageHeight - 3, { align: 'center' });
            } catch (qrError) {
              console.error('Error generating QR code:', qrError);
            }
          }
          
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          pdf.text(
            `Diagnostic Worksheet - Level ${level}${numForms > 1 ? ` | Form ${assignedForm}` : ''} | Generated by NYCLogic Ai`,
            includeStudentQR ? (pageWidth / 2) - 10 : pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
          processedWorksheets++;
          setGenerationProgress(50 + (processedWorksheets / totalWorksheets) * 50);
        }
      }

      // === ANSWER KEY PAGE ===
      pdf.addPage();
      let akY = margin;
      
      // Answer Key Header
      pdf.setFillColor(50, 50, 50);
      pdf.rect(0, 0, pageWidth, 25, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SOLUTIONS & ANSWER KEY - TEACHER COPY', pageWidth / 2, 16, { align: 'center' });
      pdf.setTextColor(0);
      akY = 35;
      
      // Topic and date info
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const topicLabel = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'Math Practice';
      pdf.text(`Topic: ${topicLabel}`, margin, akY);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin - 50, akY);
      akY += 10;
      
      // Organize answers by form and level
      for (const form of formsToGenerate) {
        for (const level of levelsWithStudents) {
          const cacheKey = `${form}-${level}`;
          const questions = formQuestionCache[cacheKey];
          if (!questions) continue;
          
          // Check if we need a new page
          if (akY > pageHeight - 60) {
            pdf.addPage();
            akY = margin;
          }
          
          // Form/Level header
          pdf.setFillColor(level === 'A' ? 34 : level === 'B' ? 16 : level === 'C' ? 202 : level === 'D' ? 234 : level === 'E' ? 220 : 156, 
                          level === 'A' ? 197 : level === 'B' ? 185 : level === 'C' ? 138 : level === 'D' ? 88 : level === 'E' ? 38 : 163, 
                          level === 'A' ? 94 : level === 'B' ? 129 : level === 'C' ? 43 : level === 'D' ? 12 : level === 'E' ? 38 : 175);
          pdf.rect(margin, akY, contentWidth, 8, 'F');
          pdf.setTextColor(level === 'C' || level === 'D' ? 0 : 255, level === 'C' || level === 'D' ? 0 : 255, level === 'C' || level === 'D' ? 0 : 255);
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.text(`Level ${level} - ${getLevelDescription(level)}${numForms > 1 ? ` | Form ${form}` : ''}`, margin + 3, akY + 5.5);
          pdf.setTextColor(0);
          akY += 12;
          
          // Warm-up answers
          if (questions.warmUp && questions.warmUp.length > 0) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Warm-Up Questions:', margin, akY);
            akY += 5;
            pdf.setFont('helvetica', 'normal');
            
            questions.warmUp.forEach((q, idx) => {
              if (akY > pageHeight - 30) {
                pdf.addPage();
                akY = margin;
              }
              const formattedQuestion = formatPdfText(q.question);
              const akTextWidth = safeTextWidth * 0.9;
              const questionLines = pdf.splitTextToSize(`W${idx + 1}. ${formattedQuestion}`, akTextWidth);
              pdf.setFontSize(8);
              pdf.setTextColor(80);
              questionLines.slice(0, 2).forEach((line: string) => {
                pdf.text(line, margin + 2, akY);
                akY += 3.5;
              });
              // Print solution
              if (q.answer) {
                pdf.setTextColor(0, 100, 0);
                pdf.setFont('helvetica', 'bold');
                const solutionLines = pdf.splitTextToSize(`   ✓ ${formatPdfText(q.answer)}`, akTextWidth - 5);
                solutionLines.slice(0, 4).forEach((line: string) => {
                  pdf.text(line, margin + 5, akY);
                  akY += 3.5;
                });
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(0);
              }
              akY += 2;
            });
            akY += 3;
          }
          
          // Main question answers
          if (questions.main && questions.main.length > 0) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Main Questions:', margin, akY);
            akY += 5;
            pdf.setFont('helvetica', 'normal');
            
            questions.main.forEach((q, idx) => {
              if (akY > pageHeight - 30) {
                pdf.addPage();
                akY = margin;
              }
              const formattedQuestion = formatPdfText(q.question);
              const akTextWidth = safeTextWidth * 0.9;
              const questionLines = pdf.splitTextToSize(`${idx + 1}. ${formattedQuestion}`, akTextWidth);
              pdf.setFontSize(8);
              pdf.setTextColor(80);
              questionLines.slice(0, 2).forEach((line: string) => {
                pdf.text(line, margin + 2, akY);
                akY += 3.5;
              });
              // Print solution
              if (q.answer) {
                pdf.setTextColor(0, 100, 0);
                pdf.setFont('helvetica', 'bold');
                const solutionLines = pdf.splitTextToSize(`   ✓ ${formatPdfText(q.answer)}`, akTextWidth - 5);
                solutionLines.slice(0, 6).forEach((line: string) => {
                  pdf.text(line, margin + 5, akY);
                  akY += 3.5;
                });
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(0);
              }
              akY += 2;
            });
          }
          
          akY += 8;
        }
      }
      
      // Answer key footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text('Answer Key - For Teacher Use Only | Generated by NYCLogic Ai', pageWidth / 2, pageHeight - 10, { align: 'center' });

      // Download the PDF
      const topicsForFilename = selectedTopics.length > 0 ? selectedTopics[0].replace(/\s+/g, '_').substring(0, 20) : 'Math';
      const fileName = `Class_Set_${topicsForFilename}_Forms_${formsToGenerate.join('')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      // Track differentiated worksheet generation
      trackFeature({
        featureName: 'Generate Differentiated Worksheets',
        category: 'worksheets',
        action: 'generated',
        metadata: {
          studentCount: selectedStudents.length,
          formCount: numForms,
          topicCount: selectedTopics.length,
          includeStoryboardArt,
          diagnosticMode,
        },
      });

      toast({
        title: '🎉 Class set is ready!',
        description: `Created ${totalWorksheets} diagnostic worksheet${totalWorksheets !== 1 ? 's' : ''} for ${selectedStudents.length} student${selectedStudents.length !== 1 ? 's' : ''}${numForms > 1 ? ` across ${numForms} different forms (A-${formsToGenerate[numForms-1]}) to prevent copying` : ''}.`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error generating worksheets:', error);
      toast({
        title: 'Generation failed',
        description: 'Could not generate differentiated worksheets.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  // Generate preview data (questions only, no PDF)
  const generatePreview = async () => {
    const selectedStudents = students.filter(s => s.selected);
    if (selectedStudents.length === 0) {
      toast({
        title: 'No students selected',
        description: 'Please select at least one student.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus('Generating preview...');

    try {
      const levelsWithStudents = LEVELS.filter(l => selectedStudents.some(s => s.recommendedLevel === l));
      const numForms = parseInt(formCount);
      const formsToGenerate = FORM_LETTERS.slice(0, numForms);
      const totalGenerations = numForms * levelsWithStudents.length;
      let generationsComplete = 0;

      const formQuestionCache: Record<string, { warmUp: GeneratedQuestion[], main: GeneratedQuestion[] }> = {};

      for (const form of formsToGenerate) {
        for (const level of levelsWithStudents) {
          const cacheKey = `${form}-${level}`;
          setGenerationStatus(`Generating Form ${form} questions for Level ${level}...`);

          let warmUpQuestions: GeneratedQuestion[] = [];
          if (parseInt(warmUpCount) > 0) {
            const warmUpTopicsPayload = selectedTopics.length > 0
              ? selectedTopics.map(t => ({
                  topicName: t,
                  standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
                  subject: 'Mathematics',
                  category: 'Warm-Up',
                }))
              : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Warm-Up' }];

            const { data: warmUpData } = await supabase.functions.invoke('generate-worksheet-questions', {
              body: {
                topics: warmUpTopicsPayload,
                questionCount: parseInt(warmUpCount),
                difficultyLevels: [warmUpDifficulty],
                worksheetMode: 'warmup',
                formVariation: form,
                formSeed: form.charCodeAt(0) * 1000 + level.charCodeAt(0),
                includeHints,
                includeAnswerKey: true,
              },
            });
            warmUpQuestions = warmUpData?.questions || [];
          }

          const mainTopicsPayload = selectedTopics.length > 0
            ? selectedTopics.map(t => ({
                topicName: t,
                standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
                subject: 'Mathematics',
                category: 'Differentiated Practice',
              }))
            : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Differentiated Practice' }];

          const { data } = await supabase.functions.invoke('generate-worksheet-questions', {
            body: {
              topics: mainTopicsPayload,
              questionCount: parseInt(questionCount),
              difficultyLevels: level === 'A' || level === 'B'
                ? ['hard', 'challenging']
                : level === 'C' || level === 'D'
                ? ['medium', 'hard']
                : ['easy', 'super-easy', 'medium'],
              worksheetMode: 'diagnostic',
              formVariation: form,
              formSeed: form.charCodeAt(0) * 1000 + level.charCodeAt(0),
              includeHints,
              includeAnswerKey: true,
            },
          });

          formQuestionCache[cacheKey] = {
            warmUp: warmUpQuestions,
            main: data?.questions || [],
          };

          generationsComplete++;
          setGenerationProgress((generationsComplete / totalGenerations) * 100);
        }
      }

      setPreviewData({
        students: selectedStudents,
        questions: formQuestionCache,
      });
      setShowPreview(true);

      // Preview is ready
    } catch (error) {
      console.error('Error generating preview:', error);
      toast({
        title: 'Preview generation failed',
        description: 'Could not generate preview.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setGenerationStatus('');
    }
  };

  // Regenerate specific form/level combinations
  const regenerateSelectedQuestions = async (keysToRegenerate?: string[]) => {
    if (!previewData) return;
    
    const keys = keysToRegenerate || Array.from(selectedRegenerateKeys);
    if (keys.length === 0) {
      toast({
        title: 'No worksheets selected',
        description: 'Please select at least one form/level to regenerate.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    
    try {
      const newQuestions = { ...previewData.questions };
      let completed = 0;
      
      for (const key of keys) {
        const [form, level] = key.split('-');
        setRegeneratingKey(key);
        setGenerationStatus(`Regenerating Form ${form} Level ${level}...`);

        let warmUpQuestions: GeneratedQuestion[] = [];
        if (parseInt(warmUpCount) > 0) {
          const warmUpTopicsPayload = selectedTopics.length > 0
            ? selectedTopics.map(t => ({
                topicName: t,
                standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
                subject: 'Mathematics',
                category: 'Warm-Up',
              }))
            : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Warm-Up' }];

          const { data: warmUpData } = await supabase.functions.invoke('generate-worksheet-questions', {
            body: {
              topics: warmUpTopicsPayload,
              questionCount: parseInt(warmUpCount),
              difficultyLevels: [warmUpDifficulty],
              worksheetMode: 'warmup',
              formVariation: form,
              formSeed: Date.now() + form.charCodeAt(0) * 1000 + level.charCodeAt(0), // New seed for variation
               includeHints,
               includeAnswerKey: true,
            },
          });
          warmUpQuestions = warmUpData?.questions || [];
        }

        const mainTopicsPayload = selectedTopics.length > 0
          ? selectedTopics.map(t => ({
              topicName: t,
              standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
              subject: 'Mathematics',
              category: 'Differentiated Practice',
            }))
          : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: 'Differentiated Practice' }];

        const { data } = await supabase.functions.invoke('generate-worksheet-questions', {
          body: {
            topics: mainTopicsPayload,
            questionCount: parseInt(questionCount),
            difficultyLevels: level === 'A' || level === 'B'
              ? ['hard', 'challenging']
              : level === 'C' || level === 'D'
              ? ['medium', 'hard']
              : ['easy', 'super-easy', 'medium'],
            worksheetMode: 'diagnostic',
            formVariation: form,
            formSeed: Date.now() + form.charCodeAt(0) * 1000 + level.charCodeAt(0), // New seed for variation
            includeHints,
            includeAnswerKey: true,
          },
        });

        newQuestions[key] = {
          warmUp: warmUpQuestions,
          main: data?.questions || [],
        };

        completed++;
        setGenerationProgress((completed / keys.length) * 100);
      }

      setPreviewData({
        ...previewData,
        questions: newQuestions,
      });
      
      setSelectedRegenerateKeys(new Set());
      toast({
        title: 'Worksheets regenerated',
        description: `Successfully regenerated ${keys.length} form/level combination${keys.length !== 1 ? 's' : ''}.`,
      });
    } catch (error) {
      console.error('Error regenerating questions:', error);
      toast({
        title: 'Regeneration failed',
        description: 'Could not regenerate questions.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setRegeneratingKey(null);
    }
  };

  // Regenerate a single question
  const regenerateSingleQuestion = async (cacheKey: string, questionType: 'warmUp' | 'main', questionIndex: number) => {
    if (!previewData) return;

    const [form, level] = cacheKey.split('-');
    setIsGenerating(true);
    setRegeneratingKey(`${cacheKey}-${questionType}-${questionIndex}`);
    setGenerationStatus(`Regenerating ${questionType === 'warmUp' ? 'warm-up' : 'practice'} question ${questionIndex + 1}...`);

    try {
      const topicsPayload = selectedTopics.length > 0
        ? selectedTopics.map(t => ({
            topicName: t,
            standard: customTopics.find(ct => ct.topicName === t)?.standard || '',
            subject: 'Mathematics',
            category: questionType === 'warmUp' ? 'Warm-Up' : 'Differentiated Practice',
          }))
        : [{ topicName: 'General Math', standard: '', subject: 'Mathematics', category: questionType === 'warmUp' ? 'Warm-Up' : 'Differentiated Practice' }];

      const difficultyLevels = questionType === 'warmUp'
        ? [warmUpDifficulty]
        : level === 'A' || level === 'B'
        ? ['hard', 'challenging']
        : level === 'C' || level === 'D'
        ? ['medium', 'hard']
        : ['easy', 'super-easy', 'medium'];

      const { data } = await supabase.functions.invoke('generate-worksheet-questions', {
        body: {
          topics: topicsPayload,
          questionCount: 1, // Only generate one question
          difficultyLevels,
          worksheetMode: questionType === 'warmUp' ? 'warmup' : 'diagnostic',
          formVariation: form,
          formSeed: Date.now(), // New seed for unique question
          includeHints,
          includeAnswerKey: true,
        },
      });

      if (data?.questions?.[0]) {
        const newQuestion = {
          ...data.questions[0],
          questionNumber: questionIndex + 1,
        };

        const newQuestions = { ...previewData.questions };
        const questionSet = { ...newQuestions[cacheKey] };
        
        if (questionType === 'warmUp') {
          const updatedWarmUp = [...questionSet.warmUp];
          updatedWarmUp[questionIndex] = newQuestion;
          questionSet.warmUp = updatedWarmUp;
        } else {
          const updatedMain = [...questionSet.main];
          updatedMain[questionIndex] = newQuestion;
          questionSet.main = updatedMain;
        }
        
        newQuestions[cacheKey] = questionSet;

        setPreviewData({
          ...previewData,
          questions: newQuestions,
        });

        toast({
          title: 'Question regenerated',
          description: `New ${questionType === 'warmUp' ? 'warm-up' : 'practice'} question generated.`,
        });
      }
    } catch (error) {
      console.error('Error regenerating question:', error);
      toast({
        title: 'Regeneration failed',
        description: 'Could not regenerate question.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setRegeneratingKey(null);
    }
  };

  // Generate storyboard art for a question
  const generateStoryboardArtForQuestion = async (
    questionText: string,
    questionKey: string
  ): Promise<string | null> => {
    try {
      console.log(`Generating storyboard art for: ${questionKey}`);
      setRegeneratingImageKey(questionKey);
      
      const { data, error } = await supabase.functions.invoke('generate-storyboard-art', {
        body: {
          questionText,
          subject: storyboardSubject,
          style: storyboardStyle,
        },
      });

      if (error) {
        console.error('Storyboard art generation error:', error);
        return null;
      }

      if (data?.imageUrl) {
        setStoryboardImages(prev => ({
          ...prev,
          [questionKey]: data.imageUrl,
        }));
        return data.imageUrl;
      }
      
      return null;
    } catch (error) {
      console.error('Error generating storyboard art:', error);
      return null;
    } finally {
      setRegeneratingImageKey(null);
    }
  };

  // Regenerate storyboard art for a specific question
  const regenerateStoryboardArt = async (questionText: string, questionKey: string) => {
    toast({
      title: 'Generating new image...',
      description: 'Creating a fresh storyboard illustration.',
    });
    
    const imageUrl = await generateStoryboardArtForQuestion(questionText, questionKey);
    
    if (imageUrl) {
      toast({
        title: 'Image regenerated',
        description: 'New storyboard art has been generated.',
      });
    } else {
      toast({
        title: 'Generation failed',
        description: 'Could not generate storyboard art. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Generate storyboard art for all questions in preview
  const generateAllStoryboardArt = async () => {
    if (!previewData) return;
    
    setIsGenerating(true);
    setGenerationStatus('Generating storyboard illustrations...');
    
    const allQuestions: { key: string; text: string }[] = [];
    
    // Collect all questions that need storyboard art
    Object.entries(previewData.questions).forEach(([cacheKey, questions]) => {
      questions.warmUp?.forEach((q, idx) => {
        allQuestions.push({ key: `${cacheKey}-warmUp-${idx}`, text: q.question });
      });
      questions.main?.forEach((q, idx) => {
        allQuestions.push({ key: `${cacheKey}-main-${idx}`, text: q.question });
      });
    });
    
    let completed = 0;
    for (const { key, text } of allQuestions) {
      if (!storyboardImages[key]) {
        setGenerationProgress((completed / allQuestions.length) * 100);
        setGenerationStatus(`Generating illustration ${completed + 1} of ${allQuestions.length}...`);
        await generateStoryboardArtForQuestion(text, key);
      }
      completed++;
    }
    
    setIsGenerating(false);
    setGenerationProgress(0);
    setGenerationStatus('');
    
    toast({
      title: 'Storyboard art complete',
      description: `Generated ${completed} illustrations.`,
    });
  };

  // Generate geometry shape for a specific question
  const generateGeometryShapeForQuestion = async (
    questionText: string,
    questionKey: string,
    imagePrompt?: string,
    geometry?: GeometryMetadataLite,
    attempt = 1,
  ): Promise<string | null> => {
    const MAX_ATTEMPTS = 2; // 1 retry per retry-strategy
    try {
      console.log(`Generating geometry shape for: ${questionKey} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      setRegeneratingShapeKey(questionKey);
      
      // Prefer using the structured imagePrompt from the question when available,
      // since it already contains explicit coordinates and geometry details.
      // Fall back to a concise, non-redundant description based on the question text.
      const basePrompt =
        imagePrompt ||
        `Create a simple, clean black-and-white geometry diagram for this question:\n\n"${questionText}".\n\n` +
          `Use a plain white background, black lines only, and label any points or axes clearly.`;
      
      // Detect if this is 3D geometry (planes, pillars, etc.) that needs AI generation
      const is3DGeometry = basePrompt.toLowerCase().includes('plane') && 
                          (basePrompt.toLowerCase().includes('pillar') || 
                           basePrompt.toLowerCase().includes('support') ||
                           basePrompt.toLowerCase().includes('foundation') ||
                           basePrompt.toLowerCase().includes('3d') ||
                           basePrompt.toLowerCase().includes('three-dimensional'));
      
      // For 3D geometry, force AI generation even if preferDeterministicSVG is true
      // (deterministic SVG only works for 2D coordinate plane problems)
      const shouldUseAI = useAIImages || is3DGeometry;
      const shouldPreferDeterministic = preferDeterministicSVG && !is3DGeometry;
      
      const { data, error } = await supabase.functions.invoke('generate-diagram-images', {
        body: {
          questions: [{
            questionNumber: 1,
            imagePrompt: basePrompt,
            ...(geometry ? { geometry } : {}),
          }],
          useNanoBanana: shouldUseAI,
          preferDeterministicSVG: shouldPreferDeterministic,
        },
      });

      if (error) {
        console.error(`Geometry shape generation error (attempt ${attempt}):`, error);
        // Retry once
        if (attempt < MAX_ATTEMPTS) {
          console.log(`Retrying shape generation for ${questionKey}...`);
          return generateGeometryShapeForQuestion(questionText, questionKey, imagePrompt, geometry, attempt + 1);
        }
        // Final failure: use placeholder
        console.warn(`Shape generation failed after ${MAX_ATTEMPTS} attempts for ${questionKey}, using placeholder`);
        setGeometryShapes(prev => ({ ...prev, [questionKey]: PLACEHOLDER_SHAPE_SVG }));
        return PLACEHOLDER_SHAPE_SVG;
      }

      const imageUrl = data?.results?.[0]?.imageUrl;
      if (imageUrl) {
        setGeometryShapes(prev => ({
          ...prev,
          [questionKey]: imageUrl,
        }));
        return imageUrl;
      }
      
      // No imageUrl returned - retry once
      if (attempt < MAX_ATTEMPTS) {
        console.log(`No imageUrl returned, retrying for ${questionKey}...`);
        return generateGeometryShapeForQuestion(questionText, questionKey, imagePrompt, geometry, attempt + 1);
      }

      // Final failure: use placeholder
      console.warn(`No imageUrl after ${MAX_ATTEMPTS} attempts for ${questionKey}, using placeholder`);
      setGeometryShapes(prev => ({ ...prev, [questionKey]: PLACEHOLDER_SHAPE_SVG }));
      return PLACEHOLDER_SHAPE_SVG;
    } catch (error) {
      console.error(`Error generating geometry shape (attempt ${attempt}):`, error);
      if (attempt < MAX_ATTEMPTS) {
        return generateGeometryShapeForQuestion(questionText, questionKey, imagePrompt, geometry, attempt + 1);
      }
      // Final failure: use placeholder
      setGeometryShapes(prev => ({ ...prev, [questionKey]: PLACEHOLDER_SHAPE_SVG }));
      return PLACEHOLDER_SHAPE_SVG;
    } finally {
      if (attempt >= MAX_ATTEMPTS || attempt === 1) {
        setRegeneratingShapeKey(null);
      }
    }
  };

  // Regenerate geometry shape for a specific question
  const regenerateGeometryShape = async (questionText: string, questionKey: string, imagePrompt?: string, geometry?: GeometryMetadataLite) => {
    toast({
      title: 'Generating shape...',
      description: 'Creating a geometry diagram for this question.',
    });
    
    const imageUrl = await generateGeometryShapeForQuestion(questionText, questionKey, imagePrompt, geometry);
    
    if (imageUrl && imageUrl !== PLACEHOLDER_SHAPE_SVG) {
      toast({
        title: 'Shape generated',
        description: 'Geometry diagram has been created.',
      });
    } else {
      toast({
        title: 'Generation failed',
        description: 'Could not generate geometry shape. A placeholder has been added — click ↻ to retry.',
        variant: 'destructive',
      });
    }
  };

  const renderStudentPreview = (student: StudentWithDiagnostic, index: number) => {
    if (!previewData) return null;

    const numForms = parseInt(formCount);
    const formsToGenerate = FORM_LETTERS.slice(0, numForms);
    const studentsByLevel = previewData.students.reduce((acc, s) => {
      if (!acc[s.recommendedLevel]) acc[s.recommendedLevel] = [];
      acc[s.recommendedLevel].push(s);
      return acc;
    }, {} as Record<AdvancementLevel, StudentWithDiagnostic[]>);

    const studentsAtLevel = studentsByLevel[student.recommendedLevel] || [];
    const studentIdxInLevel = studentsAtLevel.findIndex(s => s.id === student.id);
    const formIndex = studentIdxInLevel % numForms;
    const assignedForm = formsToGenerate[formIndex];
    const cacheKey = `${assignedForm}-${student.recommendedLevel}`;
    const questions = previewData.questions[cacheKey];

    const topicsLabel = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'Math Practice';

    const isSelected = selectedRegenerateKeys.has(cacheKey);
    const isRegenerating = regeneratingKey === cacheKey;

    return (
      <div
        key={student.id}
        className={`bg-white border rounded-lg shadow-sm mb-4 relative ${isSelected ? 'ring-2 ring-purple-500' : ''} ${isRegenerating ? 'opacity-50' : ''}`}
        style={{
          width: '8.5in',
          minHeight: '11in',
          padding: '0.5in 0.75in',
          pageBreakAfter: 'always',
        }}
      >
        {/* Regenerate selection checkbox */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              const newSet = new Set(selectedRegenerateKeys);
              if (checked) {
                newSet.add(cacheKey);
              } else {
                newSet.delete(cacheKey);
              }
              setSelectedRegenerateKeys(newSet);
            }}
            disabled={isGenerating}
          />
          <span className="text-xs text-muted-foreground">Select to regenerate</span>
        </div>

        {/* Quick regenerate button */}
        <div className="absolute top-2 right-2 z-10">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerateSelectedQuestions([cacheKey])}
                  disabled={isGenerating}
                  className="h-8"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="ml-1">Regenerate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate new questions for Form {assignedForm} Level {student.recommendedLevel}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Header */}
        <div
          className={`rounded-lg p-3 mb-4 mt-8 ${
            student.recommendedLevel === 'A' ? 'bg-green-100' :
            student.recommendedLevel === 'B' ? 'bg-emerald-100' :
            student.recommendedLevel === 'C' ? 'bg-yellow-100' :
            student.recommendedLevel === 'D' ? 'bg-orange-100' :
            student.recommendedLevel === 'E' ? 'bg-red-100' : 'bg-gray-100'
          }`}
        >
          <h2 className="text-lg font-bold text-center">
            Level {student.recommendedLevel} - {getLevelDescription(student.recommendedLevel)}
            {numForms > 1 && ` | Form ${assignedForm}`}
          </h2>
          <p className="text-sm text-center text-muted-foreground">
            {topicsLabel} - Diagnostic Worksheet
          </p>
        </div>

        {/* Student Info with QR Code */}
        <div className="flex justify-between items-start mb-4 pb-2 border-b">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-sm font-medium">Name: </span>
              <span className="text-sm">{student.first_name} {student.last_name}</span>
            </div>
            {/* QR Code next to name (visible in preview when enabled) */}
            {includeStudentQR && (
              <div className="flex items-center gap-1">
                <QRCodeSVG
                  value={JSON.stringify({
                    v: 1,
                    s: student.id,
                    q: `diag_${selectedTopics[0]?.substring(0, 10) || 'math'}_${student.recommendedLevel}_${assignedForm}`,
                  })}
                  size={32}
                  level="H"
                  includeMargin={false}
                  bgColor="transparent"
                  fgColor="#000000"
                />
              </div>
            )}
          </div>
          <div>
            <span className="text-sm font-medium">Date: </span>
            <span className="text-sm">{new Date().toLocaleDateString()}</span>
          </div>
        </div>

        {/* Warm-up Section */}
        {questions?.warmUp && questions.warmUp.length > 0 && (
          <div className="mb-6">
            <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
              🔥 Warm-Up Questions
            </h3>
            <div className="space-y-3">
              {questions.warmUp.map((q, idx) => {
                const isQuestionRegenerating = regeneratingKey === `${cacheKey}-warmUp-${idx}`;
                return (
                  <div key={idx} className={`p-2 border rounded bg-gray-50 relative group ${isQuestionRegenerating ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium flex-1">W{idx + 1}. {renderMathText(q.question)}</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => regenerateSingleQuestion(cacheKey, 'warmUp', idx)}
                              disabled={isGenerating}
                            >
                              {isQuestionRegenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Regenerate this question</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {/* Show geometry shapes in preview - auto-generated or from question data */}
                    {!isNoShapeSubject && (geometryShapes[`${cacheKey}-warmUp-${idx}`] || ((q.imageUrl || q.svg || q.geometry) && (useAIImages || q.imagePrompt || q.geometry))) ? (
                      <div className="mt-2 flex flex-col items-center gap-2">
                        <div className="relative">
                          {geometryShapes[`${cacheKey}-warmUp-${idx}`] ? (
                            <img 
                              src={geometryShapes[`${cacheKey}-warmUp-${idx}`]} 
                              alt="Geometry diagram" 
                              className="max-w-[150px] max-h-[150px] border rounded"
                            />
                          ) : q.svg && !q.imageUrl ? (
                            <div 
                              className="max-w-[150px] max-h-[150px] border rounded overflow-hidden"
                              dangerouslySetInnerHTML={{ __html: q.svg }}
                            />
                          ) : (
                            <img 
                              src={q.imageUrl || svgToDataUri(q.svg || '')} 
                              alt="Geometry diagram" 
                              className="max-w-[150px] max-h-[150px] border rounded"
                            />
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                          onClick={() => regenerateGeometryShape(q.question, `${cacheKey}-warmUp-${idx}`, q.imagePrompt, q.geometry)}
                          disabled={regeneratingShapeKey === `${cacheKey}-warmUp-${idx}`}
                        >
                          {regeneratingShapeKey === `${cacheKey}-warmUp-${idx}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Regenerate Diagram
                        </Button>
                      </div>
                    ) : useAIImages && includeGeometry && !isNoShapeSubject && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 w-full"
                        onClick={() => regenerateGeometryShape(q.question, `${cacheKey}-warmUp-${idx}`, q.imagePrompt, q.geometry)}
                        disabled={regeneratingShapeKey === `${cacheKey}-warmUp-${idx}`}
                      >
                        {regeneratingShapeKey === `${cacheKey}-warmUp-${idx}` ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Shapes className="h-3 w-3 mr-1" />
                        )}
                        Generate Shape
                      </Button>
                    )}
                    {/* Show storyboard art in preview */}
                    {includeStoryboardArt && (
                      <div className="mt-2">
                        {storyboardImages[`${cacheKey}-warmUp-${idx}`] ? (
                          <div className="relative group/img flex flex-col items-center gap-1">
                            <img 
                              src={storyboardImages[`${cacheKey}-warmUp-${idx}`]} 
                              alt="Storyboard illustration" 
                              className="max-w-[200px] max-h-[150px] border rounded"
                            />
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-6"
                                onClick={() => regenerateStoryboardArt(q.question, `${cacheKey}-warmUp-${idx}`)}
                                disabled={regeneratingImageKey === `${cacheKey}-warmUp-${idx}`}
                              >
                                {regeneratingImageKey === `${cacheKey}-warmUp-${idx}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-6 text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => {
                                  setStoryboardImages(prev => {
                                    const updated = { ...prev };
                                    delete updated[`${cacheKey}-warmUp-${idx}`];
                                    return updated;
                                  });
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => generateStoryboardArtForQuestion(q.question, `${cacheKey}-warmUp-${idx}`)}
                            disabled={regeneratingImageKey === `${cacheKey}-warmUp-${idx}`}
                          >
                            {regeneratingImageKey === `${cacheKey}-warmUp-${idx}` ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Palette className="h-3 w-3 mr-1" />
                            )}
                            Generate Illustration
                          </Button>
                        )}
                      </div>
                    )}
                    {q.hint && includeHints && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Hint: {q.hint}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Questions */}
        {questions?.main && questions.main.length > 0 && (
          <div>
            <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
              📝 Practice Questions
            </h3>
            <div className="space-y-4">
              {questions.main.map((q, idx) => {
                const isQuestionRegenerating = regeneratingKey === `${cacheKey}-main-${idx}`;
                return (
                  <div key={idx} className={`p-3 border rounded relative group ${isQuestionRegenerating ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium flex-1">{idx + 1}. {renderMathText(q.question)}</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => regenerateSingleQuestion(cacheKey, 'main', idx)}
                              disabled={isGenerating}
                            >
                              {isQuestionRegenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Regenerate this question</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {/* Show geometry shapes in preview - auto-generated or from question data */}
                    {!isNoShapeSubject && (geometryShapes[`${cacheKey}-main-${idx}`] || ((q.imageUrl || q.svg) && (useAIImages || q.imagePrompt))) ? (
                      <div className="mt-2 flex flex-col items-center gap-2">
                        <div className="relative">
                          {geometryShapes[`${cacheKey}-main-${idx}`] ? (
                            <img 
                              src={geometryShapes[`${cacheKey}-main-${idx}`]} 
                              alt="Geometry diagram" 
                              className="max-w-[180px] max-h-[180px] border rounded"
                            />
                          ) : q.svg && !q.imageUrl ? (
                            <div 
                              className="max-w-[180px] max-h-[180px] border rounded overflow-hidden"
                              dangerouslySetInnerHTML={{ __html: q.svg }}
                            />
                          ) : (
                            <img 
                              src={q.imageUrl || svgToDataUri(q.svg || '')} 
                              alt="Geometry diagram" 
                              className="max-w-[180px] max-h-[180px] border rounded"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            onClick={() =>
                              regenerateGeometryShape(q.question, `${cacheKey}-main-${idx}`, q.imagePrompt, q.geometry)
                            }
                            disabled={regeneratingShapeKey === `${cacheKey}-main-${idx}`}
                          >
                            {regeneratingShapeKey === `${cacheKey}-main-${idx}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Regenerate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => {
                              // Remove the geometry shape from the generated cache
                              setGeometryShapes(prev => {
                                const updated = { ...prev };
                                delete updated[`${cacheKey}-main-${idx}`];
                                return updated;
                              });
                              // Also remove from the question data in preview
                              if (previewData) {
                                setPreviewData(prev => {
                                  if (!prev) return prev;
                                  const updatedQuestions = { ...prev.questions };
                                  if (updatedQuestions[cacheKey]) {
                                    updatedQuestions[cacheKey] = {
                                      ...updatedQuestions[cacheKey],
                                      main: updatedQuestions[cacheKey].main.map((question, i) => 
                                        i === idx ? { ...question, imageUrl: undefined, svg: undefined } : question
                                      )
                                    };
                                  }
                                  return { ...prev, questions: updatedQuestions };
                                });
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {/* Show storyboard art in preview */}
                    {includeStoryboardArt && (
                      <div className="mt-2">
                        {storyboardImages[`${cacheKey}-main-${idx}`] ? (
                          <div className="relative group/img flex flex-col items-center gap-1">
                            <img 
                              src={storyboardImages[`${cacheKey}-main-${idx}`]} 
                              alt="Storyboard illustration" 
                              className="max-w-[220px] max-h-[180px] border rounded"
                            />
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-6"
                                onClick={() => regenerateStoryboardArt(q.question, `${cacheKey}-main-${idx}`)}
                                disabled={regeneratingImageKey === `${cacheKey}-main-${idx}`}
                              >
                                {regeneratingImageKey === `${cacheKey}-main-${idx}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-6 text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => {
                                  setStoryboardImages(prev => {
                                    const updated = { ...prev };
                                    delete updated[`${cacheKey}-main-${idx}`];
                                    return updated;
                                  });
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => generateStoryboardArtForQuestion(q.question, `${cacheKey}-main-${idx}`)}
                            disabled={regeneratingImageKey === `${cacheKey}-main-${idx}`}
                          >
                            {regeneratingImageKey === `${cacheKey}-main-${idx}` ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Palette className="h-3 w-3 mr-1" />
                            )}
                            Generate Illustration
                          </Button>
                        )}
                      </div>
                    )}
                    {q.hint && includeHints && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Hint: {q.hint}</p>
                    )}
                    {/* Answer space with Generate Shape button */}
                    <div className="mt-3 border-t pt-2">
                      <div className="h-16 border border-dashed rounded bg-gray-50 relative flex items-center justify-center">
                        {/* Show Generate Shape button if no shape exists and question has imagePrompt */}
                        {!isNoShapeSubject && (q.imagePrompt || q.geometry) && !q.imageUrl && !q.svg && !geometryShapes[`${cacheKey}-main-${idx}`] && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                            onClick={() => regenerateGeometryShape(q.question, `${cacheKey}-main-${idx}`, q.imagePrompt, q.geometry)}
                            disabled={regeneratingShapeKey === `${cacheKey}-main-${idx}`}
                          >
                            {regeneratingShapeKey === `${cacheKey}-main-${idx}` ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Shapes className="h-3 w-3 mr-1" />
                            )}
                            Generate Shape
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with QR Code (visible in preview when enabled) */}
        {includeStudentQR && (
          <div className="absolute bottom-4 right-4 flex flex-col items-center">
            <QRCodeSVG
              value={JSON.stringify({
                v: 1,
                s: student.id,
                q: `diag_${selectedTopics[0]?.substring(0, 10) || 'math'}_${student.recommendedLevel}_${assignedForm}_${Date.now()}`,
              })}
              size={48}
              level="H"
              includeMargin={true}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
            <span className="text-[8px] text-muted-foreground mt-0.5">Scan to grade</span>
          </div>
        )}
      </div>
    );
  };

  const selectedCount = students.filter(s => s.selected).length;
  const studentsWithDiagnostics = students.filter(s => s.diagnosticResult || s.hasAdaptiveData);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {diagnosticMode ? (
              <>
                <FileText className="h-5 w-5 text-emerald-600" />
                Quick Start Diagnostic
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 text-purple-600" />
                Generate Differentiated Worksheets
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {diagnosticMode 
              ? "Create diagnostic worksheets with multiple forms (A-J) to prevent copying. Each form has unique questions covering the same concepts."
              : "Create personalized follow-up worksheets based on student diagnostic results. Each student receives a worksheet tailored to their recommended advancement level."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm font-medium">Presets:</Label>
            {presets.length === 0 ? (
              <span className="text-xs text-muted-foreground">No saved presets</span>
            ) : (
              presets.map(preset => (
                <div key={preset.id} className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadPreset(preset)}
                    className="h-7 text-xs"
                  >
                    {preset.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePreset(preset.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
            <Popover open={showSavePreset} onOpenChange={setShowSavePreset}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <Save className="h-3 w-3" />
                  Save Current
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3">
                <div className="space-y-2">
                  <Label className="text-sm">Preset Name</Label>
                  <Input
                    placeholder="e.g., Quick Quiz"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                  />
                  <Button size="sm" className="w-full" onClick={savePreset}>
                    Save Preset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Separator />

          {/* Class Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Class</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.filter(c => c.id && c.id.trim() !== '').map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Topics
                {customTopics.length > 0 && (
                  <Badge variant="secondary" className="text-xs">From Standards</Badge>
                )}
                {selectedTopics.length > 0 && (
                  <Badge variant="default" className="text-xs">{selectedTopics.length} selected</Badge>
                )}
              </Label>
              
              {/* Multi-select topics with checkboxes */}
              <ScrollArea className="h-[140px] border rounded-md p-2">
                {(topics.length === 0 && customTopics.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No topics available. Select topics from the standards menu first.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {/* Custom topics from standards menu */}
                    {customTopics.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-muted-foreground font-medium sticky top-0 bg-background">
                          From Standards Menu
                        </div>
                        {customTopics.map((topic, idx) => (
                          <div 
                            key={`custom-${idx}`}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                              selectedTopics.includes(topic.topicName) ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => toggleTopicSelection(topic.topicName)}
                          >
                            <Checkbox 
                              checked={selectedTopics.includes(topic.topicName)}
                              onCheckedChange={() => toggleTopicSelection(topic.topicName)}
                            />
                            <span className="flex-1 text-sm">{topic.topicName}</span>
                            <Badge variant="outline" className="text-xs">{topic.standard}</Badge>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* Diagnostic topics */}
                    {topics.length > 0 && (
                      <>
                        {customTopics.length > 0 && (
                          <div className="px-2 py-1 text-xs text-muted-foreground font-medium border-t mt-2 pt-2 sticky top-0 bg-background">
                            From Past Diagnostics
                          </div>
                        )}
                        {topics.filter(t => !customTopics.some(ct => ct.topicName === t)).map(topic => (
                          <div 
                            key={topic}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                              selectedTopics.includes(topic) ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => toggleTopicSelection(topic)}
                          >
                            <Checkbox 
                              checked={selectedTopics.includes(topic)}
                              onCheckedChange={() => toggleTopicSelection(topic)}
                            />
                            <span className="flex-1 text-sm">{topic}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
              
              {/* Select All / Clear All buttons */}
              {(topics.length > 0 || customTopics.length > 0) && (
                <div className="flex items-center justify-between">
                  {selectedTopics.length > 0 ? (
                    <p className="text-xs text-emerald-600">
                      ✓ {selectedTopics.length} topic(s) selected for worksheet
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No topics selected
                    </p>
                  )}
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => {
                        const allTopics = [
                          ...customTopics.map(ct => ct.topicName),
                          ...topics.filter(t => !customTopics.some(ct => ct.topicName === t))
                        ];
                        setSelectedTopics(allTopics);
                      }}
                      disabled={selectedTopics.length === (customTopics.length + topics.filter(t => !customTopics.some(ct => ct.topicName === t)).length)}
                    >
                      Select all
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => setSelectedTopics([])}
                      disabled={selectedTopics.length === 0}
                    >
                      Clear all
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Questions per Worksheet</Label>
              <Select value={questionCount} onValueChange={setQuestionCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 question</SelectItem>
                  <SelectItem value="2">2 questions</SelectItem>
                  <SelectItem value="3">3 questions</SelectItem>
                  <SelectItem value="5">5 questions</SelectItem>
                  <SelectItem value="8">8 questions</SelectItem>
                  <SelectItem value="10">10 questions</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Question Distribution Preview */}
              {selectedTopics.length > 1 && (
                <div className="mt-2 p-2 bg-muted/50 rounded-md border">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Question Distribution</p>
                  <div className="space-y-1">
                    {(() => {
                      const totalQuestions = parseInt(questionCount);
                      const topicCount = selectedTopics.length;
                      const basePerTopic = Math.floor(totalQuestions / topicCount);
                      const remainder = totalQuestions % topicCount;
                      
                      return selectedTopics.map((topic, idx) => {
                        const questionsForTopic = basePerTopic + (idx < remainder ? 1 : 0);
                        const percentage = Math.round((questionsForTopic / totalQuestions) * 100);
                        
                        return (
                          <div key={topic} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate max-w-[120px]" title={topic}>
                                  {topic.length > 18 ? `${topic.slice(0, 18)}...` : topic}
                                </span>
                                <span className="text-muted-foreground whitespace-nowrap ml-1">
                                  ~{questionsForTopic} Q
                                </span>
                              </div>
                              <Progress value={percentage} className="h-1 mt-0.5" />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                    {parseInt(questionCount)} questions ÷ {selectedTopics.length} topics
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Diagnostic Forms (Anti-Copy)</Label>
              <Select value={formCount} onValueChange={setFormCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 form (standard)</SelectItem>
                  <SelectItem value="2">2 forms (A, B)</SelectItem>
                  <SelectItem value="3">3 forms (A, B, C)</SelectItem>
                  <SelectItem value="4">4 forms (A, B, C, D)</SelectItem>
                  <SelectItem value="5">5 forms (A-E)</SelectItem>
                  <SelectItem value="6">6 forms (A-F)</SelectItem>
                  <SelectItem value="7">7 forms (A-G)</SelectItem>
                  <SelectItem value="8">8 forms (A-H)</SelectItem>
                  <SelectItem value="9">9 forms (A-I)</SelectItem>
                  <SelectItem value="10">10 forms (A-J)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Different question sets prevent copying between students</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Warm-Up Questions</Label>
              <Select value={warmUpCount} onValueChange={setWarmUpCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No warm-up</SelectItem>
                  <SelectItem value="1">1 question</SelectItem>
                  <SelectItem value="2">2 questions</SelectItem>
                  <SelectItem value="3">3 questions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Warm-Up Difficulty</Label>
              <Select 
                value={warmUpDifficulty} 
                onValueChange={(v) => setWarmUpDifficulty(v as 'super-easy' | 'easy' | 'very-easy')}
                disabled={warmUpCount === '0'}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super-easy">Super Easy (basic facts)</SelectItem>
                  <SelectItem value="very-easy">Very Easy (basic recall)</SelectItem>
                  <SelectItem value="easy">Easy (simple application)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Confidence-building questions at the start of each worksheet</p>

          {/* Include Hints Option */}
          <div className="flex items-center space-x-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Checkbox
              id="includeHints"
              checked={includeHints}
              onCheckedChange={(checked) => setIncludeHints(checked === true)}
            />
            <div className="flex-1">
              <Label htmlFor="includeHints" className="text-sm font-medium text-amber-900 cursor-pointer">
                💡 Include Hints for Students
              </Label>
              <p className="text-xs text-amber-700 mt-0.5">
                Add a helpful hint under each question so students don't get stuck. Great for practice and building confidence!
              </p>
            </div>
          </div>


          {/* Storyboard Art for Non-Math Subjects */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-pink-100 rounded-lg">
                <Palette className="h-5 w-5 text-pink-600" />
              </div>
              <div className="flex-1">
                <Label htmlFor="includeStoryboardArt" className="text-sm font-medium text-pink-900 cursor-pointer flex items-center gap-2">
                  Storyboard Art Generator
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ImageIcon className="h-3.5 w-3.5 text-pink-500" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">
                          Generate high-quality storyboard-style illustrations for subjects like English, History, Biology, and more.
                          Perfect for making worksheets more engaging and visual.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-xs text-pink-700 mt-0.5">
                  AI-generated illustrations for English, History, Biology & more
                </p>
              </div>
            </div>
            <Switch
              id="includeStoryboardArt"
              checked={includeStoryboardArt}
              onCheckedChange={() => handleImageToggle('storyboard', includeStoryboardArt)}
            />
          </div>

          {includeStoryboardArt && (
            <div className="ml-6 space-y-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-rose-800 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Subject
                  </Label>
                  <Select value={storyboardSubject} onValueChange={(v) => setStoryboardSubject(v as typeof storyboardSubject)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English / Literature</SelectItem>
                      <SelectItem value="history">History / Social Studies</SelectItem>
                      <SelectItem value="biology">Biology / Life Science</SelectItem>
                      <SelectItem value="chemistry">Chemistry</SelectItem>
                      <SelectItem value="physics">Physics</SelectItem>
                      <SelectItem value="science">General Science</SelectItem>
                      <SelectItem value="social-studies">Social Studies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-rose-800 flex items-center gap-1">
                    <Palette className="h-3 w-3" />
                    Art Style
                  </Label>
                  <Select value={storyboardStyle} onValueChange={(v) => setStoryboardStyle(v as typeof storyboardStyle)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="storyboard">Storyboard Panel</SelectItem>
                      <SelectItem value="illustration">Classic Illustration</SelectItem>
                      <SelectItem value="diagram">Educational Diagram</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-rose-600">
                💡 Tip: You can regenerate individual images after preview if needed
              </p>
            </div>
          )}


          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <Label htmlFor="adaptiveDifficulty" className="text-sm font-medium text-purple-900 cursor-pointer flex items-center gap-2">
                  Adaptive Difficulty
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">
                          Analyzes each student's past performance to automatically adjust difficulty levels. 
                          Students improving will get slightly harder questions, while struggling students get more support.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-xs text-purple-700 mt-0.5">
                  Auto-adjust difficulty based on analyzed student work data
                </p>
              </div>
            </div>
            <Switch
              id="adaptiveDifficulty"
              checked={useAdaptiveDifficulty}
              onCheckedChange={setUseAdaptiveDifficulty}
            />
          </div>

          {useAdaptiveDifficulty && adaptiveStudents.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="font-medium">Performance-based adjustments active</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {adaptiveStudents.filter(s => s.hasPerformanceData).length} students have graded work data. 
                Their worksheet levels will be personalized based on their performance trends.
              </p>
            </div>
          )}

          {/* Include Student QR Code Option */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <QrCode className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <Label htmlFor="includeStudentQR" className="text-sm font-medium text-green-900 cursor-pointer flex items-center gap-2">
                  Include Student QR Codes
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Sparkles className="h-3.5 w-3.5 text-green-500" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">
                          Adds a unique QR code to each student's worksheet for quick scanning and 
                          automatic student identification during grading.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-xs text-green-700 mt-0.5">
                  Quick scan worksheets to auto-identify students during grading
                </p>
              </div>
            </div>
            <Switch
              id="includeStudentQR"
              checked={includeStudentQR}
              onCheckedChange={setIncludeStudentQR}
            />
          </div>
          
          {/* Page Margin Size */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Page Margins
            </Label>
            <Select value={marginSize} onValueChange={(v) => setMarginSize(v as 'small' | 'medium' | 'large')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (12mm) - More content space</SelectItem>
                <SelectItem value="medium">Medium (20mm) - Balanced</SelectItem>
                <SelectItem value="large">Large (25mm) - More white space</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QuestionPreviewPanel
            selectedTopics={selectedTopics}
            customTopics={customTopics}
            warmUpCount={warmUpCount}
            warmUpDifficulty={warmUpDifficulty}
            questionCount={questionCount}
            includeHints={includeHints}
            previewLevel={students.find(s => s.selected)?.recommendedLevel || 'C'}
            includeGeometry={includeGeometry}
            useAIImages={useAIImages}
          />

          <Separator />

          {/* Students Selection */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedClassId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  {diagnosticMode ? 'Select Students for Diagnostic' : 'Students with Diagnostic Data'}
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>Deselect All</Button>
                </div>
              </div>

              {/* Filter option for diagnostic mode */}
              {diagnosticMode && students.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Users className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="onlyWithoutDiagnostic" className="text-sm font-medium text-amber-900 cursor-pointer">
                        Only Students Without Diagnostic Record
                      </Label>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Print worksheets only for students who haven't been diagnosed on selected topics
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="onlyWithoutDiagnostic"
                    checked={onlyWithoutDiagnostic}
                    onCheckedChange={(checked) => {
                      setOnlyWithoutDiagnostic(checked);
                      if (checked) {
                        selectOnlyWithoutDiagnostic();
                      } else {
                        // When turning off filter in diagnostic mode, select all students
                        setStudents(prev => prev.map(s => ({ ...s, selected: true })));
                      }
                    }}
                  />
                </div>
              )}

              {/* Show count of students without diagnostic data */}
              {diagnosticMode && onlyWithoutDiagnostic && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">
                      {students.filter(s => !s.diagnosticResult && !s.hasAdaptiveData).length}
                    </span> student(s) without diagnostic data on selected topic(s)
                  </p>
                </div>
              )}

              {studentsWithDiagnostics.length === 0 && !diagnosticMode ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No diagnostic results found for this class{selectedTopics.length > 0 ? ` on selected topics` : ''}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create a diagnostic worksheet first, then record student results.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Level Key Legend */}
                  {diagnosticMode && (
                    <div className="mb-3 p-2 bg-muted/30 rounded-md border">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Difficulty Level Key:</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="font-medium">A</span> = Advanced
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="font-medium">B</span> = Proficient
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                          <span className="font-medium">C</span> = Intermediate
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="font-medium">D</span> = Developing
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="font-medium">E</span> = Foundational
                        </span>
                      </div>
                    </div>
                  )}
                  <ScrollArea className="h-[280px] border rounded-md p-2">
                    <div className="space-y-2">
                    {students.map(student => {
                      const hasDiagnostic = !!student.diagnosticResult;
                      const hasData = hasDiagnostic || student.hasAdaptiveData;
                      const adaptiveInfo = adaptiveStudents.find(s => s.studentId === student.id);
                      const isAdaptiveAdjusted = useAdaptiveDifficulty && student.hasAdaptiveData && adaptiveInfo;
                      
                      // In diagnostic mode, allow selecting students without data (they get Level C default)
                      const canSelect = diagnosticMode || hasData;
                      // When filter is on, dim students who have data
                      const isDimmed = diagnosticMode && onlyWithoutDiagnostic && hasData;
                      
                      return (
                        <div
                          key={student.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            student.selected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                          } ${!canSelect || isDimmed ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={student.selected}
                              onCheckedChange={() => toggleStudent(student.id)}
                              disabled={!canSelect || isDimmed}
                            />
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1.5">
                                {student.last_name}, {student.first_name}
                                {isAdaptiveAdjusted && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <TrendingUp className="h-3 w-3 text-purple-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Level adjusted based on performance data</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </p>
                              {hasDiagnostic ? (
                                <p className="text-xs text-muted-foreground">
                                  Last assessed: {new Date(student.diagnosticResult!.created_at).toLocaleDateString()}
                                  {isAdaptiveAdjusted && (
                                    <span className="ml-1 text-purple-600">• Adaptive</span>
                                  )}
                                </p>
                              ) : student.hasAdaptiveData ? (
                                <p className="text-xs text-purple-600">
                                  Level from graded work analysis
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">No data available</p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {hasData && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      variant="outline" 
                                      className={`${getLevelColor(student.recommendedLevel)} ${isAdaptiveAdjusted ? 'ring-1 ring-purple-400' : ''} text-[10px] px-1.5`}
                                    >
                                      Auto
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Calculated from performance data</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Select
                              value={student.recommendedLevel}
                              onValueChange={(value) => setStudentLevel(student.id, value as AdvancementLevel)}
                            >
                              <SelectTrigger className={`h-7 w-[100px] text-xs ${hasData ? 'border-dashed' : ''}`}>
                                <SelectValue placeholder="Level" />
                              </SelectTrigger>
                              <SelectContent>
                                {LEVELS.map(level => (
                                  <SelectItem key={level} value={level}>
                                    <span className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${
                                        level === 'A' ? 'bg-green-500' :
                                        level === 'B' ? 'bg-emerald-500' :
                                        level === 'C' ? 'bg-yellow-500' :
                                        level === 'D' ? 'bg-orange-500' :
                                        level === 'E' ? 'bg-red-500' : 'bg-gray-500'
                                      }`} />
                                      Level {level}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </ScrollArea>
                </>
              )}

              {/* Level distribution summary */}
              {selectedCount > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium mr-2">Distribution:</span>
                  {LEVELS.map(level => {
                    const count = students.filter(s => s.selected && s.recommendedLevel === level).length;
                    if (count === 0) return null;
                    return (
                      <Badge key={level} variant="outline" className={getLevelColor(level)}>
                        Level {level}: {count}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Select a class to view students</p>
              </CardContent>
            </Card>
          )}

          {/* Time estimator - shown before generation */}
          {!isGenerating && selectedCount > 0 && (
            <GenerationTimeEstimator
              questionCount={parseInt(questionCount) + parseInt(warmUpCount)}
              includeImages={useAIImages}
              includeSvg={includeGeometry}
              studentCount={selectedCount}
            />
          )}

          {/* Generation progress counter */}
          {isGenerating && (
            <GenerationProgressCounter
              isGenerating={isGenerating}
              questionCount={(parseInt(questionCount) + parseInt(warmUpCount)) * selectedCount}
              includeImages={useAIImages}
              includeSvg={includeGeometry}
              currentStep={generationStatus}
            />
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={generatePreview}
            disabled={isGenerating || selectedCount === 0}
          >
            {isGenerating && !showPreview ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </>
            )}
          </Button>
          <Button
            onClick={generateDifferentiatedWorksheets}
            disabled={isGenerating || selectedCount === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Generate {selectedCount} Worksheet{selectedCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <Dialog open={showPreview} onOpenChange={(open) => {
          if (!open) {
            setSelectedRegenerateKeys(new Set());
          }
          setShowPreview(open);
        }}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
            {/* Preview Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/50 flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">Print Preview</h2>
                <Badge variant="secondary">
                  {previewData.students.length} worksheet{previewData.students.length !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline">
                  {Object.keys(previewData.questions).length} unique form/level combinations
                </Badge>
                {/* Geometry shapes toggle - HIDDEN */}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Batch regenerate controls */}
                {selectedRegenerateKeys.size > 0 && (
                  <>
                    <Badge variant="default" className="bg-purple-600">
                      {selectedRegenerateKeys.size} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRegenerateKeys(new Set())}
                      disabled={isGenerating}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => regenerateSelectedQuestions()}
                      disabled={isGenerating}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1" />
                      )}
                      Regenerate Selected
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                  </>
                )}
                
                {/* Zoom controls */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewZoom(Math.max(25, previewZoom - 25))}
                  disabled={previewZoom <= 25}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-12 text-center">{previewZoom}%</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewZoom(Math.min(200, previewZoom + 25))}
                  disabled={previewZoom >= 200}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-6" />
                
                {/* Generate All Storyboard Art button */}
                {includeStoryboardArt && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateAllStoryboardArt}
                      disabled={isGenerating}
                      className="bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100"
                    >
                      {isGenerating && regeneratingImageKey ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Palette className="h-4 w-4 mr-1" />
                      )}
                      Generate All Art
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                  </>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRegenerateKeys(new Set());
                    setShowPreview(false);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Close
                </Button>
                {!shapesReady && (
                  <Badge variant="secondary" className="gap-1 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating shapes...
                  </Badge>
                )}
                <Button
                  size="sm"
                  onClick={generateWordDocument}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isGenerating && generationStatus.includes('Word') ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileType className="h-4 w-4 mr-1" />
                  )}
                  Word Doc
                </Button>
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => {
                    setShowPreview(false);
                    generateDifferentiatedWorksheets();
                  }}
                  disabled={isGenerating}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Generate PDF
                </Button>
              </div>
            </div>

            {/* Regeneration progress */}
            {isGenerating && regeneratingKey && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-amber-700">{generationStatus}</span>
                  <span className="font-medium text-amber-900">{Math.round(generationProgress)}%</span>
                </div>
                <Progress value={generationProgress} className="h-2" />
              </div>
            )}

            {/* Preview Content */}
            <div className="flex-1 overflow-auto p-4 bg-gray-200" style={{ maxHeight: 'calc(95vh - 180px)' }}>
              <div
                ref={previewRef}
                className="flex flex-col items-center min-h-full"
                style={{
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: 'top center',
                  width: `${100 / (previewZoom / 100)}%`,
                }}
              >
                {previewData.students.map((student, index) => renderStudentPreview(student, index))}
                
                {/* Answer Key Preview Section */}
                <div className="w-full max-w-[8.5in] mx-auto bg-white border-2 border-red-300 rounded-lg shadow-md mt-8 p-6 print-worksheet relative">
                  <div className="absolute top-2 right-2 bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-300 uppercase">
                    🔒 Teacher Only
                  </div>
                  <div className="text-center mb-4 pb-3 border-b-2 border-gray-300">
                    <h2 className="text-xl font-bold">SOLUTIONS & ANSWER KEY</h2>
                    <p className="text-sm text-muted-foreground">Teacher Reference Copy — Do not distribute to students</p>
                    <p className="text-xs text-muted-foreground mt-1">Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                  
                  {Object.entries(previewData.questions).map(([cacheKey, questions]) => {
                    const [form, level] = cacheKey.split('-');
                    const hasAnyAnswers = [...(questions.warmUp || []), ...(questions.main || [])].some(q => q.answer);
                    
                    if (!hasAnyAnswers) return null;
                    
                    return (
                      <div key={`ak-${cacheKey}`} className="mb-6">
                        <div className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm font-bold mb-3">
                          Level {level} — {getLevelDescription(level as AdvancementLevel)}
                          {previewData.students.length > 1 && ` | Form ${form}`}
                        </div>
                        
                        {questions.warmUp && questions.warmUp.length > 0 && questions.warmUp.some(q => q.answer) && (
                          <div className="mb-3">
                            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Warm-Up</p>
                            {questions.warmUp.map((q, idx) => q.answer && (
                              <div key={`ak-wu-${idx}`} className="mb-2 pl-3 border-l-3 border-blue-400">
                                <p className="text-xs text-muted-foreground">W{idx + 1}. {renderMathText(fixEncodingCorruption(q.question)).toString().substring(0, 80)}...</p>
                                <p className="text-sm text-green-700 font-semibold mt-0.5">✓ {renderMathText(fixEncodingCorruption(q.answer))}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {questions.main && questions.main.length > 0 && questions.main.some(q => q.answer) && (
                          <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Practice Questions</p>
                            {questions.main.map((q, idx) => q.answer && (
                              <div key={`ak-main-${idx}`} className="mb-2 pl-3 border-l-3 border-emerald-400">
                                <p className="text-xs text-muted-foreground">{idx + 1}. {renderMathText(fixEncodingCorruption(q.question)).toString().substring(0, 80)}...</p>
                                <p className="text-sm text-green-700 font-semibold mt-0.5 whitespace-pre-line">✓ {renderMathText(fixEncodingCorruption(q.answer))}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {!Object.values(previewData.questions).some(qs => [...(qs.warmUp || []), ...(qs.main || [])].some(q => q.answer)) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">No answer solutions were generated for these questions.</p>
                      <p className="text-xs mt-1">Solutions will appear in the downloaded PDF when available.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Image Generation Warning Dialog */}
      <Dialog open={showImageWarning} onOpenChange={setShowImageWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              Image Generation Warning
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p className="text-sm text-gray-700">
                <strong>Please be aware:</strong>
              </p>
              <ul className="text-sm text-gray-600 space-y-2 list-disc ml-4">
                <li>
                  <strong>Generation time:</strong> Each image takes <span className="text-amber-600 font-semibold">a few seconds</span> to generate. 
                  For a full class set, this could take <span className="text-amber-600 font-semibold">5-10 minutes</span> depending on the number of students.
                </li>
                <li>
                  <strong>Accuracy concerns:</strong> AI-generated images may contain <span className="text-red-600 font-semibold">inaccuracies</span> such as 
                  incorrect labels, wrong measurements, or visual errors that require manual review.
                </li>
                <li>
                  <strong>Recommendation:</strong> For math diagrams, use the "Guaranteed Accurate Diagrams" option when possible.
                </li>
              </ul>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mt-3">
                <p className="text-xs text-amber-800">
                  <strong>Tip:</strong> Consider generating worksheets without images first, then adding images only to specific questions that need them.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" onClick={cancelImageGeneration}>
              Cancel
            </Button>
            <Button 
              onClick={confirmImageGeneration}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              I Understand, Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
