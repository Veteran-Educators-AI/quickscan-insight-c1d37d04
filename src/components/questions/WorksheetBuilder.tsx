import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Printer,
  FileText,
  X,
  Sparkles,
  Loader2,
  Save,
  FolderOpen,
  Trash2,
  Share2,
  Copy,
  Check,
  Link,
  BookOpen,
  ImageIcon,
  Pencil,
  RefreshCw,
  Palette,
  ClipboardList,
  AlertTriangle,
  Eye,
  ZoomIn,
  ZoomOut,
  Send,
  Coins,
  Trophy,
  PenTool,
  Library,
  Clock,
  NotebookPen,
  Scissors,
  FileType,
  Brain,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { handleApiError, checkResponseForApiError } from "@/lib/apiErrorHandler";
import { renderMathText, sanitizeForPDF, sanitizeForWord, fixEncodingCorruption } from "@/lib/mathRenderer";
import { MathSymbolPreview } from "./MathSymbolPreview";
import { CanvasDrawingTool } from "./CanvasDrawingTool";
import { AIImageReviewDialog } from "./AIImageReviewDialog";
import { ImageLibraryPicker } from "./ImageLibraryPicker";
import { useAIImageLibrary } from "@/hooks/useAIImageLibrary";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  AlignmentType,
  convertInchesToTwip,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  Header,
  Footer,
} from "docx";
import { getFormulasForTopics, type FormulaCategory } from "@/data/formulaReference";
import { ScrapPaperGenerator } from "@/components/print/ScrapPaperGenerator";
import { AnswerKeySheet } from "@/components/print/AnswerKeySheet";
// Shared assignments are now saved directly to database - no need for usePushToSisterApp

export interface WorksheetQuestion {
  id: string;
  topicName: string;
  standard: string;
  jmapUrl: string;
  subject: string;
  category: string;
}

// Advancement levels A-F for diagnostic worksheets
export type AdvancementLevel = "A" | "B" | "C" | "D" | "E" | "F";

// Bloom's Taxonomy Cognitive Levels
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  answer?: string; // The correct answer for teacher's answer key
  difficulty: "medium" | "hard" | "challenging";
  bloomLevel?: BloomLevel;
  bloomVerb?: string;
  advancementLevel?: AdvancementLevel; // For diagnostic worksheets
  svg?: string;
  imageUrl?: string;
  imagePrompt?: string;
  clipartUrl?: string;
}

interface AnswerKeyItem {
  questionNumber: number;
  final_answer: string;
  accepted_answers: string[];
  solution_outline: string[];
  common_errors: string[];
  grading_rubric: string[];
  confidence: number;
}

// Bloom's Taxonomy level display helpers
const BLOOM_LEVELS: { level: BloomLevel; label: string; color: string; description: string }[] = [
  { level: "remember", label: "Remember", color: "bg-slate-500", description: "Recall facts and basic concepts" },
  { level: "understand", label: "Understand", color: "bg-blue-500", description: "Explain ideas or concepts" },
  { level: "apply", label: "Apply", color: "bg-green-500", description: "Use information in new situations" },
  { level: "analyze", label: "Analyze", color: "bg-yellow-500", description: "Draw connections among ideas" },
  { level: "evaluate", label: "Evaluate", color: "bg-orange-500", description: "Justify decisions or actions" },
  { level: "create", label: "Create", color: "bg-red-500", description: "Produce new or original work" },
];

const getBloomInfo = (level?: BloomLevel) => {
  return BLOOM_LEVELS.find((b) => b.level === level) || BLOOM_LEVELS[2]; // Default to 'apply'
};

// Worksheet mode types
export type WorksheetMode = "basic_assessment" | "diagnostic";

interface SavedWorksheet {
  id: string;
  title: string;
  teacher_name: string | null;
  questions: GeneratedQuestion[];
  topics: WorksheetQuestion[];
  settings: {
    questionCount: string;
    difficultyFilter: string[];
    showAnswerLines: boolean;
    includeGeometry?: boolean;
    includeFormulas?: boolean;
    includeFormulaSheet?: boolean;
    includeGraphPaper?: boolean;
    includeCoordinateGeometry?: boolean;
    useAIImages?: boolean;
    imageSize?: number;
    includeClipart?: boolean;
    worksheetMode?: WorksheetMode;
    includeAnswerKey?: boolean;
    answer_key?: AnswerKeyItem[];
  };
  created_at: string;
  share_code: string | null;
  is_shared: boolean;
}

// Convert SVG (string, data URL, or HTTP URL) to PNG data URL for embedding in documents
const svgToPngDataUrl = async (svgInput: string, width: number = 200, height: number = 200): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!svgInput) {
      reject(new Error("No SVG input provided"));
      return;
    }

    // If it's already a PNG data URL, return it as-is
    if (svgInput.startsWith("data:image/png") || svgInput.startsWith("data:image/jpeg")) {
      resolve(svgInput);
      return;
    }

    // Create an image element
    const img = new Image();
    img.crossOrigin = "anonymous";

    let objectUrl: string | null = null;

    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load timeout"));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement("canvas");
        // Use natural dimensions if available, or fallback to requested size
        const naturalWidth = img.naturalWidth || img.width || width;
        const naturalHeight = img.naturalHeight || img.height || height;

        // Set canvas size to requested dimensions
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Fill with white background for transparency handling
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, width, height);

          // Scale image to fit while maintaining aspect ratio
          const scale = Math.min(width / naturalWidth, height / naturalHeight);
          const scaledWidth = naturalWidth * scale;
          const scaledHeight = naturalHeight * scale;
          const x = (width - scaledWidth) / 2;
          const y = (height - scaledHeight) / 2;

          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          const pngDataUrl = canvas.toDataURL("image/png", 1.0);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          resolve(pngDataUrl);
        } else {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not get canvas context"));
        }
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = (e) => {
      clearTimeout(timeoutId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      console.error("Image load error:", e);
      reject(new Error("Failed to load SVG image"));
    };

    // Handle different input types
    if (svgInput.startsWith("data:image/svg+xml")) {
      // SVG data URL - may be base64 or URI encoded
      img.src = svgInput;
    } else if (svgInput.startsWith("http://") || svgInput.startsWith("https://")) {
      // HTTP URL - try to load directly, handle CORS by converting to canvas
      img.src = svgInput;
    } else if (svgInput.startsWith("<svg") || svgInput.includes("xmlns") || svgInput.includes("<svg")) {
      // Raw SVG string - ensure proper encoding and create blob URL
      let svgContent = svgInput.trim();

      // Add XML declaration if missing
      if (!svgContent.startsWith("<?xml")) {
        svgContent = '<?xml version="1.0" encoding="UTF-8"?>' + svgContent;
      }

      // Ensure xmlns is present
      if (!svgContent.includes("xmlns=")) {
        svgContent = svgContent.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      objectUrl = URL.createObjectURL(svgBlob);
      img.src = objectUrl;
    } else {
      // Unknown format, try using as-is
      console.warn("Unknown image format, attempting to load:", svgInput.substring(0, 50));
      img.src = svgInput;
    }
  });
};

// Helper function to fetch image as ArrayBuffer for Word document embedding
const fetchImageAsArrayBuffer = async (imageUrl: string): Promise<ArrayBuffer | null> => {
  try {
    // Handle data URLs directly
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
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
      console.error("Failed to fetch image:", response.statusText);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.error("Error fetching image as ArrayBuffer:", error);
    return null;
  }
};

// Page Break Indicator Component - shows where pages will split when printing
const PageBreakIndicators = ({
  contentRef,
  pageMarginIn,
}: {
  contentRef: React.RefObject<HTMLDivElement>;
  pageMarginIn: number;
}) => {
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  useEffect(() => {
    if (!contentRef.current) return;

    // Standard US Letter: 11in page height minus margins for content area
    // At 96 DPI: inches * 96 = pixels per page content area
    const pageContentHeight = Math.max(1, (11 - pageMarginIn * 2) * 96);

    const calculateBreaks = () => {
      if (!contentRef.current) return;
      const contentHeight = contentRef.current.scrollHeight;
      const breaks: number[] = [];

      // Add a break at each page boundary
      let currentPosition = pageContentHeight;
      while (currentPosition < contentHeight) {
        breaks.push(currentPosition);
        currentPosition += pageContentHeight;
      }

      setPageBreaks(breaks);
    };

    // Calculate on mount and when content changes
    calculateBreaks();

    // Use ResizeObserver to detect content changes
    const observer = new ResizeObserver(calculateBreaks);
    observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, [contentRef, pageMarginIn]);

  if (pageBreaks.length === 0) return null;

  return (
    <>
      {pageBreaks.map((position, index) => (
        <div
          key={index}
          className="print:hidden"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${position}px`,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {/* Dashed line */}
          <div
            style={{
              borderTop: "2px dashed #ef4444",
              position: "relative",
            }}
          >
            {/* Page number badge */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%) translateY(-50%)",
                backgroundColor: "#ef4444",
                color: "white",
                padding: "0.25rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              <Scissors className="h-3 w-3" />
              Page {index + 1} ends here
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

interface WorksheetBuilderProps {
  selectedQuestions: WorksheetQuestion[];
  onRemoveQuestion: (id: string) => void;
  onClearAll: () => void;
  onOpenAdaptiveGenerator?: () => void;
}

export function WorksheetBuilder({
  selectedQuestions,
  onRemoveQuestion,
  onClearAll,
  onOpenAdaptiveGenerator,
}: WorksheetBuilderProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { trackFeature } = useFeatureTracking();
  const [worksheetTitle, setWorksheetTitle] = useState("Diagnostic Assessment");
  const [hasUserEditedTitle, setHasUserEditedTitle] = useState(false);
  const [worksheetMode, setWorksheetMode] = useState<WorksheetMode>("diagnostic");
  const [teacherName, setTeacherName] = useState("");

  // Auto-update title to first topic name when questions are added
  useEffect(() => {
    if (selectedQuestions.length > 0 && !hasUserEditedTitle) {
      const prefix = worksheetMode === "basic_assessment" ? "Assessment: " : "Diagnostic: ";
      setWorksheetTitle(prefix + selectedQuestions[0].topicName);
    } else if (selectedQuestions.length === 0 && !hasUserEditedTitle) {
      setWorksheetTitle(worksheetMode === "basic_assessment" ? "Math Assessment" : "Diagnostic Assessment");
    }
  }, [selectedQuestions, hasUserEditedTitle, worksheetMode]);
  const [showAnswerLines, setShowAnswerLines] = useState(true);
  const [questionCount, setQuestionCount] = useState("5");
  const [difficultyFilter, setDifficultyFilter] = useState<string[]>(["medium", "hard", "challenging"]);
  const [bloomFilter, setBloomFilter] = useState<BloomLevel[]>([
    "remember",
    "understand",
    "apply",
    "analyze",
    "evaluate",
    "create",
  ]);
  const [includeFormulas, setIncludeFormulas] = useState(false);
  const [includeFormulaSheet, setIncludeFormulaSheet] = useState(false);
  const [includeGraphPaper, setIncludeGraphPaper] = useState(false);
  const [includeCoordinateGeometry, setIncludeCoordinateGeometry] = useState(false);
  // AI images/geometry shapes disabled - kept for compatibility but always false
  const useAIImages = false;
  const useNanoBanana = false;
  const imageSize = 200;
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true); // Always generate answer keys for grading accuracy
  const [marginSize, setMarginSize] = useState<"small" | "medium" | "large">("medium"); // Page margin size
  const [includeScrapPaper, setIncludeScrapPaper] = useState(false); // Bundle scrap paper with worksheet
  const [scrapPaperLayout, setScrapPaperLayout] = useState<"single" | "split-2" | "split-4">("split-2"); // Scrap paper layout
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiledQuestions, setCompiledQuestions] = useState<GeneratedQuestion[]>([]);
  const [compiledAnswerKey, setCompiledAnswerKey] = useState<AnswerKeyItem[]>([]);
  const [isCompiled, setIsCompiled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewFormat, setPreviewFormat] = useState<"html" | "pdf" | "word">("html");
  const [wordPreviewUrl, setWordPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedWorksheets, setSavedWorksheets] = useState<SavedWorksheet[]>([]);
  const [showSavedWorksheets, setShowSavedWorksheets] = useState(false);
  const [isLoadingWorksheets, setIsLoadingWorksheets] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [saveClassId, setSaveClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<{id: string; name: string}[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Image generation state
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState(0);
  const [imageGenerationStatus, setImageGenerationStatus] = useState("");
  const [imagesGenerated, setImagesGenerated] = useState(false);

  // Prompt editing modal state
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [editablePrompts, setEditablePrompts] = useState<{ questionNumber: number; prompt: string }[]>([]);

  // Single image regeneration state
  const [regeneratingQuestionNumber, setRegeneratingQuestionNumber] = useState<number | null>(null);

  // Clipart state
  const [showClipartDialog, setShowClipartDialog] = useState(false);
  const [isGeneratingClipart, setIsGeneratingClipart] = useState(false);
  const [clipartProgress, setClipartProgress] = useState(0);
  const [clipartStatus, setClipartStatus] = useState("");
  const [clipartGenerated, setClipartGenerated] = useState(false);
  const [clipartSize, setClipartSize] = useState(15); // Clipart size in mm (10-40)

  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const marginMm = marginSize === "small" ? 12 : marginSize === "large" ? 25 : 20;
  const marginIn = marginMm / 25.4;
  const marginInCss = marginIn.toFixed(3);
  const marginPt = marginIn * 72;

  // Lightbox state for full-screen image viewing
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxQuestionNumber, setLightboxQuestionNumber] = useState<number | null>(null);

  // Canvas drawing tool state
  const [showDrawingTool, setShowDrawingTool] = useState(false);
  const [drawingQuestionNumber, setDrawingQuestionNumber] = useState<number | null>(null);

  // Note: Push to NYCLogic AI removed - Scholar only accepts analysis/recommendations, not worksheets

  // AI Image Review state
  const [showImageReviewDialog, setShowImageReviewDialog] = useState(false);
  const [imageSelectionQuestionNumber, setImageSelectionQuestionNumber] = useState<number | null>(null);
  const { pendingCount, saveImageForReview, approvedImages } = useAIImageLibrary();

  // Scrap Paper Generator state
  const [showScrapPaperGenerator, setShowScrapPaperGenerator] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // ESC key handler for preview modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showPreview) {
        setShowPreview(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPreview]);

  // Subjects that should NEVER have geometry shapes/diagrams
  const noShapeSubjects = ['financial', 'finance', 'economics', 'history', 'government', 'english', 'ela', 'bond', 'investment', 'insurance', 'retirement'];
  
  const isNoShapeSubject = selectedQuestions.some((q) => {
    const subject = q.subject?.toLowerCase() || "";
    const category = q.category?.toLowerCase() || "";
    const topicName = q.topicName?.toLowerCase() || "";
    return noShapeSubjects.some(ns => 
      subject.includes(ns) || category.includes(ns) || topicName.includes(ns)
    );
  });
  
  // Determine if selected topics are geometry/trigonometry related (for shape generation vs clipart)
  const isGeometryOrTrigSubject = !isNoShapeSubject && selectedQuestions.some((q) => {
    const subject = q.subject?.toLowerCase() || "";
    const category = q.category?.toLowerCase() || "";
    const topicName = q.topicName?.toLowerCase() || "";
    return (
      subject.includes("geometry") ||
      subject.includes("trigonometry") ||
      category.includes("geometry") ||
      category.includes("trigonometry") ||
      topicName.includes("geometry") ||
      topicName.includes("trigonometry") ||
      topicName.includes("triangle") ||
      topicName.includes("circle") ||
      topicName.includes("polygon") ||
      topicName.includes("angle") ||
      topicName.includes("congruence") ||
      topicName.includes("similarity") ||
      topicName.includes("pythagorean") ||
      topicName.includes("sine") ||
      topicName.includes("cosine") ||
      topicName.includes("tangent")
    );
  });

  const toggleDifficulty = (difficulty: string) => {
    setDifficultyFilter((prev) =>
      prev.includes(difficulty) ? prev.filter((d) => d !== difficulty) : [...prev, difficulty],
    );
  };

  const toggleBloomLevel = (level: BloomLevel) => {
    setBloomFilter((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  };

  const fetchSavedWorksheets = async () => {
    if (!user) return;
    setIsLoadingWorksheets(true);
    try {
      const { data, error } = await supabase.from("worksheets").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      setSavedWorksheets(
        (data || []).map((w) => ({
          ...w,
          questions: w.questions as unknown as GeneratedQuestion[],
          topics: w.topics as unknown as WorksheetQuestion[],
          settings: w.settings as unknown as SavedWorksheet["settings"],
        })),
      );
    } catch (error) {
      console.error("Error fetching worksheets:", error);
    } finally {
      setIsLoadingWorksheets(false);
    }
  };

  const saveWorksheet = async () => {
    if (!user || compiledQuestions.length === 0) return;

    setIsSaving(true);
    try {
      const worksheetData = {
        teacher_id: user.id,
        title: worksheetTitle,
        teacher_name: teacherName || null,
        class_id: saveClassId || null,
        questions: JSON.parse(JSON.stringify(compiledQuestions)),
        topics: JSON.parse(JSON.stringify(selectedQuestions)),
        settings: JSON.parse(
          JSON.stringify({
            questionCount,
            difficultyFilter,
            showAnswerLines,
            includeFormulas,
            includeFormulaSheet,
            includeGraphPaper,
            includeCoordinateGeometry,
            useAIImages,
            imageSize,
            includeClipart: clipartGenerated,
            worksheetMode,
            includeAnswerKey,
            answer_key: compiledAnswerKey,
          }),
        ),
      };
      const { error } = await supabase.from("worksheets").insert([worksheetData]);

      if (error) throw error;

      toast({
        title: "Worksheet saved!",
        description: "You can access it from your saved worksheets.",
      });
      fetchSavedWorksheets();
    } catch (error) {
      console.error("Error saving worksheet:", error);
      toast({
        title: "Failed to save",
        description: "Could not save worksheet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadWorksheet = (worksheet: SavedWorksheet) => {
    setWorksheetTitle(worksheet.title);
    setHasUserEditedTitle(true);
    setTeacherName(worksheet.teacher_name || "");
    setCompiledQuestions(worksheet.questions);
    setCompiledAnswerKey(worksheet.settings.answer_key ?? []);
    setQuestionCount(worksheet.settings.questionCount);
    setDifficultyFilter(worksheet.settings.difficultyFilter);
    setShowAnswerLines(worksheet.settings.showAnswerLines);
    setIncludeFormulas(worksheet.settings.includeFormulas ?? false);
    setIncludeFormulaSheet(worksheet.settings.includeFormulaSheet ?? false);
    setIncludeGraphPaper(worksheet.settings.includeGraphPaper ?? false);
    setIncludeCoordinateGeometry(worksheet.settings.includeCoordinateGeometry ?? false);
    // AI images disabled - skip loading these settings
    // setUseAIImages(worksheet.settings.useAIImages ?? worksheet.settings.includeGeometry ?? false);
    // setImageSize(worksheet.settings.imageSize ?? 200);
    setIncludeAnswerKey(worksheet.settings.includeAnswerKey ?? false);
    setIsCompiled(true);
    setShowSavedWorksheets(false);
    toast({
      title: "Worksheet loaded",
      description: `"${worksheet.title}" has been loaded.`,
    });
  };

  const deleteWorksheet = async (id: string) => {
    try {
      const { error } = await supabase.from("worksheets").delete().eq("id", id);
      if (error) throw error;
      setSavedWorksheets((prev) => prev.filter((w) => w.id !== id));
      toast({ title: "Worksheet deleted" });
    } catch (error) {
      console.error("Error deleting worksheet:", error);
      toast({
        title: "Failed to delete",
        description: "Could not delete worksheet.",
        variant: "destructive",
      });
    }
  };

  const generateShareCode = () => {
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  };

  const toggleShareWorksheet = async (worksheet: SavedWorksheet) => {
    setIsSharing(true);
    try {
      if (worksheet.is_shared) {
        // Unshare
        const { error } = await supabase
          .from("worksheets")
          .update({ is_shared: false, share_code: null })
          .eq("id", worksheet.id);

        if (error) throw error;

        setSavedWorksheets((prev) =>
          prev.map((w) => (w.id === worksheet.id ? { ...w, is_shared: false, share_code: null } : w)),
        );
        toast({ title: "Worksheet unshared" });
      } else {
        // Share
        const shareCode = generateShareCode();
        const { error } = await supabase
          .from("worksheets")
          .update({ is_shared: true, share_code: shareCode })
          .eq("id", worksheet.id);

        if (error) throw error;

        setSavedWorksheets((prev) =>
          prev.map((w) => (w.id === worksheet.id ? { ...w, is_shared: true, share_code: shareCode } : w)),
        );
        toast({ title: "Worksheet shared!" });
      }
    } catch (error) {
      console.error("Error toggling share:", error);
      toast({
        title: "Failed to update sharing",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const copyShareLink = async (shareCode: string, worksheetId: string) => {
    const shareUrl = `${window.location.origin}/worksheet/${shareCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(worksheetId);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "Link copied to clipboard!" });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: shareUrl,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchSavedWorksheets();
      // Load classes for class selector
      supabase.from('classes').select('id, name').eq('teacher_id', user.id).is('archived_at', null).order('name').then(({ data }) => {
        if (data) setClasses(data);
      });
    }
  }, [user]);

  const compileWorksheet = async () => {
    if (selectedQuestions.length === 0) {
      toast({
        title: "No topics selected",
        description: "Please select at least one topic to compile.",
        variant: "destructive",
      });
      return;
    }

    setIsCompiling(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-worksheet-questions", {
        body: {
          topics: selectedQuestions.map((q) => ({
            topicName: q.topicName,
            standard: q.standard,
            subject: q.subject,
            category: q.category,
          })),
          questionCount: parseInt(questionCount),
          difficultyLevels: difficultyFilter,
          bloomLevels: bloomFilter,
          includeGeometry: useAIImages,
          includeFormulas,
          includeGraphPaper,
          includeCoordinateGeometry,
          useAIImages,
          useNanoBanana,
          worksheetMode,
          includeAnswerKey,
        },
      });

      if (error) {
        handleApiError(error, "Worksheet generation");
        return;
      }

      if (checkResponseForApiError(data)) {
        return;
      }

      if (data.questions && data.questions.length > 0) {
        // SAFETY NET: Strip out SVGs and imagePrompts when:
        // 1. It's a non-geometry subject (never needs diagrams)
        // 2. OR useAIImages is false (user explicitly disabled images/diagrams)
        let cleanedQuestions = data.questions;
        if (isNoShapeSubject || !useAIImages) {
          cleanedQuestions = data.questions.map((q: GeneratedQuestion) => ({
            ...q,
            svg: undefined,
            imagePrompt: undefined,
            imageUrl: undefined,
          }));
        }

        setCompiledQuestions(cleanedQuestions);
        setCompiledAnswerKey(Array.isArray(data.answer_key) ? (data.answer_key as AnswerKeyItem[]) : []);
        setIsCompiled(true);

        // Track worksheet compilation
        trackFeature({
          featureName: "Compile Worksheet",
          category: "worksheets",
          action: "compiled",
          metadata: {
            questionCount: data.questions.length,
            topicCount: selectedQuestions.length,
            mode: worksheetMode,
            includeAIImages: useAIImages,
          },
        });

        // Show clipart dialog after successful compilation ONLY for non-geometry/trig subjects
        if (!isGeometryOrTrigSubject) {
          setShowClipartDialog(true);
          toast({
            title: "Worksheet compiled!",
            description: `Generated ${data.questions.length} questions. Would you like to add clipart?`,
          });
        } else {
          toast({
            title: "Worksheet compiled!",
            description: `Generated ${data.questions.length} questions. You can generate diagrams for geometry problems.`,
          });
        }
      } else {
        throw new Error("No questions generated");
      }
    } catch (error) {
      console.error("Error compiling worksheet:", error);
      handleApiError(error, "Worksheet generation");
    } finally {
      setIsCompiling(false);
    }
  };

  const resetCompilation = () => {
    setIsCompiled(false);
    setCompiledQuestions([]);
    setCompiledAnswerKey([]);
    setImagesGenerated(false);
    setImageGenerationProgress(0);
    setImageGenerationStatus("");
    setClipartGenerated(false);
    setClipartProgress(0);
    setClipartStatus("");
  };

  // Generate clipart for all questions
  const generateClipart = async () => {
    if (compiledQuestions.length === 0) return;

    setShowClipartDialog(false);
    setIsGeneratingClipart(true);
    setClipartProgress(0);
    setClipartStatus("Generating fun clipart for your worksheet...");

    try {
      const updatedQuestions = [...compiledQuestions];
      let successCount = 0;

      for (let i = 0; i < updatedQuestions.length; i++) {
        const question = updatedQuestions[i];
        setClipartStatus(`Generating clipart ${i + 1} of ${updatedQuestions.length}...`);

        // Create a themed clipart prompt based on the question topic
        const clipartPrompt = `Create a simple, fun, black and white line art clipart icon suitable for a math worksheet. The clipart should relate to: "${question.topic}" in the context of ${question.question.substring(0, 100)}. Make it educational, appropriate for students, simple enough to print clearly, cartoon-style with clean lines. No text, just the image. White background.`;

        const { data, error } = await supabase.functions.invoke("generate-diagram-images", {
          body: {
            questions: [
              {
                questionNumber: question.questionNumber,
                imagePrompt: clipartPrompt,
              },
            ],
          },
        });

        if (!error && data?.results?.[0]?.imageUrl) {
          updatedQuestions[i] = {
            ...updatedQuestions[i],
            clipartUrl: data.results[0].imageUrl,
          };
          successCount++;
        }

        setClipartProgress(((i + 1) / updatedQuestions.length) * 100);
      }

      setCompiledQuestions(updatedQuestions);
      setClipartGenerated(true);

      toast({
        title: "Clipart added!",
        description: `Successfully generated ${successCount} clipart images for your worksheet.`,
      });
    } catch (error) {
      console.error("Error generating clipart:", error);
      toast({
        title: "Clipart generation failed",
        description: "Some clipart could not be generated. You can continue without them.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingClipart(false);
      setClipartProgress(100);
    }
  };

  // Regenerate clipart for a single question
  const regenerateClipart = async (questionNumber: number) => {
    const question = compiledQuestions.find((q) => q.questionNumber === questionNumber);
    if (!question) return;

    setRegeneratingQuestionNumber(questionNumber);

    try {
      const clipartPrompt = `Create a simple, fun, black and white line art clipart icon suitable for a math worksheet. The clipart should relate to: "${question.topic}" in the context of ${question.question.substring(0, 100)}. Make it educational, appropriate for students, simple enough to print clearly, cartoon-style with clean lines. No text, just the image. White background.`;

      const { data, error } = await supabase.functions.invoke("generate-diagram-images", {
        body: {
          questions: [
            {
              questionNumber: questionNumber,
              imagePrompt: clipartPrompt,
            },
          ],
        },
      });

      if (!error && data?.results?.[0]?.imageUrl) {
        const updatedQuestions = compiledQuestions.map((q) =>
          q.questionNumber === questionNumber ? { ...q, clipartUrl: data.results[0].imageUrl } : q,
        );
        setCompiledQuestions(updatedQuestions);

        toast({
          title: "Clipart regenerated!",
          description: `New clipart created for question ${questionNumber}.`,
        });
      } else {
        throw new Error("No image returned");
      }
    } catch (error) {
      console.error("Error regenerating clipart:", error);
      toast({
        title: "Regeneration failed",
        description: "Could not regenerate the clipart. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingQuestionNumber(null);
    }
  };

  // Check if there are questions that need images
  const questionsNeedingImages = compiledQuestions.filter((q) => q.imagePrompt && !q.imageUrl);
  const hasQuestionsWithImagePrompts = compiledQuestions.some((q) => q.imagePrompt);

  // Helper to enhance prompts for better graph generation
  const enhanceGraphPrompt = (prompt: string): string => {
    if (!prompt) return prompt;

    const lower = prompt.toLowerCase();
    const isGraph =
      lower.includes("graph") || lower.includes("plot") || lower.includes("coordinate") || lower.includes("axis");

    if (isGraph) {
      // Check if it already has the enhancement (to avoid duplication)
      if (prompt.includes("Ensure x and y axes are clearly labeled")) return prompt;

      return `${prompt} . IMPORTANT: Ensure x and y axes are clearly labeled with unique, non-repeating integers. If plotting a range (e.g. 1 to 10), show marks at standard intervals (1, 2, 5, etc). Do not duplicate numbers. Plot points accurately. White background, high contrast, black line art. No grid lines unless necessary.`;
    }
    return prompt;
  };

  // Open prompt editor modal
  const openPromptEditor = () => {
    // If pending images exist, prioritize them. Otherwise enable review of all prompts.
    const targetQuestions =
      questionsNeedingImages.length > 0 ? questionsNeedingImages : compiledQuestions.filter((q) => q.imagePrompt);

    const promptsToEdit = targetQuestions.map((q) => ({
      questionNumber: q.questionNumber,
      prompt: q.imagePrompt!,
    }));
    setEditablePrompts(promptsToEdit);
    setShowPromptEditor(true);
  };

  // Update a single prompt in the editable prompts array
  const updateEditablePrompt = (questionNumber: number, newPrompt: string) => {
    setEditablePrompts((prev) =>
      prev.map((p) => (p.questionNumber === questionNumber ? { ...p, prompt: newPrompt } : p)),
    );
  };

  // Generate images with edited prompts
  const generateImagesWithEditedPrompts = async () => {
    if (editablePrompts.length === 0) {
      toast({
        title: "No diagrams to generate",
        description: "All questions already have images or no diagrams are needed.",
      });
      return;
    }

    // Update the compiled questions with edited prompts before generating
    const updatedQuestions = compiledQuestions.map((q) => {
      const editedPrompt = editablePrompts.find((p) => p.questionNumber === q.questionNumber);
      if (editedPrompt) {
        return { ...q, imagePrompt: editedPrompt.prompt };
      }
      return q;
    });
    setCompiledQuestions(updatedQuestions);

    setShowPromptEditor(false);
    setIsGeneratingImages(true);
    setImageGenerationProgress(0);
    setImageGenerationStatus(`Generating images for ${editablePrompts.length} questions...`);

    try {
      const { data, error } = await supabase.functions.invoke("generate-diagram-images", {
        body: {
          questions: editablePrompts.map((p) => ({
            questionNumber: p.questionNumber,
            imagePrompt: enhanceGraphPrompt(p.prompt),
          })),
          useNanoBanana,
        },
      });

      if (error) throw error;

      if (data.results) {
        // Update questions with generated images and save for review
        const finalQuestions = [...updatedQuestions];
        let successCount = 0;

        for (const result of data.results) {
          const questionIndex = finalQuestions.findIndex((q) => q.questionNumber === result.questionNumber);
          if (questionIndex !== -1 && result.imageUrl) {
            const question = finalQuestions[questionIndex];

            // Save image to library for teacher review
            await saveImageForReview(result.imageUrl, question.imagePrompt || "", {
              subject: selectedQuestions[0]?.subject || "math",
              topic: question.topic,
              source: "worksheet",
            });

            finalQuestions[questionIndex] = {
              ...finalQuestions[questionIndex],
              imageUrl: result.imageUrl,
            };
            successCount++;
          }
          // Update progress
          const progress = ((data.results.indexOf(result) + 1) / data.results.length) * 100;
          setImageGenerationProgress(progress);
          setImageGenerationStatus(`Generated ${successCount} of ${editablePrompts.length} diagrams`);
        }

        setCompiledQuestions(finalQuestions);
        setImagesGenerated(true);

        toast({
          title: "Diagrams generated & saved for review!",
          description: `${successCount} images created. Review them in your Image Library before using on worksheets.`,
        });
      }
    } catch (error) {
      console.error("Error generating images:", error);
      toast({
        title: "Image generation failed",
        description: "Some diagrams could not be generated. You can try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImages(false);
      setImageGenerationProgress(100);
    }
  };

  // Regenerate a single image
  const regenerateSingleImage = async (questionNumber: number) => {
    const question = compiledQuestions.find((q) => q.questionNumber === questionNumber);
    if (!question?.imagePrompt) {
      toast({
        title: "Cannot regenerate",
        description: "No diagram prompt found for this question.",
        variant: "destructive",
      });
      return;
    }

    setRegeneratingQuestionNumber(questionNumber);

    try {
      const { data, error } = await supabase.functions.invoke("generate-diagram-images", {
        body: {
          questions: [
            {
              questionNumber: questionNumber,
              imagePrompt: enhanceGraphPrompt(question.imagePrompt),
            },
          ],
          useNanoBanana,
        },
      });

      if (error) throw error;

      if (data.results && data.results[0]?.imageUrl) {
        const updatedQuestions = compiledQuestions.map((q) =>
          q.questionNumber === questionNumber ? { ...q, imageUrl: data.results[0].imageUrl } : q,
        );
        setCompiledQuestions(updatedQuestions);

        toast({
          title: "Diagram regenerated!",
          description: `New diagram created for question ${questionNumber}.`,
        });
      } else {
        throw new Error("No image returned");
      }
    } catch (error) {
      console.error("Error regenerating image:", error);
      toast({
        title: "Regeneration failed",
        description: "Could not regenerate the diagram. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingQuestionNumber(null);
    }
  };

  // Handle saving custom drawing to a question
  const handleSaveDrawing = (dataUrl: string, questionNumber?: number) => {
    if (questionNumber) {
      const updatedQuestions = compiledQuestions.map((q) =>
        q.questionNumber === questionNumber ? { ...q, imageUrl: dataUrl } : q,
      );
      setCompiledQuestions(updatedQuestions);
      toast({
        title: "Drawing added!",
        description: `Custom shape added to question ${questionNumber}.`,
      });
    }
    setShowDrawingTool(false);
    setDrawingQuestionNumber(null);
  };

  // State for regenerating question text
  const [regeneratingQuestionTextNumber, setRegeneratingQuestionTextNumber] = useState<number | null>(null);

  // State for tracking recently corrected symbols per question
  const [correctedSymbols, setCorrectedSymbols] = useState<Record<number, string[]>>({});

  // Helper to detect encoding issues in question text BEFORE regeneration
  const detectEncodingIssues = (text: string): { hasIssues: boolean; issues: string[] } => {
    const issues: string[] = [];

    // Common UTF-8 mojibake patterns that indicate encoding corruption
    const corruptionPatterns: { pattern: RegExp; description: string }[] = [
      { pattern: /Â(?=[πθ°²³√≤≥≠±×÷∠△½¼¾⊥∥≅])/g, description: "Â before symbol" },
      { pattern: /Â(?=\d)/g, description: "Â before number (likely π)" },
      { pattern: /(\d)Â\s/g, description: "number + Â (likely π)" },
      { pattern: /Â°/g, description: "corrupted degree symbol" },
      { pattern: /Â²/g, description: "corrupted squared" },
      { pattern: /Â³/g, description: "corrupted cubed" },
      { pattern: /Â½/g, description: "corrupted ½" },
      { pattern: /Â¼/g, description: "corrupted ¼" },
      { pattern: /Â¾/g, description: "corrupted ¾" },
      { pattern: /Â±/g, description: "corrupted ±" },
      { pattern: /â‰¤/g, description: "corrupted ≤" },
      { pattern: /â‰¥/g, description: "corrupted ≥" },
      { pattern: /â‰ /g, description: "corrupted ≠" },
      { pattern: /âˆš/g, description: "corrupted √" },
      { pattern: /Ï€/g, description: "corrupted π" },
      { pattern: /Î¸/g, description: "corrupted θ" },
      { pattern: /Î±/g, description: "corrupted α" },
      { pattern: /Î²/g, description: "corrupted β" },
      { pattern: /â†'/g, description: "corrupted →" },
      { pattern: /âˆž/g, description: "corrupted ∞" },
      // Generic Â not followed by expected characters (likely corruption)
      { pattern: /Â(?!\s|$)/g, description: "stray Â character" },
    ];

    for (const { pattern, description } of corruptionPatterns) {
      if (pattern.test(text)) {
        issues.push(description);
      }
    }

    return { hasIssues: issues.length > 0, issues: [...new Set(issues)] }; // Dedupe
  };

  // Helper to detect math symbols that were fixed
  const detectCorrectedSymbols = (oldText: string, newText: string): string[] => {
    const mathSymbolPatterns: { pattern: RegExp; name: string }[] = [
      { pattern: /π/g, name: "π (pi)" },
      { pattern: /°/g, name: "° (degrees)" },
      { pattern: /²/g, name: "² (squared)" },
      { pattern: /³/g, name: "³ (cubed)" },
      { pattern: /√/g, name: "√ (square root)" },
      { pattern: /≤/g, name: "≤ (less than or equal)" },
      { pattern: /≥/g, name: "≥ (greater than or equal)" },
      { pattern: /≠/g, name: "≠ (not equal)" },
      { pattern: /±/g, name: "± (plus/minus)" },
      { pattern: /×/g, name: "× (times)" },
      { pattern: /÷/g, name: "÷ (divide)" },
      { pattern: /θ/g, name: "θ (theta)" },
      { pattern: /∠/g, name: "∠ (angle)" },
      { pattern: /△/g, name: "△ (triangle)" },
      { pattern: /½/g, name: "½ (one half)" },
      { pattern: /¼/g, name: "¼ (one quarter)" },
      { pattern: /¾/g, name: "¾ (three quarters)" },
      { pattern: /⊥/g, name: "⊥ (perpendicular)" },
      { pattern: /∥/g, name: "∥ (parallel)" },
      { pattern: /≅/g, name: "≅ (congruent)" },
    ];

    const corrected: string[] = [];

    // Check for symbols that appear in new text but were corrupted in old text
    for (const { pattern, name } of mathSymbolPatterns) {
      const newMatches = (newText.match(pattern) || []).length;
      const oldMatches = (oldText.match(pattern) || []).length;

      // If new text has more of this symbol, it was likely fixed
      if (newMatches > oldMatches) {
        corrected.push(name);
      }
    }

    // Also check for common corruption patterns that were fixed
    const corruptionPatterns = [
      { old: /Â/g, name: "encoding errors" },
      { old: /â€/g, name: "character corruption" },
    ];

    for (const { old, name } of corruptionPatterns) {
      if (old.test(oldText) && !old.test(newText)) {
        corrected.push(name);
      }
    }

    return corrected;
  };

  // Regenerate the text of a single question (to fix formatting issues like π rendering)
  const regenerateQuestionText = async (questionNumber: number) => {
    const question = compiledQuestions.find((q) => q.questionNumber === questionNumber);
    if (!question) return;

    const oldQuestionText = question.question;
    setRegeneratingQuestionTextNumber(questionNumber);

    try {
      const { data, error } = await supabase.functions.invoke("generate-worksheet-questions", {
        body: {
          topics: [
            {
              topicName: question.topic,
              standard: question.standard,
              subject: selectedQuestions[0]?.subject || "Math",
              category: selectedQuestions[0]?.category || "General",
            },
          ],
          questionCount: 1,
          difficultyLevels: [question.difficulty],
          bloomLevels: question.bloomLevel ? [question.bloomLevel] : ["apply"],
          includeGeometry: !!question.imagePrompt,
          includeFormulas,
          includeGraphPaper,
          includeCoordinateGeometry,
          useAIImages,
          worksheetMode,
        },
      });

      if (error) throw error;

      if (data.questions && data.questions[0]) {
        const newQuestion = data.questions[0];
        const updatedQuestions = compiledQuestions.map((q) =>
          q.questionNumber === questionNumber
            ? {
                ...q,
                question: newQuestion.question,
                bloomLevel: newQuestion.bloomLevel || q.bloomLevel,
                bloomVerb: newQuestion.bloomVerb || q.bloomVerb,
                imagePrompt: newQuestion.imagePrompt || q.imagePrompt,
              }
            : q,
        );
        setCompiledQuestions(updatedQuestions);

        // Detect which symbols were corrected
        const detected = detectCorrectedSymbols(oldQuestionText, newQuestion.question);

        if (detected.length > 0) {
          // Store corrected symbols for visual display
          setCorrectedSymbols((prev) => ({ ...prev, [questionNumber]: detected }));

          // Clear the indicator after 5 seconds
          setTimeout(() => {
            setCorrectedSymbols((prev) => {
              const newState = { ...prev };
              delete newState[questionNumber];
              return newState;
            });
          }, 5000);

          toast({
            title: "✓ Symbols corrected!",
            description: `Fixed: ${detected.join(", ")}`,
          });
        } else {
          toast({
            title: "Question regenerated!",
            description: `New question text created for question ${questionNumber}.`,
          });
        }
      } else {
        throw new Error("No question returned");
      }
    } catch (error) {
      console.error("Error regenerating question:", error);
      handleApiError(error, "Question regeneration");
    } finally {
      setRegeneratingQuestionTextNumber(null);
    }
  };

  // Helper function to draw a scrap paper work zone
  const drawScrapWorkZone = (
    pdf: jsPDF,
    x: number,
    y: number,
    width: number,
    height: number,
    problemNumber: number,
  ) => {
    // Main container border (navy blue)
    pdf.setDrawColor(30, 58, 95);
    pdf.setLineWidth(0.8);
    pdf.rect(x, y, width, height);

    // Work area background
    pdf.setFillColor(248, 250, 252);
    pdf.rect(x + 0.4, y + 0.4, width - 0.8, height - 0.8, "F");

    // Problem label header
    const headerHeight = 8;
    pdf.setFillColor(224, 242, 254);
    pdf.rect(x + 0.4, y + 0.4, width - 0.8, headerHeight, "F");

    // Problem number badge
    pdf.setFillColor(30, 58, 95);
    pdf.roundedRect(x + 3, y + 2, 28, 5, 1, 1, "F");
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(`PROBLEM #${problemNumber}`, x + 5, y + 5.5);

    // Instructions
    pdf.setFontSize(6);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(100, 116, 139);
    pdf.text("Show all work within this zone", x + width - 38, y + 5.5);
    pdf.setTextColor(0);

    // Separator line
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.3);
    pdf.line(x, y + headerHeight, x + width, y + headerHeight);

    const contentStartY = y + 10;
    const contentEndY = y + height - 15;

    // Draw lined paper
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.15);
    const lineSpacing = 6;
    for (let lineY = contentStartY + lineSpacing; lineY < contentEndY; lineY += lineSpacing) {
      pdf.line(x + 3, lineY, x + width - 3, lineY);
    }

    // Corner markers for AI zone detection
    pdf.setDrawColor(30, 58, 95);
    pdf.setLineWidth(0.5);
    const markerSize = 5;
    const markerOffset = 10;

    // Top-left
    pdf.line(x + 2, y + markerOffset, x + 2, y + markerOffset + markerSize);
    pdf.line(x + 2, y + markerOffset, x + 2 + markerSize, y + markerOffset);

    // Top-right
    pdf.line(x + width - 2, y + markerOffset, x + width - 2, y + markerOffset + markerSize);
    pdf.line(x + width - 2, y + markerOffset, x + width - 2 - markerSize, y + markerOffset);

    // Bottom-left
    pdf.line(x + 2, contentEndY - 2, x + 2, contentEndY - 2 - markerSize);
    pdf.line(x + 2, contentEndY - 2, x + 2 + markerSize, contentEndY - 2);

    // Bottom-right
    pdf.line(x + width - 2, contentEndY - 2, x + width - 2, contentEndY - 2 - markerSize);
    pdf.line(x + width - 2, contentEndY - 2, x + width - 2 - markerSize, contentEndY - 2);

    // Final Answer Section
    const answerSectionHeight = 12;
    const answerY = y + height - answerSectionHeight - 2;

    // Answer section separator
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.setLineWidth(0.3);
    pdf.line(x + 2, answerY, x + width - 2, answerY);
    pdf.setLineDashPattern([], 0);

    // Answer section background (amber)
    pdf.setFillColor(254, 243, 199);
    pdf.rect(x + 0.4, answerY + 0.5, width - 0.8, answerSectionHeight, "F");

    // Answer section top border
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(0.5);
    pdf.line(x, answerY + 0.5, x + width, answerY + 0.5);

    // Final Answer badge
    pdf.setFillColor(253, 230, 138);
    pdf.roundedRect(x + 3, answerY + 2.5, 25, 5, 1, 1, "F");
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x + 3, answerY + 2.5, 25, 5, 1, 1, "S");
    pdf.setFontSize(6);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(146, 64, 14);
    pdf.text(`ANSWER #${problemNumber}`, x + 4.5, answerY + 6);

    // Answer line
    pdf.setDrawColor(217, 119, 6);
    pdf.setLineWidth(0.4);
    pdf.line(x + 30, answerY + 8, x + width - 5, answerY + 8);

    pdf.setTextColor(0);
  };

  // Helper function to draw a scrap paper work zone with PIXEL units (for generatePDF with px unit)
  const drawScrapWorkZonePx = (
    pdf: jsPDF,
    x: number,
    y: number,
    width: number,
    height: number,
    problemNumber: number,
  ) => {
    // Note: jsPDF with 'px' unit still uses points for font sizes
    // Positioning is in pixels, but fonts are in points

    // Main container border (navy blue)
    pdf.setDrawColor(30, 58, 95);
    pdf.setLineWidth(2);
    pdf.rect(x, y, width, height);

    // Work area background (light gray-blue)
    pdf.setFillColor(248, 250, 252);
    pdf.rect(x + 1, y + 1, width - 2, height - 2, "F");

    // Problem label header background (light blue)
    const headerHeight = 28;
    pdf.setFillColor(224, 242, 254);
    pdf.rect(x + 1, y + 1, width - 2, headerHeight, "F");

    // Problem number badge (navy blue rounded rect)
    pdf.setFillColor(30, 58, 95);
    pdf.roundedRect(x + 10, y + 6, 85, 18, 3, 3, "F");
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(`PROBLEM #${problemNumber}`, x + 18, y + 18);

    // Instructions text on right
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(100, 116, 139);
    pdf.text("Show all work within this zone", x + width - 140, y + 18);
    pdf.setTextColor(0);

    // Separator line below header
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(1);
    pdf.line(x, y + headerHeight, x + width, y + headerHeight);

    const contentStartY = y + headerHeight + 8;
    const answerSectionHeight = 42;
    const contentEndY = y + height - answerSectionHeight - 8;

    // Draw lined paper
    pdf.setDrawColor(220, 225, 230);
    pdf.setLineWidth(0.5);
    const lineSpacing = 22;
    for (let lineY = contentStartY + lineSpacing; lineY < contentEndY; lineY += lineSpacing) {
      pdf.line(x + 10, lineY, x + width - 10, lineY);
    }

    // Corner markers for AI zone detection
    pdf.setDrawColor(30, 58, 95);
    pdf.setLineWidth(1.5);
    const markerSize = 15;
    const markerInset = 8;
    const markerTopY = contentStartY + 5;
    const markerBottomY = contentEndY - 5;

    // Top-left corner marker
    pdf.line(x + markerInset, markerTopY, x + markerInset, markerTopY + markerSize);
    pdf.line(x + markerInset, markerTopY, x + markerInset + markerSize, markerTopY);

    // Top-right corner marker
    pdf.line(x + width - markerInset, markerTopY, x + width - markerInset, markerTopY + markerSize);
    pdf.line(x + width - markerInset, markerTopY, x + width - markerInset - markerSize, markerTopY);

    // Bottom-left corner marker
    pdf.line(x + markerInset, markerBottomY, x + markerInset, markerBottomY - markerSize);
    pdf.line(x + markerInset, markerBottomY, x + markerInset + markerSize, markerBottomY);

    // Bottom-right corner marker
    pdf.line(x + width - markerInset, markerBottomY, x + width - markerInset, markerBottomY - markerSize);
    pdf.line(x + width - markerInset, markerBottomY, x + width - markerInset - markerSize, markerBottomY);

    // Final Answer Section
    const answerY = y + height - answerSectionHeight;

    // Dashed separator line
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineDashPattern([6, 4], 0);
    pdf.setLineWidth(1);
    pdf.line(x + 8, answerY, x + width - 8, answerY);
    pdf.setLineDashPattern([], 0);

    // Answer section background (amber/cream)
    pdf.setFillColor(254, 243, 199);
    pdf.rect(x + 1, answerY + 2, width - 2, answerSectionHeight - 3, "F");

    // Answer section top accent border (orange)
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(2);
    pdf.line(x, answerY + 2, x + width, answerY + 2);

    // Answer badge (lighter amber with border)
    pdf.setFillColor(253, 230, 138);
    pdf.roundedRect(x + 10, answerY + 10, 80, 18, 3, 3, "F");
    pdf.setDrawColor(245, 158, 11);
    pdf.setLineWidth(1);
    pdf.roundedRect(x + 10, answerY + 10, 80, 18, 3, 3, "S");

    // Answer label text
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(146, 64, 14);
    pdf.text(`ANSWER #${problemNumber}`, x + 17, answerY + 22);

    // Answer line
    pdf.setDrawColor(217, 119, 6);
    pdf.setLineWidth(1);
    pdf.line(x + 100, answerY + 28, x + width - 15, answerY + 28);

    // Reset text color
    pdf.setTextColor(0);
  };

  /**
   * Generate PDF using WYSIWYG approach with intelligent page break handling.
   * Renders each logical section (header, questions, formula sheet, answer key) separately,
   * measures heights, and ensures content is never cut mid-section.
   * Major sections like Formula Reference Sheet and Answer Key always start on new pages.
   */
  const generatePDF = async () => {
    if (compiledQuestions.length === 0) {
      toast({
        title: "No questions compiled",
        description: "Please compile the worksheet first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    toast({
      title: "Generating PDF...",
      description: "Creating optimized PDF with intelligent page breaks. Please wait.",
    });

    try {
      // Page dimensions at 96 DPI
      const pageWidthPx = 816; // 8.5in at 96 DPI
      const pageHeightPx = 1056; // 11in at 96 DPI
      const marginPx = marginIn * 96; // Convert margin from inches to pixels
      const usableHeight = pageHeightPx - marginPx * 2; // Height available for content per page
      const scale = 2; // 2x scale for better quality

      // Create temporary container for measuring heights
      const tempContainer = document.createElement("div");
      tempContainer.style.cssText = `
        position: absolute;
        left: -10000px;
        top: 0;
        width: ${pageWidthPx}px;
        background: white;
      `;
      document.body.appendChild(tempContainer);

      // Common styles for content sections
      const baseStyles = `
        background-color: white;
        padding: 0;
        box-sizing: border-box;
        width: ${pageWidthPx - marginPx * 2}px;
        max-width: ${pageWidthPx - marginPx * 2}px;
        overflow: hidden;
        font-family: 'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif;
      `;

      // Helper function to create a section element and measure its height
      const createSection = (htmlContent: string): HTMLElement => {
        const section = document.createElement("div");
        section.style.cssText = baseStyles;
        section.innerHTML = htmlContent;
        return section;
      };

      // Helper function to measure element height
      const waitForImages = (root: HTMLElement) => {
        const images = Array.from(root.querySelectorAll("img"));
        if (images.length === 0) {
          return Promise.resolve();
        }
        return Promise.all(
          images.map((img) => {
            if (img.complete) {
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              const handle = () => {
                img.removeEventListener("load", handle);
                img.removeEventListener("error", handle);
                resolve();
              };
              img.addEventListener("load", handle, { once: true });
              img.addEventListener("error", handle, { once: true });
            });
          }),
        );
      };

      const measureHeight = async (element: HTMLElement): Promise<number> => {
        tempContainer.innerHTML = "";
        tempContainer.appendChild(element);

        await waitForImages(element);

        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

        return element.scrollHeight;
      };

      // Build all content sections
      interface ContentSection {
        type: "header" | "question" | "formula-sheet" | "answer-key" | "footer";
        html: string;
        height: number;
        forceNewPage: boolean;
      }

      const sections: ContentSection[] = [];

      // Section 1: Header (Instructions + Title + Student Info)
      let headerHtml = "";
      if (showAnswerLines) {
        headerHtml += `
          <div style="
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.4rem 0.75rem;
            margin-bottom: 0.75rem;
            background-color: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 0.25rem;
            font-size: 0.65rem;
            color: #166534;
          ">
            <span style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;">
              Instructions:
            </span>
            <span style="flex: 1;">
              Write all work in the <strong>Work Area</strong> boxes. Put your final answer in the <strong>Final Answer</strong> section.
            </span>
          </div>
        `;
      }
      const worksheetCreatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const worksheetTrackingId = 'WS-' + Date.now().toString(36).toUpperCase().slice(-6);
      headerHtml += `
        <div style="text-align: center; margin-bottom: 1rem;">
          <h1 style="font-size: 1.5rem; font-weight: bold; color: black; margin: 0;">${worksheetTitle}</h1>
          ${teacherName ? `<p style="color: #4b5563; margin-top: 0.25rem; font-size: 0.875rem;">Teacher: ${teacherName}</p>` : ""}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 0.5rem; border-bottom: 1px solid #d1d5db; padding-bottom: 0.75rem; color: black;">
          <span>Name: _______________________</span>
          <span>Date: ___________</span>
          <span>Period: _____</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 1rem; color: #9ca3af;">
          <span>Worksheet Created: ${worksheetCreatedDate}</span>
          <span>ID: ${worksheetTrackingId}</span>
        </div>
      `;
      const headerElement = createSection(headerHtml);
      sections.push({
        type: "header",
        html: headerHtml,
        height: await measureHeight(headerElement),
        forceNewPage: false,
      });

      // Section 2: Individual Questions (each question as separate section for intelligent breaking)
      for (const question of compiledQuestions) {
        const bloomLevel = question.bloomLevel || "Remember";
        const bloomVerb = question.bloomVerb || "state";
        const advancementColor =
          question.advancementLevel === "A"
            ? "#166534"
            : question.advancementLevel === "B"
              ? "#047857"
              : question.advancementLevel === "C"
                ? "#a16207"
                : question.advancementLevel === "D"
                  ? "#c2410c"
                  : question.advancementLevel === "E"
                    ? "#b91c1c"
                    : "#374151";

        const questionHtml = `
          <div style="margin-bottom: 1.5rem; width: 100%; box-sizing: border-box;">
            <!-- Question header -->
            <div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; margin-bottom: 0.125rem; border-bottom: 1px solid #1e3a5f; padding-bottom: 0.25rem;">
              <span style="font-weight: 700; color: black; font-size: 0.9rem;">
                ${question.questionNumber}. [${bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1)}: ${bloomVerb}]
              </span>
              ${
                worksheetMode === "diagnostic" && question.advancementLevel
                  ? `
                <span style="font-size: 0.75rem; font-weight: 600; color: ${advancementColor};">
                  [Level ${question.advancementLevel}]
                </span>
              `
                  : ""
              }
              <span style="font-size: 0.75rem; color: #374151;">
                [${question.difficulty}]
              </span>
            </div>
            
            <!-- Topic/Standard -->
            <p style="font-size: 0.75rem; color: #6b7280; margin-left: 1rem; margin-bottom: 0.375rem; font-style: italic;">
              ${question.topic} (${question.standard})
            </p>
            
            <!-- Question text -->
            <div style="margin-left: 1rem; margin-right: 0.5rem; font-family: serif; line-height: 1.3; font-size: 0.95rem; color: black; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; hyphens: auto; letter-spacing: 0.02em;">
              ${renderMathText(fixEncodingCorruption(question.question))}
            </div>
            
            ${
              question.svg
                ? `
              <div style="margin-left: 1rem; margin-top: 0.5rem; display: flex; justify-content: center;">
                ${question.svg}
              </div>
            `
                : ""
            }
            
            ${
              question.imageUrl
                ? `
              <div style="margin-left: 1rem; margin-top: 0.5rem; display: flex; justify-content: center;">
                <img src="${question.imageUrl}" alt="Question ${question.questionNumber}" style="max-width: ${imageSize}px; max-height: ${imageSize}px;" />
              </div>
            `
                : ""
            }
            
            <!-- Work Area Box -->
            ${
              showAnswerLines
                ? `
              <div style="border: 2px solid #1e3a5f; margin-top: 0.5rem; margin-left: 1rem; margin-right: 0.5rem; background-color: #ffffff; overflow: hidden; box-sizing: border-box;">
                <!-- Work Area Section -->
                <div style="border-bottom: 2px dashed #94a3b8; padding: 0.5rem 0.75rem; background-color: #ffffff;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.375rem;">
                    <span style="font-size: 0.7rem; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.05em;">
                      Work Area Q${question.questionNumber}
                    </span>
                    <span style="font-size: 0.6rem; color: #64748b; font-style: italic;">
                      Show all calculations & reasoning here
                    </span>
                  </div>
                  <div style="min-height: 90px; position: relative;">
                    <div style="border-bottom: 1px solid #d1d5db; height: 1.1rem;"></div>
                    <div style="border-bottom: 1px solid #d1d5db; height: 1.1rem;"></div>
                    <div style="border-bottom: 1px solid #d1d5db; height: 1.1rem;"></div>
                    <div style="border-bottom: 1px solid #d1d5db; height: 1.1rem;"></div>
                    <div style="border-bottom: 1px solid #d1d5db; height: 1.1rem;"></div>
                    <div style="position: absolute; top: 0; left: 0; width: 10px; height: 10px; border-left: 2px solid #1e3a5f; border-top: 2px solid #1e3a5f;"></div>
                    <div style="position: absolute; top: 0; right: 0; width: 10px; height: 10px; border-right: 2px solid #1e3a5f; border-top: 2px solid #1e3a5f;"></div>
                  </div>
                </div>
                
                <!-- Final Answer Section -->
                <div style="padding: 0.5rem 0.75rem; background-color: #fef3c7; border-top: 2px solid #f59e0b;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 0.7rem; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.03em; background-color: #fde68a; padding: 0.15rem 0.5rem; border-radius: 0.2rem; border: 1.5px solid #f59e0b; white-space: nowrap;">
                      Final Answer
                    </span>
                    <div style="flex: 1; border-bottom: 1.5px solid #d97706; min-height: 1.25rem;"></div>
                  </div>
                </div>
              </div>
            `
                : ""
            }
          </div>
        `;

        const questionElement = createSection(questionHtml);
        sections.push({
          type: "question",
          html: questionHtml,
          height: await measureHeight(questionElement),
          forceNewPage: false,
        });
      }

      // Section 3: Formula Reference Sheet (ALWAYS starts on new page)
      if (includeFormulaSheet) {
        const relevantFormulas = getFormulasForTopics(
          selectedQuestions.map((q) => ({ category: q.category, topicName: q.topicName })),
        );

        if (relevantFormulas.length > 0) {
          const formulaHtml = `
            <div style="padding-top: 1rem;">
              <h2 style="font-size: 1.25rem; font-weight: bold; text-align: center; margin-bottom: 0.5rem; color: black;">Formula Reference Sheet</h2>
              <p style="text-align: center; font-size: 0.875rem; color: #6b7280; margin-bottom: 1.5rem;">Based on selected topics</p>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                ${relevantFormulas
                  .map(
                    (category) => `
                  <div style="space-y: 0.5rem;">
                    <h3 style="font-weight: 600; font-size: 0.875rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; color: black;">${category.category}</h3>
                    <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.875rem;">
                      ${category.formulas
                        .map(
                          (formula) => `
                        <li style="color: black; margin-bottom: 0.25rem;">
                          <span style="font-weight: 500;">${formula.name}:</span>
                          <span style="font-family: monospace; font-size: 0.75rem;">${formula.formula}</span>
                          ${formula.description ? `<span style="font-size: 0.75rem; color: #6b7280; margin-left: 1rem;">(${formula.description})</span>` : ""}
                        </li>
                      `,
                        )
                        .join("")}
                    </ul>
                  </div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;

          const formulaElement = createSection(formulaHtml);
          sections.push({
            type: "formula-sheet",
            html: formulaHtml,
            height: await measureHeight(formulaElement),
            forceNewPage: true, // Always start on new page
          });
        }
      }

      // Section 4: Answer Key (ALWAYS starts on new page)
      if (includeAnswerKey && compiledQuestions.some((q) => q.answer)) {
        // 4a. Answer Key Header
        const answerKeyHeaderHtml = `
          <div style="padding-top: 1rem;">
            <h2 style="font-size: 1.25rem; font-weight: bold; text-align: center; margin-bottom: 0.5rem; color: black;">ANSWER KEY</h2>
            <p style="text-align: center; font-size: 0.875rem; color: #4b5563; margin-bottom: 0.25rem;">${worksheetTitle}</p>
            <p style="text-align: center; font-size: 0.75rem; color: #dc2626; font-style: italic; margin-bottom: 1.5rem;">FOR TEACHER USE ONLY</p>
          </div>
        `;
        const answerKeyHeaderElement = createSection(answerKeyHeaderHtml);
        sections.push({
          type: "answer-key", // treating header as answer-key type for footer logic
          html: answerKeyHeaderHtml,
          height: await measureHeight(answerKeyHeaderElement),
          forceNewPage: true,
        });

        // 4b. Individual Answers (generated as separate sections to allow page breaking)
        const relevantQuestions = compiledQuestions.filter((q) => q.answer);
        for (const question of relevantQuestions) {
          const answerHtml = `
            <div style="padding-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 0.75rem;">
              <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                <span style="font-weight: bold; color: black;">Question ${question.questionNumber}:</span>
                <span style="font-size: 0.75rem; color: #6b7280; font-style: italic;">${question.topic}</span>
              </div>
              <div style="margin-top: 0.25rem; margin-left: 1rem; font-size: 0.875rem; color: black;">
                <span style="font-weight: 500; color: #15803d;">Answer: </span>
                ${renderMathText(fixEncodingCorruption(question.answer || ""))}
              </div>
            </div>
          `;

          const answerElement = createSection(answerHtml);
          sections.push({
            type: "answer-key",
            html: answerHtml,
            height: await measureHeight(answerElement),
            forceNewPage: false, // Allow flowing naturally
          });
        }
      }

      // Organize sections into pages with intelligent breaks
      interface PageContent {
        sections: ContentSection[];
        totalHeight: number;
      }

      const pages: PageContent[] = [];
      let currentPage: PageContent = { sections: [], totalHeight: 0 };

      // Safety buffer to account for rendering discrepancies (measured vs captured)
      // This prevents content from flowing to the edge and getting cut off
      const heightBuffer = 70;
      const safeUsableHeight = usableHeight - heightBuffer;

      for (const section of sections) {
        // If section forces a new page AND we have content on current page, start new page
        if (section.forceNewPage && currentPage.sections.length > 0) {
          pages.push(currentPage);
          currentPage = { sections: [], totalHeight: 0 };
        }

        // Check if section fits on current page (using safe height)
        const wouldExceed = currentPage.totalHeight + section.height > safeUsableHeight;

        if (wouldExceed && currentPage.sections.length > 0) {
          // Section doesn't fit, start new page
          pages.push(currentPage);
          currentPage = { sections: [], totalHeight: 0 };
        }

        // Add section to current page
        currentPage.sections.push(section);
        currentPage.totalHeight += section.height;
      }

      // Don't forget the last page
      if (currentPage.sections.length > 0) {
        pages.push(currentPage);
      }

      // Create PDF with letter size
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [pageWidthPx, pageHeightPx],
        hotfixes: ["px_scaling"],
      });

      let isFirstPdfPage = true;

      // Render each page
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];

        // Create a container for this page's content
        const pageContent = document.createElement("div");
        pageContent.style.cssText = `
          background-color: white;
          padding: ${marginPx}px;
          box-sizing: border-box;
          width: ${pageWidthPx}px;
          min-height: ${pageHeightPx}px;
          font-family: 'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif;
        `;

        // Add all sections for this page
        for (const section of page.sections) {
          const sectionDiv = document.createElement("div");
          sectionDiv.innerHTML = section.html;
          pageContent.appendChild(sectionDiv);
        }

        // Add footer to last page or pages with formula sheet / answer key
        const isLastPage = pageIndex === pages.length - 1;
        const hasSpecialSection = page.sections.some((s) => s.type === "formula-sheet" || s.type === "answer-key");

        if (isLastPage || hasSpecialSection) {
          const footer = document.createElement("div");
          footer.innerHTML = `
            <div style="margin-top: 2rem; text-align: center; font-size: 0.5rem; color: #9ca3af;">
              Generated with NYCLogic Ai - NYS Regents Aligned
            </div>
          `;
          pageContent.appendChild(footer);
        }

        // Temporarily add to DOM for rendering
        tempContainer.innerHTML = "";
        tempContainer.appendChild(pageContent);

        await waitForImages(pageContent);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

        const actualHeight = pageContent.scrollHeight;
        const captureHeight = Math.max(pageHeightPx, actualHeight);

        const canvas = await html2canvas(pageContent, {
          scale: scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: pageWidthPx,
          height: captureHeight,
          windowWidth: pageWidthPx,
          windowHeight: captureHeight,
        });

        const pagesNeeded = Math.ceil(captureHeight / pageHeightPx);
        const scaledPageHeight = pageHeightPx * scale;
        const scaledPageWidth = pageWidthPx * scale;

        for (let sliceIndex = 0; sliceIndex < pagesNeeded; sliceIndex++) {
          if (!isFirstPdfPage) {
            pdf.addPage();
          }
          isFirstPdfPage = false;

          const sourceY = sliceIndex * scaledPageHeight;
          const remaining = canvas.height - sourceY;
          const sourceHeight = Math.min(scaledPageHeight, remaining);

          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = scaledPageWidth;
          pageCanvas.height = scaledPageHeight;
          const ctx = pageCanvas.getContext("2d");

          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, scaledPageWidth, scaledPageHeight);

            if (sourceHeight > 0) {
              ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, scaledPageWidth, sourceHeight);
            }

            const imgData = pageCanvas.toDataURL("image/png", 1.0);
            pdf.addImage(imgData, "PNG", 0, 0, pageWidthPx, pageHeightPx, undefined, "FAST");
          }
        }
      }

      // Clean up
      document.body.removeChild(tempContainer);

      // Add Scrap Paper Pages if enabled
      let scrapPaperPagesCount = 0;

      if (includeScrapPaper) {
        const problemNumbers = compiledQuestions.map((q) => q.questionNumber);
        const zonesPerPage = scrapPaperLayout === "single" ? 1 : scrapPaperLayout === "split-2" ? 2 : 4;
        const pagesNeeded = Math.ceil(problemNumbers.length / zonesPerPage);
        scrapPaperPagesCount = pagesNeeded;

        let problemIndex = 0;

        for (let page = 0; page < pagesNeeded; page++) {
          pdf.addPage([pageWidthPx, pageHeightPx]);

          // Set white background
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pageWidthPx, pageHeightPx, "F");

          // Use pixel-based margin
          const margin = marginPx;
          const contentWidth = pageWidthPx - marginPx * 2;

          let yPos = margin;

          // Scrap Paper Header
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 58, 95);
          pdf.text(`${worksheetTitle} - Scrap Paper`, pageWidthPx / 2, yPos, { align: "center" });
          yPos += 20;

          // Subheader
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Page ${page + 1} of ${pagesNeeded} | AI-Optimized Work Zones`, pageWidthPx / 2, yPos, {
            align: "center",
          });
          yPos += 15;

          // Name/Date line
          pdf.setFontSize(10);
          pdf.setTextColor(0);
          pdf.text("Name: _______________________", margin, yPos);
          pdf.text("Date: ___________", pageWidthPx - margin - 120, yPos);
          yPos += 25;

          // Instructions banner
          pdf.setFillColor(236, 253, 245);
          pdf.setDrawColor(110, 231, 183);
          pdf.roundedRect(margin, yPos, contentWidth, 25, 3, 3, "FD");
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(4, 120, 87);
          pdf.text("[!] INSTRUCTIONS:", margin + 10, yPos + 16);
          pdf.setFont("helvetica", "normal");
          pdf.text(
            "Keep all work within the designated zones for AI scanning. Write clearly and stay inside the boxes.",
            margin + 120,
            yPos + 16,
          );
          yPos += 35;

          const availableHeight = pageHeightPx - yPos - margin;

          // Draw work zones based on layout (using pixel-based function)
          if (scrapPaperLayout === "single") {
            const zoneHeight = availableHeight;
            const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
            drawScrapWorkZonePx(pdf, margin, yPos, contentWidth, zoneHeight, problemNum);
            problemIndex++;
          } else if (scrapPaperLayout === "split-2") {
            const zoneHeight = (availableHeight - 15) / 2;
            for (let i = 0; i < 2 && problemIndex < problemNumbers.length; i++) {
              const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
              drawScrapWorkZonePx(pdf, margin, yPos + i * (zoneHeight + 15), contentWidth, zoneHeight, problemNum);
              problemIndex++;
            }
          } else if (scrapPaperLayout === "split-4") {
            const zoneWidth = (contentWidth - 15) / 2;
            const zoneHeight = (availableHeight - 15) / 2;
            for (let row = 0; row < 2; row++) {
              for (let col = 0; col < 2 && problemIndex < problemNumbers.length; col++) {
                const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
                const x = margin + col * (zoneWidth + 15);
                const y = yPos + row * (zoneHeight + 15);
                drawScrapWorkZonePx(pdf, x, y, zoneWidth, zoneHeight, problemNum);
                problemIndex++;
              }
            }
          }
        }
      }

      // Download the PDF
      const fileName = `${worksheetTitle.replace(/[^a-z0-9]/gi, "_")}_worksheet.pdf`;
      pdf.save(fileName);

      const pdfPageCount = pdf.getNumberOfPages();
      toast({
        title: "PDF Downloaded!",
        description: `Saved as ${fileName} (${pdfPageCount} page${pdfPageCount > 1 ? "s" : ""}${scrapPaperPagesCount > 0 ? `, including ${scrapPaperPagesCount} scrap paper page${scrapPaperPagesCount > 1 ? "s" : ""}` : ""})`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "PDF Generation Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Legacy PDF generation function kept for reference but not used
  const generatePDFLegacy = async () => {
    if (compiledQuestions.length === 0) {
      toast({
        title: "No questions compiled",
        description: "Please compile the worksheet first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const pdf = new jsPDF("p", "mm", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = marginMm; // Based on user preference
      const contentWidth = pageWidth - margin * 2;
      let yPosition = margin;

      // Header
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(sanitizeForPDF(worksheetTitle), pageWidth / 2, yPosition, { align: "center" });
      yPosition += 10;

      if (teacherName) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.text(sanitizeForPDF(`Teacher: ${teacherName}`), pageWidth / 2, yPosition, { align: "center" });
        yPosition += 8;
      }

      // Student info line
      pdf.setFontSize(11);
      pdf.text("Name: _______________________   Date: ___________   Period: _____", margin, yPosition);
      yPosition += 15;

      // Separator
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5);

      // Questions
      for (const question of compiledQuestions) {
        // Check if we need a new page
        if (yPosition > pageHeight - 80) {
          pdf.addPage();
          yPosition = margin;
        }

        // Question number, Bloom's level, advancement level (for diagnostic), and difficulty badge
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        const difficultyText = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1);
        const bloomLabel = question.bloomLevel
          ? question.bloomLevel.charAt(0).toUpperCase() + question.bloomLevel.slice(1)
          : "";

        const headerParts: string[] = [`${question.questionNumber}.`];
        if (bloomLabel) {
          headerParts.push(`[${bloomLabel}${question.bloomVerb ? `: ${question.bloomVerb}` : ""}]`);
        }
        if (worksheetMode === "diagnostic" && question.advancementLevel) {
          headerParts.push(`[Level ${question.advancementLevel}]`);
        }
        headerParts.push(`[${difficultyText}]`);

        pdf.text(headerParts.join(" "), margin, yPosition);
        yPosition += 6;

        // Topic and standard reference
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text(sanitizeForPDF(`${question.topic} (${question.standard})`), margin + 5, yPosition);
        pdf.setTextColor(0);
        yPosition += 8;

        // Question text - wrap long text, sanitize for PDF to fix encoding issues
        pdf.setFontSize(10); // Slightly smaller for better fit
        const sanitizedQuestion = sanitizeForPDF(renderMathText(fixEncodingCorruption(question.question)));
        // Use 85% of content width to prevent text overflow
        const lines = pdf.splitTextToSize(sanitizedQuestion, contentWidth * 0.85);

        lines.forEach((line: string) => {
          if (yPosition > pageHeight - 40) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(line, margin + 5, yPosition);
          yPosition += 5;
        });
        pdf.setFontSize(11); // Reset

        yPosition += 4;

        // Render AI-generated image if present
        if (question.imageUrl) {
          try {
            // Create an image from the base64 data URL
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.crossOrigin = "anonymous";
              img.src = question.imageUrl!;
            });

            // Draw to canvas and get as PNG data URL
            const canvas = document.createElement("canvas");
            canvas.width = img.width || 400;
            canvas.height = img.height || 400;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              const pngDataUrl = canvas.toDataURL("image/png");

              // Check if we need a new page for the image
              if (yPosition > pageHeight - 80) {
                pdf.addPage();
                yPosition = margin;
              }

              // Add image to PDF (centered) - use user-configured size
              // Convert pixel size to mm (roughly 0.26mm per pixel at 96dpi)
              const imgSizeMm = imageSize * 0.26;
              const imgWidth = imgSizeMm;
              const imgHeight = imgSizeMm;
              const imgX = (pageWidth - imgWidth) / 2;
              pdf.addImage(pngDataUrl, "PNG", imgX, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 5;
            }
          } catch (imgError) {
            console.error("Error rendering AI image to PDF:", imgError);
          }
        }
        // Render SVG as image if present (fallback)
        else if (question.svg) {
          try {
            // Convert SVG to data URL
            const svgBlob = new Blob([question.svg], { type: "image/svg+xml;charset=utf-8" });
            const svgUrl = URL.createObjectURL(svgBlob);

            // Create an image from SVG
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = svgUrl;
            });

            // Draw to canvas and get as PNG data URL
            const canvas = document.createElement("canvas");
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, 200, 200);
              ctx.drawImage(img, 0, 0, 200, 200);
              const pngDataUrl = canvas.toDataURL("image/png");

              // Check if we need a new page for the image
              if (yPosition > pageHeight - 70) {
                pdf.addPage();
                yPosition = margin;
              }

              // Add image to PDF (centered) - 30% larger than base size
              const imgWidth = 65; // mm (50 * 1.3)
              const imgHeight = 65; // mm (50 * 1.3)
              const imgX = (pageWidth - imgWidth) / 2;
              pdf.addImage(pngDataUrl, "PNG", imgX, yPosition, imgWidth, imgHeight);
              yPosition += imgHeight + 5;
            }

            URL.revokeObjectURL(svgUrl);
          } catch (svgError) {
            console.error("Error rendering SVG to PDF:", svgError);
          }
        }

        // Render clipart if present (scalable icon next to question number)
        if (question.clipartUrl) {
          try {
            const clipImg = new Image();
            await new Promise<void>((resolve, reject) => {
              clipImg.onload = () => resolve();
              clipImg.onerror = reject;
              clipImg.crossOrigin = "anonymous";
              clipImg.src = question.clipartUrl!;
            });

            const canvas = document.createElement("canvas");
            canvas.width = clipImg.width || 100;
            canvas.height = clipImg.height || 100;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "white";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(clipImg, 0, 0);
              const pngDataUrl = canvas.toDataURL("image/png");

              // Add clipart icon with user-configured size at right margin
              const clipartSizeMm = clipartSize;
              pdf.addImage(
                pngDataUrl,
                "PNG",
                pageWidth - margin - clipartSizeMm,
                yPosition - clipartSizeMm * 0.75,
                clipartSizeMm,
                clipartSizeMm,
              );
            }
          } catch (clipError) {
            console.error("Error rendering clipart to PDF:", clipError);
          }
        }

        // AI-Optimized Work Area with bounded zones
        if (showAnswerLines) {
          // Check if we have enough space for the work area box (needs ~70mm)
          if (yPosition > pageHeight - 75) {
            pdf.addPage();
            yPosition = margin;
          }

          const boxMarginLeft = margin + 5;
          const boxWidth = contentWidth - 5;
          const workAreaHeight = 35; // mm for work area
          const answerAreaHeight = 12; // mm for answer box
          const totalBoxHeight = workAreaHeight + answerAreaHeight + 10;

          // Main container border (navy blue)
          pdf.setDrawColor(30, 58, 95); // #1e3a5f
          pdf.setLineWidth(0.8);
          pdf.rect(boxMarginLeft, yPosition, boxWidth, totalBoxHeight);

          // Work Area Section background
          pdf.setFillColor(248, 250, 252); // #f8fafc light gray
          pdf.rect(boxMarginLeft, yPosition, boxWidth, workAreaHeight + 8, "F");

          // Work Area label
          pdf.setFillColor(224, 242, 254); // #e0f2fe light blue
          pdf.roundedRect(boxMarginLeft + 3, yPosition + 2, 32, 5, 1, 1, "F");
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 58, 95);
          pdf.text(`WORK AREA Q${question.questionNumber}`, boxMarginLeft + 5, yPosition + 5.5);

          // Instructions text
          pdf.setFontSize(6);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100, 116, 139); // #64748b
          pdf.text("Show all calculations & reasoning here", boxMarginLeft + boxWidth - 45, yPosition + 5.5);

          // Dashed separator line between work and answer areas
          pdf.setDrawColor(148, 163, 184); // #94a3b8
          pdf.setLineWidth(0.3);
          pdf.setLineDashPattern([2, 2], 0);
          pdf.line(
            boxMarginLeft,
            yPosition + workAreaHeight + 7,
            boxMarginLeft + boxWidth,
            yPosition + workAreaHeight + 7,
          );
          pdf.setLineDashPattern([], 0); // Reset dash pattern

          // Work area lines
          pdf.setDrawColor(203, 213, 225); // #cbd5e1
          pdf.setLineWidth(0.15);
          for (let i = 0; i < 4; i++) {
            pdf.line(boxMarginLeft + 3, yPosition + 10 + i * 7, boxMarginLeft + boxWidth - 3, yPosition + 10 + i * 7);
          }

          // Corner markers for AI zone detection
          pdf.setDrawColor(30, 58, 95);
          pdf.setLineWidth(0.5);
          // Top-left corner
          pdf.line(boxMarginLeft + 2, yPosition + 8, boxMarginLeft + 2, yPosition + 12);
          pdf.line(boxMarginLeft + 2, yPosition + 8, boxMarginLeft + 6, yPosition + 8);
          // Top-right corner
          pdf.line(boxMarginLeft + boxWidth - 2, yPosition + 8, boxMarginLeft + boxWidth - 2, yPosition + 12);
          pdf.line(boxMarginLeft + boxWidth - 2, yPosition + 8, boxMarginLeft + boxWidth - 6, yPosition + 8);

          // Final Answer Section background (yellow/amber)
          pdf.setFillColor(254, 243, 199); // #fef3c7
          pdf.rect(boxMarginLeft, yPosition + workAreaHeight + 8, boxWidth, answerAreaHeight, "F");

          // Answer section top border (amber)
          pdf.setDrawColor(245, 158, 11); // #f59e0b
          pdf.setLineWidth(0.5);
          pdf.line(
            boxMarginLeft,
            yPosition + workAreaHeight + 8,
            boxMarginLeft + boxWidth,
            yPosition + workAreaHeight + 8,
          );

          // Final Answer label
          pdf.setFillColor(253, 230, 138); // #fde68a
          pdf.roundedRect(boxMarginLeft + 3, yPosition + workAreaHeight + 10, 22, 5, 1, 1, "F");
          pdf.setDrawColor(245, 158, 11);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(boxMarginLeft + 3, yPosition + workAreaHeight + 10, 22, 5, 1, 1, "S");
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(146, 64, 14); // #92400e
          pdf.text("FINAL ANSWER", boxMarginLeft + 5, yPosition + workAreaHeight + 13.5);

          // Answer line
          pdf.setDrawColor(217, 119, 6); // #d97706
          pdf.setLineWidth(0.4);
          pdf.line(
            boxMarginLeft + 28,
            yPosition + workAreaHeight + 15,
            boxMarginLeft + boxWidth - 5,
            yPosition + workAreaHeight + 15,
          );

          pdf.setTextColor(0); // Reset text color
          yPosition += totalBoxHeight + 8;
        } else {
          yPosition += 15;
        }
      }

      // Formula Reference Sheet
      if (includeFormulaSheet) {
        const relevantFormulas = getFormulasForTopics(
          selectedQuestions.map((q) => ({ category: q.category, topicName: q.topicName })),
        );

        if (relevantFormulas.length > 0) {
          pdf.addPage();
          yPosition = margin;

          // Formula sheet header
          pdf.setFontSize(16);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(0);
          pdf.text("Formula Reference Sheet", pageWidth / 2, yPosition, { align: "center" });
          yPosition += 12;

          pdf.setFontSize(10);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100);
          pdf.text("Based on selected topics", pageWidth / 2, yPosition, { align: "center" });
          pdf.setTextColor(0);
          yPosition += 10;

          pdf.setLineWidth(0.5);
          pdf.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 8;

          // Render each formula category
          for (const category of relevantFormulas) {
            // Check if we need a new page
            if (yPosition > pageHeight - 60) {
              pdf.addPage();
              yPosition = margin;
            }

            // Category header
            pdf.setFontSize(11);
            pdf.setFont("helvetica", "bold");
            pdf.text(sanitizeForPDF(category.category), margin, yPosition);
            yPosition += 7;

            // Formulas in this category
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "normal");

            for (const formula of category.formulas) {
              if (yPosition > pageHeight - 30) {
                pdf.addPage();
                yPosition = margin;
              }

              // Formula name and formula - sanitize for PDF
              const formulaLine = sanitizeForPDF(`• ${formula.name}: ${formula.formula}`);
              const lines = pdf.splitTextToSize(formulaLine, contentWidth - 10);

              lines.forEach((line: string) => {
                pdf.text(line, margin + 5, yPosition);
                yPosition += 5;
              });

              // Description if present
              if (formula.description) {
                pdf.setFontSize(9);
                pdf.setTextColor(100);
                pdf.text(sanitizeForPDF(`  (${formula.description})`), margin + 10, yPosition);
                pdf.setTextColor(0);
                pdf.setFontSize(10);
                yPosition += 5;
              }

              yPosition += 2;
            }

            yPosition += 5;
          }
        }
      }

      // Answer Key Section (for teachers)
      if (includeAnswerKey && compiledQuestions.some((q) => q.answer)) {
        pdf.addPage();
        yPosition = margin;

        // Answer key header
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0);
        pdf.text("ANSWER KEY", pageWidth / 2, yPosition, { align: "center" });
        yPosition += 8;

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.text(sanitizeForPDF(worksheetTitle), pageWidth / 2, yPosition, { align: "center" });
        yPosition += 10;

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "italic");
        pdf.setTextColor(100);
        pdf.text("FOR TEACHER USE ONLY", pageWidth / 2, yPosition, { align: "center" });
        pdf.setTextColor(0);
        yPosition += 10;

        pdf.setLineWidth(0.5);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;

        // Render each answer
        for (const question of compiledQuestions) {
          if (!question.answer) continue;

          // Check if we need a new page
          if (yPosition > pageHeight - 50) {
            pdf.addPage();
            yPosition = margin;
          }

          // Question number and brief question text
          pdf.setFontSize(11);
          pdf.setFont("helvetica", "bold");
          pdf.text(`Question ${question.questionNumber}:`, margin, yPosition);
          yPosition += 6;

          // Topic reference
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(100);
          pdf.text(sanitizeForPDF(`${question.topic} (${question.standard})`), margin + 5, yPosition);
          pdf.setTextColor(0);
          yPosition += 7;

          // Answer
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          const answerLines = pdf.splitTextToSize(sanitizeForPDF(`Answer: ${question.answer}`), contentWidth - 10);

          answerLines.forEach((line: string) => {
            if (yPosition > pageHeight - 20) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(line, margin + 5, yPosition);
            yPosition += 5;
          });

          yPosition += 8;

          // Separator line
          pdf.setDrawColor(200);
          pdf.setLineWidth(0.2);
          pdf.line(margin + 5, yPosition - 3, pageWidth - margin - 5, yPosition - 3);
        }
      }

      if (includeScrapPaper) {
        const problemNumbers = compiledQuestions.map((q) => q.questionNumber);
        const zonesPerPage = scrapPaperLayout === "single" ? 1 : scrapPaperLayout === "split-2" ? 2 : 4;
        const pagesNeeded = Math.ceil(problemNumbers.length / zonesPerPage);

        let problemIndex = 0;

        for (let page = 0; page < pagesNeeded; page++) {
          pdf.addPage();
          let yPos = margin;

          // Scrap Paper Header
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 58, 95);
          pdf.text(sanitizeForPDF(`${worksheetTitle} - Scrap Paper`), pageWidth / 2, yPos, { align: "center" });
          yPos += 6;

          // Subheader
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Page ${page + 1} of ${pagesNeeded} | AI-Optimized Work Zones`, pageWidth / 2, yPos, {
            align: "center",
          });
          yPos += 4;

          // Name/Date line
          pdf.setFontSize(10);
          pdf.setTextColor(0);
          pdf.text("Name: _______________________", margin, yPos);
          pdf.text("Date: ___________", pageWidth - margin - 40, yPos);
          yPos += 8;

          // Instructions banner
          pdf.setFillColor(236, 253, 245);
          pdf.setDrawColor(110, 231, 183);
          pdf.roundedRect(margin, yPos, contentWidth, 8, 2, 2, "FD");
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(4, 120, 87);
          pdf.text("[!] INSTRUCTIONS:", margin + 3, yPos + 5);
          pdf.setFont("helvetica", "normal");
          pdf.text(
            "Keep all work within the designated zones for AI scanning. Write clearly and stay inside the boxes.",
            margin + 30,
            yPos + 5,
          );
          yPos += 12;

          const availableHeight = pageHeight - yPos - margin;

          // Draw work zones based on layout
          if (scrapPaperLayout === "single") {
            const zoneHeight = availableHeight;
            const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
            drawScrapWorkZone(pdf, margin, yPos, contentWidth, zoneHeight, problemNum);
            problemIndex++;
          } else if (scrapPaperLayout === "split-2") {
            const zoneHeight = (availableHeight - 5) / 2;
            for (let i = 0; i < 2 && problemIndex < problemNumbers.length; i++) {
              const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
              drawScrapWorkZone(pdf, margin, yPos + i * (zoneHeight + 5), contentWidth, zoneHeight, problemNum);
              problemIndex++;
            }
          } else if (scrapPaperLayout === "split-4") {
            const zoneWidth = (contentWidth - 5) / 2;
            const zoneHeight = (availableHeight - 5) / 2;
            for (let row = 0; row < 2; row++) {
              for (let col = 0; col < 2 && problemIndex < problemNumbers.length; col++) {
                const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
                const x = margin + col * (zoneWidth + 5);
                const y = yPos + row * (zoneHeight + 5);
                drawScrapWorkZone(pdf, x, y, zoneWidth, zoneHeight, problemNum);
                problemIndex++;
              }
            }
          }
        }
      }

      // Footer on last page
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text("Generated with NYCLogic Ai - NYS Regents Aligned", pageWidth / 2, pageHeight - 10, { align: "center" });

      // Download
      pdf.save(`${worksheetTitle.replace(/\s+/g, "_")}.pdf`);

      toast({
        title: "Worksheet downloaded!",
        description: `Your worksheet with ${compiledQuestions.length} question(s)${includeScrapPaper ? " and scrap paper" : ""} has been saved.`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate worksheet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate Word document (.docx)
  const generateWordDocument = async () => {
    if (compiledQuestions.length === 0) {
      toast({
        title: "No questions compiled",
        description: "Please compile the worksheet first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const children: (Paragraph | Table)[] = [];

      // Generate QR code for worksheet identification - appears on EVERY page
      // IMPORTANT: QR code is positioned in TOP-LEFT for reliable scanner detection
      // Scanners typically scan left-to-right, top-to-bottom, so top-left is detected first
      let qrCodeBuffer: ArrayBuffer | null = null;
      const worksheetId = `ws_${Date.now().toString(36)}`;
      try {
        const { fetchWorksheetQRCodeAsArrayBuffer } = await import('@/lib/qrCodeUtils');
        // Generate a worksheet-level QR code with a unique ID (100px for reliable scanning)
        qrCodeBuffer = await fetchWorksheetQRCodeAsArrayBuffer(worksheetId);
      } catch (qrError) {
        console.error('Error generating QR code for Word document:', qrError);
      }

      // Create page header with QR codes on BOTH LEFT and RIGHT corners for reliable scanning
      // This ensures QR code is detected regardless of paper orientation when scanned
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
                    // LEFT QR Code cell
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new ImageRun({
                              data: qrCodeBuffer,
                              transformation: { width: 70, height: 70 },
                              type: "png",
                            }),
                          ],
                          alignment: AlignmentType.LEFT,
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: "📷 Scan", size: 12, color: "666666", italics: true }),
                          ],
                          alignment: AlignmentType.LEFT,
                        }),
                      ],
                      width: { size: 15, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.TOP,
                      borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      },
                    }),
                    // CENTER Title cell
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: worksheetTitle,
                              bold: true,
                              size: 28, // 14pt in header
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
                    // RIGHT QR Code cell (mirror of left for reliable detection)
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new ImageRun({
                              data: qrCodeBuffer,
                              transformation: { width: 70, height: 70 },
                              type: "png",
                            }),
                          ],
                          alignment: AlignmentType.RIGHT,
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: "📷 Scan", size: 12, color: "666666", italics: true }),
                          ],
                          alignment: AlignmentType.RIGHT,
                        }),
                      ],
                      width: { size: 15, type: WidthType.PERCENTAGE },
                      verticalAlign: VerticalAlign.TOP,
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

      // Main document title (larger, on first page content area)
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: worksheetTitle,
              bold: true,
              size: 36, // 18pt
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
      );

      if (teacherName) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Teacher: ${teacherName}`,
                size: 24, // 12pt
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 150 },
          }),
        );
      }

      // Student info line
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Name: _______________________   Date: ___________   Period: _____", size: 22 }),
          ],
          spacing: { before: 200, after: 100 },
        }),
      );

      // Worksheet Created date & tracking ID
      const wordCreatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const wordTrackingId = 'WS-' + worksheetId.slice(-6).toUpperCase();
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Worksheet Created: ${wordCreatedDate}`, size: 16, color: "999999" }),
            new TextRun({ text: `          ID: ${wordTrackingId}`, size: 16, color: "999999" }),
          ],
          spacing: { after: 300 },
        }),
      );

      // Separator
      children.push(
        new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
          },
          spacing: { after: 300 },
        }),
      );

      // Questions
      for (const question of compiledQuestions) {
        const sanitizedQuestion = sanitizeForWord(question.question);
        const difficultyText = question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1);
        const bloomLabel = question.bloomLevel
          ? question.bloomLevel.charAt(0).toUpperCase() + question.bloomLevel.slice(1)
          : "";

        const headerParts: string[] = [`${question.questionNumber}.`];
        if (bloomLabel) {
          headerParts.push(`[${bloomLabel}${question.bloomVerb ? `: ${question.bloomVerb}` : ""}]`);
        }
        if (worksheetMode === "diagnostic" && question.advancementLevel) {
          headerParts.push(`[Level ${question.advancementLevel}]`);
        }
        headerParts.push(`[${difficultyText}]`);

        // Question header
        children.push(
          new Paragraph({
            children: [new TextRun({ text: headerParts.join(" "), bold: true, size: 22 })],
            spacing: { before: 200, after: 100 },
          }),
        );

        // Topic and standard
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${question.topic} (${question.standard})`,
                size: 18,
                italics: true,
                color: "666666",
              }),
            ],
            spacing: { after: 100 },
          }),
        );

        // Question text
        children.push(
          new Paragraph({
            children: [new TextRun({ text: sanitizedQuestion, size: 20 })],
            spacing: { after: 150 },
          }),
        );

        // Add image/diagram if available (imageUrl, svg, or generate from imagePrompt)
        if (question.imageUrl || question.svg || question.imagePrompt) {
          try {
            let imageData = "";

            // Priority 1: Use imageUrl if available
            if (question.imageUrl) {
              // Check if it's an SVG that needs conversion to PNG for Word compatibility
              const isSvg =
                question.imageUrl.startsWith("data:image/svg") ||
                question.imageUrl.startsWith("<svg") ||
                question.imageUrl.includes('xmlns="http://www.w3.org/2000/svg"');
              if (isSvg) {
                try {
                  imageData = await svgToPngDataUrl(question.imageUrl, 300, 300);
                } catch (svgErr) {
                  console.error("Error converting SVG URL to PNG for Word:", svgErr);
                }
              } else if (
                question.imageUrl.startsWith("data:image/png") ||
                question.imageUrl.startsWith("data:image/jpeg")
              ) {
                // Already PNG/JPEG data URL - use directly
                imageData = question.imageUrl;
              } else if (question.imageUrl.startsWith("http")) {
                // External URL - try to fetch and convert via canvas to ensure PNG format
                try {
                  imageData = await svgToPngDataUrl(question.imageUrl, 300, 300);
                } catch (fetchErr) {
                  console.error("Error fetching external image for Word:", fetchErr);
                  imageData = question.imageUrl; // Fallback to URL
                }
              } else {
                imageData = question.imageUrl;
              }
            }

            // Priority 2: Convert SVG string to PNG if available
            if (!imageData && question.svg) {
              try {
                imageData = await svgToPngDataUrl(question.svg, 300, 300);
              } catch (svgErr) {
                console.error("Error converting SVG to PNG for Word:", svgErr);
              }
            }

            // Priority 3: Generate from imagePrompt on-demand
            if (!imageData && question.imagePrompt) {
              try {
                console.log("Generating diagram for Word doc:", question.imagePrompt.substring(0, 50));
                const { data: genData, error: genError } = await supabase.functions.invoke("generate-diagram-images", {
                  body: {
                    questions: [{ questionNumber: question.questionNumber, imagePrompt: question.imagePrompt }],
                    useNanoBanana: false, // Use simple B&W SVG for worksheets (faster, more reliable)
                    preferDeterministicSVG: true,
                  },
                });

                if (genError) {
                  console.error("Edge function error:", genError);
                } else {
                  const generatedUrl = genData?.results?.[0]?.imageUrl || "";
                  console.log("Generated image URL type:", generatedUrl.substring(0, 30));

                  if (generatedUrl) {
                    // Check if it's SVG and needs conversion
                    const isGenSvg =
                      generatedUrl.startsWith("data:image/svg") ||
                      generatedUrl.startsWith("<svg") ||
                      generatedUrl.includes('xmlns="http://www.w3.org/2000/svg"');
                    if (isGenSvg) {
                      imageData = await svgToPngDataUrl(generatedUrl, 300, 300);
                    } else {
                      // Already PNG/JPEG - use directly
                      imageData = generatedUrl;
                    }
                  }
                }
              } catch (genError) {
                console.error("Error generating diagram on-demand for Word:", genError);
              }
            }

            // Embed the image if we have data
            if (imageData) {
              const imageBuffer = await fetchImageAsArrayBuffer(imageData);
              if (imageBuffer) {
                // Add diagram label
                children.push(
                  new Paragraph({
                    children: [new TextRun({ text: "📐 Diagram", size: 16, color: "2563EB", italics: true })],
                    spacing: { before: 50, after: 50 },
                  }),
                );

                // Add the image - using user-configured size
                const imageSizePx = Math.round(imageSize * 0.75); // Scale appropriately for Word
                children.push(
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: imageBuffer,
                        transformation: {
                          width: imageSizePx,
                          height: imageSizePx,
                        },
                        type: "png",
                      }),
                    ],
                    spacing: { before: 50, after: 100 },
                  }),
                );
              }
            }
          } catch (imgError) {
            console.error("Error adding image to Word document:", imgError);
          }
        }

        // Add clipart if available
        if (question.clipartUrl) {
          try {
            const clipartBuffer = await fetchImageAsArrayBuffer(question.clipartUrl);
            if (clipartBuffer) {
              children.push(
                new Paragraph({
                  children: [
                    new ImageRun({
                      data: clipartBuffer,
                      transformation: {
                        width: 60,
                        height: 60,
                      },
                      type: "png",
                    }),
                  ],
                  spacing: { before: 50, after: 50 },
                }),
              );
            }
          } catch (clipartError) {
            console.error("Error adding clipart to Word document:", clipartError);
          }
        }

        // Work area box (simplified for Word)
        if (showAnswerLines) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "WORK AREA:", bold: true, size: 14, color: "1e3a5f" })],
              border: {
                top: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                left: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                right: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
              },
              shading: { fill: "F8FAFC" },
              spacing: { before: 100 },
            }),
          );

          // Empty work area lines
          for (let i = 0; i < 4; i++) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: "" })],
                border: {
                  left: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                  right: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                },
                shading: { fill: "F8FAFC" },
              }),
            );
          }

          // Answer section
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "FINAL ANSWER: ", bold: true, size: 18, color: "92400E" }),
                new TextRun({ text: "________________________________", size: 18 }),
              ],
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                left: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
                right: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" },
              },
              shading: { fill: "FEF3C7" },
              spacing: { after: 300 },
            }),
          );
        }
      }

      // Footer
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Generated with NYCLogic Ai - NYS Regents Aligned",
              size: 16,
              italics: true,
              color: "999999",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
      );

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertInchesToTwip(marginMm / 25.4 + 0.5), // Extra top margin for header
                  bottom: convertInchesToTwip(marginMm / 25.4),
                  left: convertInchesToTwip(marginMm / 25.4),
                  right: convertInchesToTwip(marginMm / 25.4),
                },
              },
            },
            headers: pageHeader ? { default: pageHeader } : undefined,
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${worksheetTitle.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Word document downloaded!",
        description: `Your worksheet with ${compiledQuestions.length} question(s) has been saved as .docx.`,
      });
    } catch (error) {
      console.error("Error generating Word document:", error);
      toast({
        title: "Error",
        description: "Failed to generate Word document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (compiledQuestions.length === 0) {
      toast({
        title: "No questions compiled",
        description: "Please compile the worksheet first.",
        variant: "destructive",
      });
      return;
    }
    window.print();
  };

  const handlePreview = () => {
    if (compiledQuestions.length === 0) {
      toast({
        title: "No questions compiled",
        description: "Please compile the worksheet first.",
        variant: "destructive",
      });
      return;
    }
    // Reset preview state and show HTML by default
    setPreviewFormat("html");
    setPdfPreviewUrl(null);
    setWordPreviewUrl(null);
    setShowPreview(true);
  };

  // Generate Word document for preview (returns blob URL)
  const generateWordPreview = async (): Promise<string | null> => {
    if (compiledQuestions.length === 0) return null;
    
    setIsGeneratingPreview(true);
    try {
      const children: (Paragraph | Table)[] = [];

      // Title
      children.push(
        new Paragraph({
          text: worksheetTitle,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: worksheetTitle, bold: true, size: 32 })],
        })
      );

      // Teacher name
      if (teacherName) {
        children.push(
          new Paragraph({
            text: `Teacher: ${teacherName}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }

      // Name/Date/Period line
      children.push(
        new Paragraph({
          spacing: { after: 400 },
          border: { bottom: { color: "auto", style: BorderStyle.SINGLE, size: 6 } },
          children: [
            new TextRun({ text: "Name: _______________________     Date: ___________     Period: _____" }),
          ],
        })
      );

      // Questions
      for (const question of compiledQuestions) {
        // Question header with Bloom's level
        const bloomInfo = getBloomInfo(question.bloomLevel);
        const levelLabel = worksheetMode === "diagnostic" && question.advancementLevel 
          ? ` [Level ${question.advancementLevel}]` 
          : "";
        
        children.push(
          new Paragraph({
            spacing: { before: 300, after: 100 },
            border: { bottom: { color: "1e3a5f", style: BorderStyle.SINGLE, size: 2 } },
            children: [
              new TextRun({
                text: `${question.questionNumber}. [${bloomInfo.label}: ${question.bloomVerb || "apply"}]${levelLabel} `,
                bold: true,
                size: 22,
              }),
              new TextRun({
                text: `[${question.difficulty}]`,
                size: 18,
                color: "666666",
              }),
            ],
          })
        );

        // Topic/Standard
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `${question.topic} (${question.standard})`,
                italics: true,
                size: 18,
                color: "666666",
              }),
            ],
          })
        );

        // Question text
        const sanitizedQuestion = sanitizeForWord(fixEncodingCorruption(question.question));
        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: sanitizedQuestion, size: 22 })],
          })
        );

        // Work area box
        if (showAnswerLines) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: `WORK AREA Q${question.questionNumber}`, bold: true, size: 16 })],
                        }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "" }),
                      ],
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                        bottom: { style: BorderStyle.DASHED, size: 4, color: "94a3b8" },
                        left: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                        right: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                      },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: "FINAL ANSWER: _________________________________", bold: true, size: 18 })],
                        }),
                      ],
                      shading: { fill: "fef3c7" },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: "f59e0b" },
                        bottom: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                        left: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                        right: { style: BorderStyle.SINGLE, size: 8, color: "1e3a5f" },
                      },
                    }),
                  ],
                }),
              ],
            })
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertInchesToTwip(marginMm / 25.4),
                  bottom: convertInchesToTwip(marginMm / 25.4),
                  left: convertInchesToTwip(marginMm / 25.4),
                  right: convertInchesToTwip(marginMm / 25.4),
                },
              },
            },
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      return url;
    } catch (error) {
      console.error("Error generating Word preview:", error);
      toast({
        title: "Error",
        description: "Failed to generate Word preview.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Generate PDF for preview (returns blob URL)
  const generatePdfPreview = async (): Promise<string | null> => {
    const printContent = printRef.current;
    if (!printContent) return null;

    setIsGeneratingPreview(true);
    try {
      const canvas = await html2canvas(printContent, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "letter");
      const pageWidth = 215.9;
      const pageHeight = 279.4;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      return url;
    } catch (error) {
      console.error("Error generating PDF preview:", error);
      return null;
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Handle format change in preview
  const handlePreviewFormatChange = async (format: "html" | "pdf" | "word") => {
    setPreviewFormat(format);
    
    if (format === "word" && !wordPreviewUrl) {
      const url = await generateWordPreview();
      if (url) setWordPreviewUrl(url);
    } else if (format === "pdf" && !pdfPreviewUrl) {
      const url = await generatePdfPreview();
      if (url) setPdfPreviewUrl(url);
    }
  };

  /**
   * Generate PDF from the preview content using html2canvas.
   * This captures exactly what the user sees in the preview (WYSIWYG).
   * All Unicode symbols, special characters, and formatting are preserved.
   */
  /**
   * Generate WYSIWYG PDF from the preview modal with intelligent page break handling.
   * Captures the actual preview content but organizes it into pages that don't cut content mid-section.
   */
  const generateWYSIWYGPdf = async () => {
    const printContent = printRef.current;
    if (!printContent) {
      toast({
        title: "Error",
        description: "Could not find preview content to export.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPDF(true);
    toast({
      title: "Generating PDF...",
      description: "Creating optimized PDF with intelligent page breaks. Please wait.",
    });

    try {
      // Page dimensions at 96 DPI
      const pageWidthPx = 816; // 8.5in at 96 DPI
      const pageHeightPx = 1056; // 11in at 96 DPI
      const marginPx = marginIn * 96; // Convert margin from inches to pixels
      const usableHeight = pageHeightPx - marginPx * 2; // Height available for content per page
      const scale = 2; // 2x scale for better quality

      // Get the actual content element (the print-worksheet div)
      const worksheetContent = printContent.querySelector(".print-worksheet") as HTMLElement;
      if (!worksheetContent) {
        throw new Error("Worksheet content not found");
      }

      // Create temporary container for measuring and rendering
      const tempContainer = document.createElement("div");
      tempContainer.style.cssText = `
        position: absolute;
        left: -10000px;
        top: 0;
        width: ${pageWidthPx}px;
        background: white;
      `;
      document.body.appendChild(tempContainer);

      // Clone the content to manipulate without affecting the preview
      const clonedContent = worksheetContent.cloneNode(true) as HTMLElement;
      clonedContent.style.transform = "none";
      clonedContent.style.width = `${pageWidthPx}px`;
      clonedContent.style.maxWidth = `${pageWidthPx}px`;
      clonedContent.style.boxShadow = "none";
      clonedContent.style.border = "none";

      // Find all the logical content sections in the cloned content
      // Look for: header area, question blocks, formula reference sheet, answer key
      interface ContentBlock {
        element: HTMLElement;
        type: "header" | "question" | "formula-sheet" | "answer-key" | "other";
        height: number;
        forceNewPage: boolean;
      }

      const blocks: ContentBlock[] = [];

      // Temporarily add to DOM for measurement
      tempContainer.appendChild(clonedContent);

      // Identify content blocks by looking at the structure
      const children = Array.from(clonedContent.children) as HTMLElement[];

      for (const child of children) {
        // Detect section type by content
        const text = child.textContent?.toLowerCase() || "";
        const isFormulaSheet = text.includes("formula reference sheet");
        const isAnswerKey = text.includes("answer key") && text.includes("for teacher use only");

        // Check if this is a question block (has work area or question number pattern)
        const hasWorkArea =
          child.querySelector('[class*="work-area"]') ||
          child.innerHTML.includes("Work Area Q") ||
          /\d+\.\s*\[/.test(child.textContent || "");

        let blockType: ContentBlock["type"] = "other";
        let forceNewPage = false;

        if (isFormulaSheet) {
          blockType = "formula-sheet";
          forceNewPage = true;
        } else if (isAnswerKey) {
          blockType = "answer-key";
          forceNewPage = true;
        } else if (hasWorkArea) {
          blockType = "question";
        }

        blocks.push({
          element: child,
          type: blockType,
          height: child.offsetHeight,
          forceNewPage,
        });
      }

      // Organize blocks into pages with intelligent breaks
      interface PageContent {
        blocks: ContentBlock[];
        totalHeight: number;
      }

      const pages: PageContent[] = [];
      let currentPage: PageContent = { blocks: [], totalHeight: 0 };

      for (const block of blocks) {
        // If block forces a new page AND we have content on current page, start new page
        if (block.forceNewPage && currentPage.blocks.length > 0) {
          pages.push(currentPage);
          currentPage = { blocks: [], totalHeight: 0 };
        }

        // Check if block fits on current page
        const wouldExceed = currentPage.totalHeight + block.height > usableHeight;

        if (wouldExceed && currentPage.blocks.length > 0) {
          // Block doesn't fit, start new page
          pages.push(currentPage);
          currentPage = { blocks: [], totalHeight: 0 };
        }

        // Add block to current page
        currentPage.blocks.push(block);
        currentPage.totalHeight += block.height;
      }

      // Don't forget the last page
      if (currentPage.blocks.length > 0) {
        pages.push(currentPage);
      }

      // Create PDF with letter size
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [pageWidthPx, pageHeightPx],
        hotfixes: ["px_scaling"],
      });

      // Render each page
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        if (pageIndex > 0) {
          pdf.addPage();
        }

        const page = pages[pageIndex];

        // Create a container for this page's content
        const pageContent = document.createElement("div");
        pageContent.style.cssText = `
          background-color: white;
          padding: ${marginPx}px;
          box-sizing: border-box;
          width: ${pageWidthPx}px;
          min-height: ${pageHeightPx}px;
          font-family: 'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif;
        `;

        // Add all blocks for this page
        for (const block of page.blocks) {
          const clonedBlock = block.element.cloneNode(true) as HTMLElement;
          pageContent.appendChild(clonedBlock);
        }

        // Temporarily add to DOM for rendering
        tempContainer.innerHTML = "";
        tempContainer.appendChild(pageContent);

        // Capture with html2canvas
        const canvas = await html2canvas(pageContent, {
          scale: scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: pageWidthPx,
          height: pageHeightPx,
          windowWidth: pageWidthPx,
          windowHeight: pageHeightPx,
        });

        // Add canvas to PDF
        const imgData = canvas.toDataURL("image/png", 1.0);
        pdf.addImage(imgData, "PNG", 0, 0, pageWidthPx, pageHeightPx, undefined, "FAST");
      }

      // Clean up
      document.body.removeChild(tempContainer);

      // Add Scrap Paper Pages if enabled
      let scrapPaperPagesCount = 0;

      if (includeScrapPaper) {
        // Convert pixel dimensions to mm for jsPDF drawing operations
        const pageWidthMm = 215.9; // 8.5 inches in mm
        const pageHeightMm = 279.4; // 11 inches in mm
        const marginMm = marginIn * 25.4; // Convert margin from inches to mm
        const contentWidthMm = pageWidthMm - marginMm * 2;

        const problemNumbers = compiledQuestions.map((q) => q.questionNumber);
        const zonesPerPage = scrapPaperLayout === "single" ? 1 : scrapPaperLayout === "split-2" ? 2 : 4;
        const pagesNeeded = Math.ceil(problemNumbers.length / zonesPerPage);
        scrapPaperPagesCount = pagesNeeded;

        let problemIndex = 0;

        for (let page = 0; page < pagesNeeded; page++) {
          pdf.addPage([pageWidthPx, pageHeightPx]);

          // Set white background
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pageWidthPx, pageHeightPx, "F");

          // Convert mm positions to pixels (96 DPI)
          const mmToPx = 96 / 25.4;
          const margin = marginMm * mmToPx;
          const contentWidth = contentWidthMm * mmToPx;

          let yPos = margin;

          // Scrap Paper Header
          pdf.setFontSize(14);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(30, 58, 95);
          pdf.text(`${worksheetTitle} - Scrap Paper`, pageWidthPx / 2, yPos, { align: "center" });
          yPos += 20;

          // Subheader
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Page ${page + 1} of ${pagesNeeded} | AI-Optimized Work Zones`, pageWidthPx / 2, yPos, {
            align: "center",
          });
          yPos += 15;

          // Name/Date line
          pdf.setFontSize(10);
          pdf.setTextColor(0);
          pdf.text("Name: _______________________", margin, yPos);
          pdf.text("Date: ___________", pageWidthPx - margin - 120, yPos);
          yPos += 25;

          // Instructions banner
          pdf.setFillColor(236, 253, 245);
          pdf.setDrawColor(110, 231, 183);
          pdf.roundedRect(margin, yPos, contentWidth, 25, 3, 3, "FD");
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(4, 120, 87);
          pdf.text("[!] INSTRUCTIONS:", margin + 10, yPos + 16);
          pdf.setFont("helvetica", "normal");
          pdf.text(
            "Keep all work within the designated zones for AI scanning. Write clearly and stay inside the boxes.",
            margin + 120,
            yPos + 16,
          );
          yPos += 35;

          const availableHeight = pageHeightPx - yPos - margin;

          // Draw work zones based on layout (using pixel-based function)
          if (scrapPaperLayout === "single") {
            const zoneHeight = availableHeight;
            const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
            drawScrapWorkZonePx(pdf, margin, yPos, contentWidth, zoneHeight, problemNum);
            problemIndex++;
          } else if (scrapPaperLayout === "split-2") {
            const zoneHeight = (availableHeight - 15) / 2;
            for (let i = 0; i < 2 && problemIndex < problemNumbers.length; i++) {
              const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
              drawScrapWorkZonePx(pdf, margin, yPos + i * (zoneHeight + 15), contentWidth, zoneHeight, problemNum);
              problemIndex++;
            }
          } else if (scrapPaperLayout === "split-4") {
            const zoneWidth = (contentWidth - 15) / 2;
            const zoneHeight = (availableHeight - 15) / 2;
            for (let row = 0; row < 2; row++) {
              for (let col = 0; col < 2 && problemIndex < problemNumbers.length; col++) {
                const problemNum = problemNumbers[problemIndex] || problemIndex + 1;
                const x = margin + col * (zoneWidth + 15);
                const y = yPos + row * (zoneHeight + 15);
                drawScrapWorkZonePx(pdf, x, y, zoneWidth, zoneHeight, problemNum);
                problemIndex++;
              }
            }
          }
        }
      }

      // Download the PDF
      const fileName = `${worksheetTitle.replace(/[^a-z0-9]/gi, "_")}_worksheet.pdf`;
      pdf.save(fileName);

      const totalPages = pages.length + scrapPaperPagesCount;
      toast({
        title: "PDF Downloaded!",
        description: `Saved as ${fileName} (${totalPages} page${totalPages > 1 ? "s" : ""}${scrapPaperPagesCount > 0 ? `, including ${scrapPaperPagesCount} scrap paper page${scrapPaperPagesCount > 1 ? "s" : ""}` : ""})`,
      });
    } catch (error) {
      console.error("Error generating WYSIWYG PDF:", error);
      toast({
        title: "PDF Generation Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "hard":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "challenging":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getAdvancementLevelColor = (level: AdvancementLevel) => {
    switch (level) {
      case "A":
        return "bg-green-100 text-green-800 border-green-300";
      case "B":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "C":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "D":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "E":
        return "bg-red-100 text-red-800 border-red-300";
      case "F":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getAdvancementLevelDescription = (level: AdvancementLevel) => {
    switch (level) {
      case "A":
        return "Advanced";
      case "B":
        return "Proficient";
      case "C":
        return "Developing";
      case "D":
        return "Beginning";
      case "E":
        return "Emerging";
      case "F":
        return "Foundational";
      default:
        return "";
    }
  };

  if (selectedQuestions.length === 0 && !isCompiled && !showSavedWorksheets) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg mb-2">Worksheet Builder</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Select topics from the list to add them to your worksheet. Click the + button next to any topic.
          </p>
          <div className="flex flex-col gap-2">
            {onOpenAdaptiveGenerator && (
              <Button onClick={onOpenAdaptiveGenerator} className="bg-purple-600 hover:bg-purple-700">
                <Brain className="h-4 w-4 mr-2" />
                Adaptive Worksheets
              </Button>
            )}
            {savedWorksheets.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowSavedWorksheets(true)}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Load Saved ({savedWorksheets.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showSavedWorksheets) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Saved Worksheets</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSavedWorksheets(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingWorksheets ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedWorksheets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No saved worksheets yet.</p>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {savedWorksheets.map((worksheet) => (
                  <div
                    key={worksheet.id}
                    className="p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{worksheet.title}</p>
                          {worksheet.is_shared && (
                            <Badge variant="outline" className="text-xs">
                              <Link className="h-3 w-3 mr-1" />
                              Shared
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {worksheet.questions.length} questions • {new Date(worksheet.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="sm" onClick={() => loadWorksheet(worksheet)}>
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteWorksheet(worksheet.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Share controls */}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Button
                        variant={worksheet.is_shared ? "secondary" : "outline"}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => toggleShareWorksheet(worksheet)}
                        disabled={isSharing}
                      >
                        <Share2 className="h-3 w-3 mr-1" />
                        {worksheet.is_shared ? "Unshare" : "Share"}
                      </Button>
                      {worksheet.is_shared && worksheet.share_code && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => copyShareLink(worksheet.share_code!, worksheet.id)}
                        >
                          {copiedId === worksheet.id ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Link
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Worksheet Builder</CardTitle>
            <Badge variant="secondary">
              {isCompiled ? `${compiledQuestions.length} questions` : `${selectedQuestions.length} topic(s)`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCompiled ? (
            <>
              {/* Worksheet Type Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">What are you building?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={worksheetMode === "basic_assessment" ? "default" : "outline"}
                    className={`h-auto py-3 flex flex-col items-center gap-1.5 ${
                      worksheetMode === "basic_assessment"
                        ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2"
                        : "hover:bg-muted border-blue-200"
                    }`}
                    onClick={() => {
                      setWorksheetMode("basic_assessment");
                      if (!hasUserEditedTitle) {
                        setWorksheetTitle(
                          selectedQuestions.length > 0
                            ? "Assessment: " + selectedQuestions[0].topicName
                            : "Math Assessment",
                        );
                      }
                    }}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="font-semibold text-xs">Assessment</span>
                    <span className="text-[10px] opacity-80 text-center leading-tight">Equal level for all</span>
                  </Button>
                  <Button
                    type="button"
                    variant={worksheetMode === "diagnostic" ? "default" : "outline"}
                    className={`h-auto py-3 flex flex-col items-center gap-1.5 ${
                      worksheetMode === "diagnostic"
                        ? "bg-purple-600 text-white ring-2 ring-purple-600 ring-offset-2"
                        : "hover:bg-muted border-purple-200"
                    }`}
                    onClick={() => {
                      setWorksheetMode("diagnostic");
                      if (!hasUserEditedTitle) {
                        setWorksheetTitle(
                          selectedQuestions.length > 0
                            ? "Diagnostic: " + selectedQuestions[0].topicName
                            : "Diagnostic Assessment",
                        );
                      }
                    }}
                  >
                    <Sparkles className="h-5 w-5" />
                    <span className="font-semibold text-xs">Diagnostic</span>
                    <span className="text-[10px] opacity-80 text-center leading-tight">Individualized A-F</span>
                  </Button>
                </div>

                {/* Assessment Mode Description */}
                {worksheetMode === "basic_assessment" && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-blue-900">Adaptive Assessment</p>
                        <p className="text-xs text-blue-700">
                          All students receive the same adaptive questions at a consistent difficulty level. Fair for
                          quizzes and tests where everyone is assessed equally.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Diagnostic Mode Description */}
                {worksheetMode === "diagnostic" && (
                  <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-purple-900">Individualized Diagnostic</p>
                        <p className="text-xs text-purple-700">
                          Questions span levels A-F to identify each student's understanding. Use responses to generate
                          personalized follow-up worksheets.
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {["A", "B", "C", "D", "E", "F"].map((level) => (
                            <Badge
                              key={level}
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                level === "A"
                                  ? "bg-green-50 border-green-300 text-green-700"
                                  : level === "B"
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                    : level === "C"
                                      ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                                      : level === "D"
                                        ? "bg-orange-50 border-orange-300 text-orange-700"
                                        : level === "E"
                                          ? "bg-red-50 border-red-300 text-red-700"
                                          : "bg-gray-50 border-gray-300 text-gray-700"
                              }`}
                            >
                              Level {level}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Configuration */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-sm">
                    Worksheet Title
                  </Label>
                  <Input
                    id="title"
                    value={worksheetTitle}
                    onChange={(e) => {
                      setWorksheetTitle(e.target.value);
                      setHasUserEditedTitle(true);
                    }}
                    placeholder="Enter worksheet title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="teacher" className="text-sm">
                    Teacher Name (optional)
                  </Label>
                  <Input
                    id="teacher"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="questionCount" className="text-sm">
                    Number of Questions
                  </Label>
                  <Select value={questionCount} onValueChange={setQuestionCount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 questions</SelectItem>
                      <SelectItem value="5">5 questions</SelectItem>
                      <SelectItem value="8">8 questions</SelectItem>
                      <SelectItem value="10">10 questions</SelectItem>
                      <SelectItem value="15">15 questions</SelectItem>
                      <SelectItem value="20">20 questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Difficulty Levels</Label>
                  <div className="flex flex-wrap gap-2">
                    {["medium", "hard", "challenging"].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => toggleDifficulty(level)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                          difficultyFilter.includes(level)
                            ? level === "medium"
                              ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : level === "hard"
                                ? "bg-orange-100 text-orange-800 border-orange-300"
                                : "bg-red-100 text-red-800 border-red-300"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                  {difficultyFilter.length === 0 && (
                    <p className="text-xs text-destructive">Select at least one difficulty level</p>
                  )}
                </div>

                {/* Bloom's Taxonomy Filter */}
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    Bloom's Taxonomy Levels
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Cognitive
                    </Badge>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {BLOOM_LEVELS.map((bloom) => (
                      <button
                        key={bloom.level}
                        type="button"
                        onClick={() => toggleBloomLevel(bloom.level)}
                        title={bloom.description}
                        className={`px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                          bloomFilter.includes(bloom.level)
                            ? `${bloom.color} text-white border-transparent`
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                        }`}
                      >
                        {bloom.label}
                      </button>
                    ))}
                  </div>
                  {bloomFilter.length === 0 && (
                    <p className="text-xs text-destructive">Select at least one cognitive level</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="answerLines"
                    checked={showAnswerLines}
                    onChange={(e) => setShowAnswerLines(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="answerLines" className="text-sm cursor-pointer">
                    Include answer lines
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeFormulas"
                    checked={includeFormulas}
                    onChange={(e) => setIncludeFormulas(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="includeFormulas" className="text-sm cursor-pointer">
                    Include mathematical formulas
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeFormulaSheet"
                    checked={includeFormulaSheet}
                    onChange={(e) => setIncludeFormulaSheet(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="includeFormulaSheet" className="text-sm cursor-pointer">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      Append formula reference sheet
                    </span>
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeGraphPaper"
                    checked={includeGraphPaper}
                    onChange={(e) => setIncludeGraphPaper(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="includeGraphPaper" className="text-sm cursor-pointer">
                    Include graph paper solutions
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeCoordinateGeometry"
                    checked={includeCoordinateGeometry}
                    onChange={(e) => setIncludeCoordinateGeometry(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="includeCoordinateGeometry" className="text-sm cursor-pointer">
                    Include coordinate geometry solutions
                  </Label>
                </div>
                {/* AI Images/Geometry Shapes - DISABLED */}

                {/* Answer Key Option */}
                <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                  <input
                    type="checkbox"
                    id="includeAnswerKey"
                    checked={includeAnswerKey}
                    onChange={(e) => setIncludeAnswerKey(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Label htmlFor="includeAnswerKey" className="text-sm cursor-pointer">
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5 text-green-600" />
                        Generate Answer Key (recommended for grading accuracy)
                      </span>
                      <span className="text-xs text-muted-foreground ml-5">
                        Creates two answer sheets: a scannable filled worksheet in handwriting font + a clean teacher reference. 
                        Scan the filled sheet first for maximum AI grading accuracy.
                      </span>
                    </span>
                  </Label>
                </div>

                {/* Page Margin Size */}
                <div className="space-y-2 pt-2 border-t border-dashed">
                  <Label className="text-sm flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    Page Margins
                  </Label>
                  <Select value={marginSize} onValueChange={(v) => setMarginSize(v as "small" | "medium" | "large")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (12mm) - More content space</SelectItem>
                      <SelectItem value="medium">Medium (20mm) - Balanced</SelectItem>
                      <SelectItem value="large">Large (25mm) - More white space</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Include Scrap Paper Option */}
                <div className="space-y-3 pt-2 border-t border-dashed">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeScrapPaper"
                      checked={includeScrapPaper}
                      onChange={(e) => setIncludeScrapPaper(e.target.checked)}
                      className="rounded border-input"
                    />
                    <Label htmlFor="includeScrapPaper" className="text-sm cursor-pointer">
                      <span className="flex flex-col">
                        <span className="flex items-center gap-1">
                          <NotebookPen className="h-3.5 w-3.5 text-amber-600" />
                          Bundle scrap paper with worksheet
                        </span>
                        <span className="text-xs text-muted-foreground ml-5">
                          Adds AI-optimized work zones after questions
                        </span>
                      </span>
                    </Label>
                  </div>

                  {includeScrapPaper && (
                    <div className="ml-5 space-y-2">
                      <Label className="text-xs text-muted-foreground">Problems per scrap page</Label>
                      <Select
                        value={scrapPaperLayout}
                        onValueChange={(v) => setScrapPaperLayout(v as "single" | "split-2" | "split-4")}
                      >
                        <SelectTrigger className="w-full h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">1 per page (full space)</SelectItem>
                          <SelectItem value="split-2">2 per page (balanced)</SelectItem>
                          <SelectItem value="split-4">4 per page (compact)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Selected Topics */}
              <div className="space-y-2">
                <Label className="text-sm">Selected Topics</Label>
                <ScrollArea className="h-40 rounded-md border p-2">
                  {selectedQuestions.map((question, index) => (
                    <div
                      key={question.id}
                      className="flex items-center justify-between py-2 px-2 hover:bg-muted/50 rounded-md group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-muted-foreground w-5">{index + 1}.</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{question.topicName}</p>
                          <p className="text-xs text-muted-foreground">{question.standard}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveQuestion(question.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              </div>

              {/* Math Symbol Preview */}
              <MathSymbolPreview />

              {/* Compile Button */}
              <Button
                className="w-full"
                onClick={compileWorksheet}
                disabled={isCompiling || difficultyFilter.length === 0}
              >
                {isCompiling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Questions...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Compile Worksheet
                  </>
                )}
              </Button>

              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onClearAll}>
                Clear All
              </Button>
            </>
          ) : (
            <>
              {/* Bloom's Taxonomy Distribution Summary */}
              <div className="p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Bloom's Taxonomy Distribution</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {BLOOM_LEVELS.map((bloom) => {
                    const count = compiledQuestions.filter((q) => q.bloomLevel === bloom.level).length;
                    if (count === 0) return null;
                    return (
                      <Badge
                        key={bloom.level}
                        className={`text-xs text-white ${bloom.color}`}
                        title={bloom.description}
                      >
                        {bloom.label}: {count}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Compiled Questions Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Generated Questions</Label>
                  {hasQuestionsWithImagePrompts && (
                    <Badge variant={imagesGenerated ? "default" : "secondary"} className="text-xs">
                      {imagesGenerated
                        ? `${compiledQuestions.filter((q) => q.imageUrl).length} diagrams`
                        : `${questionsNeedingImages.length} diagrams pending`}
                    </Badge>
                  )}
                </div>
                <ScrollArea className="h-64 rounded-md border p-2">
                  {compiledQuestions.map((question) => (
                    <div key={question.questionNumber} className="py-3 px-2 border-b last:border-b-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold">{question.questionNumber}.</span>
                        {/* Bloom's Taxonomy Level Badge */}
                        {question.bloomLevel && (
                          <Badge
                            className={`text-xs text-white ${getBloomInfo(question.bloomLevel).color}`}
                            title={getBloomInfo(question.bloomLevel).description}
                          >
                            {getBloomInfo(question.bloomLevel).label}
                            {question.bloomVerb && <span className="ml-1 opacity-80">• {question.bloomVerb}</span>}
                          </Badge>
                        )}
                        {question.advancementLevel && worksheetMode === "diagnostic" && (
                          <Badge
                            variant="outline"
                            className={`text-xs font-semibold ${getAdvancementLevelColor(question.advancementLevel)}`}
                          >
                            Level {question.advancementLevel}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
                          {question.difficulty}
                        </Badge>
                        {question.imageUrl && (
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <Badge
                                variant="default"
                                className="text-xs cursor-pointer bg-primary/90 hover:bg-primary"
                              >
                                <ImageIcon className="h-3 w-3 mr-1" />
                                Diagram
                              </Badge>
                            </HoverCardTrigger>
                            <HoverCardContent side="right" className="w-auto p-2">
                              <div className="flex flex-col items-center gap-2">
                                <p className="text-xs font-medium text-muted-foreground">Click to enlarge</p>
                                <img
                                  src={question.imageUrl}
                                  alt={`Preview for question ${question.questionNumber}`}
                                  className="border rounded max-w-[200px] max-h-[200px] object-contain cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => {
                                    setLightboxImageUrl(question.imageUrl!);
                                    setLightboxQuestionNumber(question.questionNumber);
                                  }}
                                />
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )}
                        {question.imagePrompt && !question.imageUrl && (
                          <Badge variant="secondary" className="text-xs">
                            <ImageIcon className="h-3 w-3 mr-1" />
                            Diagram pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {question.topic} ({question.standard})
                      </p>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 relative">
                          <p className="text-sm font-serif leading-relaxed">
                            {renderMathText(fixEncodingCorruption(question.question))}
                          </p>
                          {regeneratingQuestionTextNumber === question.questionNumber && (
                            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => regenerateQuestionText(question.questionNumber)}
                          disabled={regeneratingQuestionTextNumber !== null || regeneratingQuestionNumber !== null}
                          title="Regenerate question (fixes formatting issues like π symbols)"
                        >
                          {regeneratingQuestionTextNumber === question.questionNumber ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {/* Encoding issues warning indicator */}
                      {(() => {
                        const encodingCheck = detectEncodingIssues(question.question);
                        if (encodingCheck.hasIssues && !correctedSymbols[question.questionNumber]) {
                          return (
                            <div className="mt-1.5 flex items-center gap-1.5 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                                  Possible encoding issue detected
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
                                  Click regenerate (↻) to fix: {encodingCheck.issues.slice(0, 2).join(", ")}
                                  {encodingCheck.issues.length > 2 && ` +${encodingCheck.issues.length - 2} more`}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {/* Corrected symbols indicator */}
                      {correctedSymbols[question.questionNumber] &&
                        correctedSymbols[question.questionNumber].length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
                            <Badge
                              variant="default"
                              className="bg-green-500 hover:bg-green-600 text-white text-xs gap-1"
                            >
                              <Check className="h-3 w-3" />
                              Symbols fixed
                            </Badge>
                            <div className="flex flex-wrap gap-1">
                              {correctedSymbols[question.questionNumber].map((symbol, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-xs border-green-500/50 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                                >
                                  {symbol}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      {question.imageUrl && (
                        <div className="mt-2 flex flex-col items-center gap-2">
                          <div className="relative group">
                            <img
                              src={question.imageUrl}
                              alt={`Diagram for question ${question.questionNumber}`}
                              className="border rounded"
                              style={{ maxWidth: `${imageSize}px`, maxHeight: `${imageSize}px` }}
                            />
                            {regeneratingQuestionNumber === question.questionNumber && (
                              <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => regenerateSingleImage(question.questionNumber)}
                              disabled={regeneratingQuestionNumber !== null}
                            >
                              {regeneratingQuestionNumber === question.questionNumber ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Regenerating...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Regenerate
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setCompiledQuestions((prev) =>
                                  prev.map((q) =>
                                    q.questionNumber === question.questionNumber
                                      ? { ...q, imageUrl: undefined, svg: undefined }
                                      : q
                                  )
                                );
                                toast({
                                  title: "Image removed",
                                  description: `Diagram removed from question ${question.questionNumber}`,
                                });
                              }}
                              disabled={regeneratingQuestionNumber !== null}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      )}
                      {!question.imageUrl && question.imagePrompt && !isNoShapeSubject && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs text-muted-foreground">
                          <span className="font-medium">Diagram description: </span>
                          {question.imagePrompt}
                        </div>
                      )}
                      {!question.imageUrl && question.svg && !isNoShapeSubject && (
                        <div className="mt-2 flex justify-center" dangerouslySetInnerHTML={{ __html: question.svg }} />
                      )}
                      {/* Clipart Display */}
                      {question.clipartUrl && (
                        <div className="mt-2 flex flex-col items-start gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              <Palette className="h-3 w-3 mr-1" />
                              Clipart
                            </Badge>
                          </div>
                          <div className="relative group">
                            <img
                              src={question.clipartUrl}
                              alt={`Clipart for question ${question.questionNumber}`}
                              className="border rounded bg-white"
                              style={{ maxWidth: "60px", maxHeight: "60px" }}
                            />
                            {regeneratingQuestionNumber === question.questionNumber && (
                              <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground h-6 px-2"
                            onClick={() => regenerateClipart(question.questionNumber)}
                            disabled={regeneratingQuestionNumber !== null}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Regenerate
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </ScrollArea>
              </div>

              {/* Generate Images Button - shown when there are questions with imagePrompt */}
              {useAIImages && hasQuestionsWithImagePrompts && (
                <div className="space-y-3">
                  {isGeneratingImages && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{imageGenerationStatus}</span>
                        <span className="font-medium">{Math.round(imageGenerationProgress)}%</span>
                      </div>
                      <Progress value={imageGenerationProgress} className="h-2" />
                    </div>
                  )}
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={openPromptEditor}
                    disabled={isGeneratingImages}
                  >
                    {isGeneratingImages ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Diagrams...
                      </>
                    ) : (
                      <>
                        <Pencil className="h-4 w-4 mr-2" />
                        {questionsNeedingImages.length > 0
                          ? `Review & Generate ${questionsNeedingImages.length} Diagram${questionsNeedingImages.length > 1 ? "s" : ""}`
                          : "Review / Regenerate All Diagrams"}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Add Clipart Button - Only show for non-geometry/trig subjects */}
              {/* Draw Custom Shape Button */}
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setDrawingQuestionNumber(compiledQuestions[0]?.questionNumber || 1);
                  setShowDrawingTool(true);
                }}
              >
                <PenTool className="h-4 w-4 mr-2" />
                Draw Custom Shape
              </Button>

              {!isGeometryOrTrigSubject && !clipartGenerated && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setShowClipartDialog(true)}
                  disabled={isGeneratingClipart}
                >
                  <Palette className="h-4 w-4 mr-2" />
                  Add Fun Clipart to Questions
                </Button>
              )}

              {!isGeometryOrTrigSubject && clipartGenerated && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 text-sm">
                      <Palette className="h-4 w-4 text-primary" />
                      <span className="font-medium text-primary">
                        {compiledQuestions.filter((q) => q.clipartUrl).length} clipart added
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={generateClipart}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerate
                    </Button>
                  </div>
                  {/* Clipart Size Slider */}
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm flex items-center gap-1.5">
                        <Palette className="h-3.5 w-3.5" />
                        Clipart Size
                      </Label>
                      <span className="text-xs text-muted-foreground font-medium">{clipartSize}mm</span>
                    </div>
                    <Slider
                      value={[clipartSize]}
                      onValueChange={(value) => setClipartSize(value[0])}
                      min={10}
                      max={40}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Small (10mm)</span>
                      <span>Large (40mm)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Download/Print/Save Actions */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={generatePDF} disabled={isGenerating}>
                    <Download className="h-4 w-4 mr-2" />
                    {isGenerating ? "Generating..." : "Download PDF"}
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={generateWordDocument}
                    disabled={isGenerating}
                    title="Download as Word document"
                  >
                    <FileType className="h-4 w-4 mr-2" />
                    Word
                  </Button>
                  <Button variant="outline" onClick={handlePreview} title="Preview before printing">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={handlePrint} title="Print worksheet">
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>

                {/* Scrap Paper - grouped with download actions */}
                <Button
                  variant="secondary"
                  className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200"
                  onClick={() => setShowScrapPaperGenerator(true)}
                >
                  <NotebookPen className="h-4 w-4 mr-2" />
                  Print Scrap Paper (AI-Optimized Work Zones)
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={saveWorksheet} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Worksheet
                </Button>
                {savedWorksheets.length > 0 && (
                  <Button variant="outline" onClick={() => setShowSavedWorksheets(true)}>
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Note: NYClogic Scholar only accepts analysis/recommendations, not worksheets */}
              {/* Use the Scan page BatchReport to push student analysis to Scholar */}

              {/* Diagnostic: Record Results Note */}
              {worksheetMode === "diagnostic" && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <ClipboardList className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-purple-900">Diagnostic Worksheet</p>
                      <p className="text-xs text-purple-700">
                        After students complete this worksheet, record their results in the "Differentiated Worksheets"
                        tool to generate personalized follow-up worksheets.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={resetCompilation}>
                Edit Topics
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Print Preview Modal - Uses Portal to render at document root */}
      {showPreview &&
        createPortal(
          <div
            className="print:static print:overflow-visible print:bg-white"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Large Fixed X Close Button - TOP RIGHT CORNER - Very Prominent */}
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="print:hidden"
              style={{
                position: "fixed",
                top: "0.75rem",
                right: "0.75rem",
                zIndex: 100001,
                width: "56px",
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                backgroundColor: "#dc2626",
                color: "white",
                border: "4px solid white",
                boxShadow: "0 6px 24px rgba(0,0,0,0.6), 0 0 0 2px #dc2626",
                cursor: "pointer",
                transition: "transform 0.2s, background-color 0.2s, box-shadow 0.2s",
                fontWeight: "bold",
                fontSize: "1.5rem",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#b91c1c";
                e.currentTarget.style.transform = "scale(1.15)";
                e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.7), 0 0 0 3px #b91c1c";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#dc2626";
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.6), 0 0 0 2px #dc2626";
              }}
              aria-label="Close preview"
              title="Close Preview (ESC)"
            >
              <X className="h-8 w-8" strokeWidth={3.5} />
            </button>

            {/* Preview Header Toolbar */}
            <div
              className="print:hidden"
              style={{
                display: "flex",
                flexDirection: "column",
                backgroundColor: "white",
                borderBottom: "1px solid #e5e7eb",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {/* Top row: Title, Zoom, Close */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem" }}>
                <div className="flex items-center gap-4">
                  <h2 className="font-semibold text-lg">Worksheet Preview</h2>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewZoom(Math.max(50, previewZoom - 25))}
                      disabled={previewZoom <= 50}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[4rem] text-center">{previewZoom}%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewZoom(Math.min(200, previewZoom + 25))}
                      disabled={previewZoom >= 200}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {compiledQuestions.length} question{compiledQuestions.length !== 1 ? "s" : ""} • Press ESC to close
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ marginRight: "4rem" }}>
                  <Button variant="outline" onClick={() => setShowPreview(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Close
                  </Button>
                  <Button variant="outline" onClick={generateWYSIWYGPdf} disabled={isGeneratingPDF}>
                    {isGeneratingPDF ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
                      </>
                    )}
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={generateWordDocument}
                    disabled={isGenerating}
                  >
                    <FileType className="h-4 w-4 mr-2" />
                    Download Word
                  </Button>
                  <Button
                    onClick={() => {
                      const printContent = printRef.current;
                      if (!printContent) {
                        toast({ title: "Error", description: "Could not find content to print", variant: "destructive" });
                        return;
                      }

                      const printWindow = window.open("", "_blank");
                      if (!printWindow) {
                        toast({
                          title: "Error",
                          description: "Popup blocked. Please allow popups.",
                          variant: "destructive",
                        });
                        return;
                      }

                      const worksheetHTML = printContent.innerHTML;

                      printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>${worksheetTitle}</title>
                      <style>
                        @page { size: letter; margin: 0; }
                        * { box-sizing: border-box; }
                        body { 
                          font-family: Georgia, serif; 
                          margin: 0; 
                          padding: 0;
                          color: #000;
                          background: #fff;
                        }
                        .worksheet-page {
                          width: 100%;
                          max-width: 8.5in;
                          margin: 0 auto;
                        }
                        .print-worksheet {
                          padding: ${marginInCss}in;
                          box-sizing: border-box;
                        }
                      </style>
                    </head>
                    <body>
                      <div class="worksheet-page">${worksheetHTML}</div>
                      <script>
                        window.onload = function() {
                          window.print();
                          window.onafterprint = function() { window.close(); };
                        };
                      </script>
                    </body>
                    </html>
                  `);
                      printWindow.document.close();
                    }}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </div>
              
              {/* Format tabs row */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0 1rem 0.5rem", borderTop: "1px solid #f1f5f9" }}>
                <span className="text-sm font-medium text-muted-foreground mr-2">Preview Format:</span>
                <Button
                  variant={previewFormat === "html" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handlePreviewFormatChange("html")}
                  className={previewFormat === "html" ? "" : "text-muted-foreground"}
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  HTML Preview
                </Button>
                <Button
                  variant={previewFormat === "pdf" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handlePreviewFormatChange("pdf")}
                  disabled={isGeneratingPreview && previewFormat !== "pdf"}
                  className={previewFormat === "pdf" ? "" : "text-muted-foreground"}
                >
                  {isGeneratingPreview && previewFormat === "pdf" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-1.5" />
                  )}
                  PDF Preview
                </Button>
                <Button
                  variant={previewFormat === "word" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handlePreviewFormatChange("word")}
                  disabled={isGeneratingPreview && previewFormat !== "word"}
                  className={previewFormat === "word" ? "bg-blue-600 hover:bg-blue-700" : "text-muted-foreground"}
                >
                  {isGeneratingPreview && previewFormat === "word" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileType className="h-4 w-4 mr-1.5" />
                  )}
                  Word Preview
                </Button>
              </div>
            </div>

            {/* Preview Content Area */}
            <div
              className="print:p-0 print:overflow-visible"
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "auto",
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0",
              }}
            >
              {/* Word/PDF Preview using iframe */}
              {(previewFormat === "word" || previewFormat === "pdf") && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "8.5in",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isGeneratingPreview ? (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="text-lg font-medium">Generating {previewFormat.toUpperCase()} preview...</p>
                      <p className="text-sm text-muted-foreground">This may take a moment</p>
                    </div>
                  ) : previewFormat === "word" && wordPreviewUrl ? (
                    <div className="w-full h-full flex flex-col items-center">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center max-w-md">
                        <FileType className="h-16 w-16 mx-auto mb-4 text-blue-600" />
                        <h3 className="text-lg font-semibold mb-2">Word Document Ready</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Word documents cannot be previewed directly in the browser. Click below to download and open in Microsoft Word or Google Docs.
                        </p>
                        <div className="flex gap-2 justify-center">
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = wordPreviewUrl;
                              a.download = `${worksheetTitle.replace(/\s+/g, "_")}_preview.docx`;
                              a.click();
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Word Preview
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Or use the HTML Preview tab to see the worksheet layout
                        </p>
                      </div>
                    </div>
                  ) : previewFormat === "pdf" && pdfPreviewUrl ? (
                    <iframe
                      src={pdfPreviewUrl}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: "600px",
                        border: "1px solid #d1d5db",
                        borderRadius: "0.5rem",
                        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                        transform: `scale(${previewZoom / 100})`,
                        transformOrigin: "top center",
                      }}
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <p className="text-muted-foreground">Click the format button above to generate preview</p>
                    </div>
                  )}
                </div>
              )}

              {/* HTML Preview - Page container with visual page breaks */}
              {previewFormat === "html" && (
              <div
                ref={printRef}
                className="print:shadow-none print:border-none"
                style={{
                  width: "8.5in",
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: "top center",
                }}
              >
                {/* Wrapper that shows page boundaries */}
                <div style={{ position: "relative" }}>
                  {/* Page break indicators - based on configured page margins */}
                  <PageBreakIndicators contentRef={printRef} pageMarginIn={marginIn} />

                  {/* Actual page content */}
                  <div
                    className="print-worksheet print:shadow-none print:border-none"
                    style={{
                      backgroundColor: "white",
                      boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                      border: "1px solid #d1d5db",
                      padding: `${marginInCss}in`,
                      boxSizing: "border-box",
                      width: "100%",
                      maxWidth: "8.5in",
                      overflow: "visible",
                      fontFamily: "'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif",
                    }}
                  >
                    {/* Instructions Banner - Print friendly */}
                    {showAnswerLines && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.4rem 0.75rem",
                          marginBottom: "0.75rem",
                          backgroundColor: "#f0fdf4",
                          border: "1px solid #86efac",
                          borderRadius: "0.25rem",
                          fontSize: "0.65rem",
                          color: "#166534",
                        }}
                      >
                        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          Instructions:
                        </span>
                        <span style={{ flex: 1 }}>
                          Write all work in the <strong>Work Area</strong> boxes. Put your final answer in the{" "}
                          <strong>Final Answer</strong> section.
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-4">
                      <h1 className="text-2xl font-bold text-black">{worksheetTitle}</h1>
                      {teacherName && <p className="text-gray-600 mt-1">Teacher: {teacherName}</p>}
                    </div>
                    <div className="flex justify-between text-sm mb-2 border-b border-gray-300 pb-3 text-black">
                      <span>Name: _______________________</span>
                      <span>Date: ___________</span>
                      <span>Period: _____</span>
                    </div>
                    <div className="flex justify-between text-xs mb-4 text-gray-400">
                      <span>Worksheet Created: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      <span>ID: WS-{Date.now().toString(36).toUpperCase().slice(-6)}</span>
                    </div>
                    <div style={{ width: "100%" }}>
                      {compiledQuestions.map((question) => (
                        <div
                          key={question.questionNumber}
                          style={{
                            pageBreakInside: "avoid",
                            marginBottom: "1.5rem",
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        >
                          {/* Question header - single line with number, bloom level, difficulty */}
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "baseline",
                              gap: "0.5rem",
                              marginBottom: "0.125rem",
                              borderBottom: "1px solid #1e3a5f",
                              paddingBottom: "0.25rem",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "black", fontSize: "0.9rem" }}>
                              {question.questionNumber}. [{question.bloomLevel || "Remember"}:{" "}
                              {question.bloomVerb || "state"}]
                            </span>
                            {worksheetMode === "diagnostic" && question.advancementLevel && (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  color:
                                    question.advancementLevel === "A"
                                      ? "#166534"
                                      : question.advancementLevel === "B"
                                        ? "#047857"
                                        : question.advancementLevel === "C"
                                          ? "#a16207"
                                          : question.advancementLevel === "D"
                                            ? "#c2410c"
                                            : question.advancementLevel === "E"
                                              ? "#b91c1c"
                                              : "#374151",
                                }}
                              >
                                [Level {question.advancementLevel}]
                              </span>
                            )}
                            <span style={{ fontSize: "0.75rem", color: "#374151" }}>[{question.difficulty}]</span>
                          </div>

                          {/* Topic/Standard - compact italic */}
                          <p
                            style={{
                              fontSize: "0.75rem",
                              color: "#6b7280",
                              marginLeft: "1rem",
                              marginBottom: "0.375rem",
                              fontStyle: "italic",
                            }}
                          >
                            {question.topic} ({question.standard})
                          </p>

                          {/* Question text - single spaced, proper margins */}
                          <div
                            style={{
                              marginLeft: "1rem",
                              marginRight: "0.5rem",
                              fontFamily: "serif",
                              lineHeight: "1.3",
                              fontSize: "0.95rem",
                              color: "black",
                              wordWrap: "break-word",
                              overflowWrap: "break-word",
                              wordBreak: "normal",
                              hyphens: "auto",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {renderMathText(fixEncodingCorruption(question.question))}
                          </div>

                          {/* SVG if present - only for geometry subjects */}
                          {question.svg && !isNoShapeSubject && (
                            <div
                              style={{
                                marginLeft: "1rem",
                                marginTop: "0.5rem",
                                display: "flex",
                                justifyContent: "center",
                              }}
                              dangerouslySetInnerHTML={{ __html: question.svg }}
                            />
                          )}

                          {/* Image if present */}
                          {question.imageUrl && (
                            <div
                              style={{
                                marginLeft: "1rem",
                                marginTop: "0.5rem",
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={question.imageUrl}
                                alt={`Question ${question.questionNumber}`}
                                style={{
                                  maxWidth: `${imageSize}px`,
                                  maxHeight: `${imageSize}px`,
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                          )}

                          {/* Work Area Box - Clean design matching reference */}
                          {showAnswerLines && (
                            <div
                              style={{
                                border: "2px solid #1e3a5f",
                                marginTop: "0.5rem",
                                marginLeft: "1rem",
                                marginRight: "0.5rem",
                                backgroundColor: "#ffffff",
                                overflow: "hidden",
                                boxSizing: "border-box",
                              }}
                            >
                              {/* Work Area Section */}
                              <div
                                style={{
                                  borderBottom: "2px dashed #94a3b8",
                                  padding: "0.5rem 0.75rem",
                                  backgroundColor: "#ffffff",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "0.375rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      color: "#1e3a5f",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    Work Area Q{question.questionNumber}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "0.6rem",
                                      color: "#64748b",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    Show all calculations & reasoning here
                                  </span>
                                </div>
                                {/* Work lines with corner markers */}
                                <div
                                  style={{
                                    minHeight: "90px",
                                    position: "relative",
                                  }}
                                >
                                  {[...Array(5)].map((_, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        borderBottom: "1px solid #d1d5db",
                                        height: "1.1rem",
                                      }}
                                    />
                                  ))}
                                  {/* Corner markers */}
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      left: 0,
                                      width: "10px",
                                      height: "10px",
                                      borderLeft: "2px solid #1e3a5f",
                                      borderTop: "2px solid #1e3a5f",
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      right: 0,
                                      width: "10px",
                                      height: "10px",
                                      borderRight: "2px solid #1e3a5f",
                                      borderTop: "2px solid #1e3a5f",
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Final Answer Section - Yellow background */}
                              <div
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  backgroundColor: "#fef3c7",
                                  borderTop: "2px solid #f59e0b",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      color: "#92400e",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.03em",
                                      backgroundColor: "#fde68a",
                                      padding: "0.15rem 0.5rem",
                                      borderRadius: "0.2rem",
                                      border: "1.5px solid #f59e0b",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Final Answer
                                  </span>
                                  <div
                                    style={{
                                      flex: 1,
                                      borderBottom: "1.5px solid #d97706",
                                      minHeight: "1.25rem",
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Formula Reference Sheet in Print Preview */}
                    {includeFormulaSheet &&
                      (() => {
                        const relevantFormulas = getFormulasForTopics(
                          selectedQuestions.map((q) => ({ category: q.category, topicName: q.topicName })),
                        );

                        if (relevantFormulas.length === 0) return null;

                        return (
                          <div
                            className="mt-12 pt-8 border-t-2 border-dashed border-gray-300"
                            style={{ pageBreakBefore: "always" }}
                          >
                            <h2 className="text-xl font-bold text-center mb-2 text-black">Formula Reference Sheet</h2>
                            <p className="text-center text-sm text-gray-500 mb-6">Based on selected topics</p>

                            <div className="grid grid-cols-2 gap-6">
                              {relevantFormulas.map((category) => (
                                <div key={category.category} className="space-y-2">
                                  <h3 className="font-semibold text-sm border-b border-gray-200 pb-1 text-black">
                                    {category.category}
                                  </h3>
                                  <ul className="space-y-1 text-sm">
                                    {category.formulas.map((formula, idx) => (
                                      <li key={idx} className="flex flex-col text-black">
                                        <span>
                                          <span className="font-medium">{formula.name}:</span>{" "}
                                          <span className="font-mono text-xs">{formula.formula}</span>
                                        </span>
                                        {formula.description && (
                                          <span className="text-xs text-gray-500 ml-4">({formula.description})</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                    {/* Answer Key Sheets — Both Formats */}
                    {includeAnswerKey && compiledQuestions.some((q) => q.answer) && (
                      <>
                        {/* Filled worksheet format (for scanning/grading reference) */}
                        <AnswerKeySheet
                          questions={compiledQuestions}
                          worksheetTitle={worksheetTitle}
                          teacherName={teacherName}
                          format="filled"
                          marginIn={marginIn}
                        />
                        {/* Clean teacher reference sheet */}
                        <AnswerKeySheet
                          questions={compiledQuestions}
                          worksheetTitle={worksheetTitle}
                          teacherName={teacherName}
                          format="clean"
                          marginIn={marginIn}
                        />
                      </>
                    )}
                    <div className="mt-12 text-center text-xs text-gray-400 print:hidden">
                      Generated with NYCLogic Ai - NYS Regents Aligned
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* Print Styles */}
      <style>{`
        @media print {
          /* Reset everything for clean print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Hide everything by default */
          body > * {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Show only the worksheet container */
          body > div:last-child,
          body > div:last-child * {
            visibility: visible !important;
          }
          
          /* Show only the worksheet */
          .print-worksheet {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: ${marginInCss}in !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            background: white !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            /* Ensure proper font for math symbols */
            font-family: 'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif !important;
          }
          
          .print-worksheet * {
            visibility: visible !important;
            /* Inherit font for math symbols */
            font-family: inherit !important;
          }
          
          /* Ensure math text uses serif font for proper symbol rendering */
          .print-worksheet [style*="font-family: serif"],
          .print-worksheet .font-serif {
            font-family: 'Times New Roman', 'DejaVu Serif', Georgia, 'Cambria Math', serif !important;
          }
          
          /* Hide print-only hidden elements */
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Ensure borders print correctly */
          .print-worksheet div[style*="border"] {
            border-color: #1e3a5f !important;
          }
          
          /* Keep page breaks working */
          .print-worksheet > div {
            page-break-inside: avoid;
          }
          
          @page {
            margin: 0;
            size: letter;
          }
        }
      `}</style>

      {/* Prompt Editor Dialog */}
      <Dialog open={showPromptEditor} onOpenChange={setShowPromptEditor}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Review & Edit Diagram Prompts
            </DialogTitle>
            <DialogDescription>
              Review and edit the AI prompts for each diagram before generating. Better prompts lead to more accurate
              diagrams.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              {editablePrompts.map((item, index) => {
                const question = compiledQuestions.find((q) => q.questionNumber === item.questionNumber);
                return (
                  <div key={item.questionNumber} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Question {item.questionNumber}
                      </Badge>
                      {question && <span className="text-xs text-muted-foreground">{question.topic}</span>}
                    </div>
                    {question && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {renderMathText(fixEncodingCorruption(question.question))}
                      </p>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={`prompt-${item.questionNumber}`} className="text-xs font-medium">
                        Diagram Description
                      </Label>
                      <Textarea
                        id={`prompt-${item.questionNumber}`}
                        value={item.prompt}
                        onChange={(e) => updateEditablePrompt(item.questionNumber, e.target.value)}
                        className="min-h-[80px] text-sm"
                        placeholder="Describe what the diagram should show..."
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setShowPromptEditor(false)}>
              Cancel
            </Button>
            <Button onClick={generateImagesWithEditedPrompts} disabled={editablePrompts.length === 0}>
              <ImageIcon className="h-4 w-4 mr-2" />
              Generate {editablePrompts.length} Diagram{editablePrompts.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clipart Generation Dialog */}
      <Dialog open={showClipartDialog} onOpenChange={setShowClipartDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Add Fun Clipart?
            </DialogTitle>
            <DialogDescription>
              Would you like to add AI-generated clipart images to make your worksheet more engaging? Each question will
              get a themed clipart icon based on its topic.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Palette className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Themed Clipart Icons</p>
                <p className="text-xs text-muted-foreground">
                  Simple, fun line art images that match each question's topic to help students engage with the
                  material.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This will generate {compiledQuestions.length} clipart image{compiledQuestions.length > 1 ? "s" : ""} and
              may take a moment.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowClipartDialog(false)}>
              Skip for Now
            </Button>
            <Button onClick={generateClipart}>
              <Palette className="h-4 w-4 mr-2" />
              Generate Clipart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clipart Generation Progress */}
      {isGeneratingClipart && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Generating Clipart</p>
                  <p className="text-sm text-muted-foreground">{clipartStatus}</p>
                </div>
              </div>
              <Progress value={clipartProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{Math.round(clipartProgress)}% complete</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lightbox Dialog for Full-Screen Image Viewing */}
      <Dialog
        open={!!lightboxImageUrl}
        onOpenChange={(open) => {
          if (!open) {
            setLightboxImageUrl(null);
            setLightboxQuestionNumber(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Question {lightboxQuestionNumber} - Diagram
            </DialogTitle>
            <DialogDescription>Full-size diagram preview</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 pt-0 flex items-center justify-center bg-muted/30">
            {lightboxImageUrl && (
              <img
                src={lightboxImageUrl}
                alt={`Full-size diagram for question ${lightboxQuestionNumber}`}
                className="max-w-full max-h-[70vh] object-contain rounded-lg border shadow-md"
              />
            )}
          </div>
          <DialogFooter className="p-4 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setLightboxImageUrl(null);
                setLightboxQuestionNumber(null);
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note: Push to NYClogic Scholar dialog removed - Scholar only accepts analysis/recommendations */}

      {/* Canvas Drawing Tool */}
      <CanvasDrawingTool
        open={showDrawingTool}
        onOpenChange={setShowDrawingTool}
        onSaveDrawing={handleSaveDrawing}
        questionNumber={drawingQuestionNumber || undefined}
      />

      {/* AI Image Review Dialog */}
      <AIImageReviewDialog
        open={showImageReviewDialog}
        onOpenChange={setShowImageReviewDialog}
        selectionMode={imageSelectionQuestionNumber !== null}
        onSelectImage={(imageUrl, imageId) => {
          if (imageSelectionQuestionNumber !== null) {
            // Replace the image for the selected question with approved library image
            const updatedQuestions = compiledQuestions.map((q) =>
              q.questionNumber === imageSelectionQuestionNumber ? { ...q, imageUrl } : q,
            );
            setCompiledQuestions(updatedQuestions);
            setImageSelectionQuestionNumber(null);
            toast({
              title: "Image applied!",
              description: `Approved image added to question ${imageSelectionQuestionNumber}.`,
            });
          }
        }}
        topicFilter={
          imageSelectionQuestionNumber !== null
            ? compiledQuestions.find((q) => q.questionNumber === imageSelectionQuestionNumber)?.topic
            : undefined
        }
      />

      {/* Scrap Paper Generator Dialog */}
      <ScrapPaperGenerator
        open={showScrapPaperGenerator}
        onOpenChange={setShowScrapPaperGenerator}
        problemNumbers={compiledQuestions.map((q) => q.questionNumber)}
        worksheetTitle={worksheetTitle}
      />
    </>
  );
}
