import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Upload, RotateCcw, Layers, Play, Plus, Sparkles, User, Bot, Wand2, Clock, Save, CheckCircle, Users, QrCode, FileQuestion, FileImage, UserCheck, GraduationCap, ScanLine, AlertTriangle, XCircle, FileStack, ShieldCheck, RefreshCw, FileText, Brain, BookOpen, Loader2, SunMedium } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { resizeImage, blobToBase64, compressImage } from '@/lib/imageUtils';
import { pdfToImages, isPdfFile } from '@/lib/pdfUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SaveAnalyticsConfirmDialog } from '@/components/scan/SaveAnalyticsConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppLayout } from '@/components/layout/AppLayout';
import { CameraModal } from '@/components/scan/CameraModal';
import { ContinuousQRScanner } from '@/components/scan/ContinuousQRScanner';
import { ImagePreview } from '@/components/scan/ImagePreview';
import React, { Suspense } from 'react';
import { ScanResultsErrorBoundary } from '@/components/scan/ScanResultsErrorBoundary';

// AnalysisResults loaded directly (NOT from lazy.ts barrel — it imports FROM lazy.ts, so putting it there creates a circular dependency)
const AnalysisResults = React.lazy(() => import('@/components/scan/AnalysisResults').then(m => ({ default: m.AnalysisResults })));
const BatchQueue = React.lazy(() => import('@/components/scan/BatchQueue').then(m => ({ default: m.BatchQueue })));
const BatchReport = React.lazy(() => import('@/components/scan/BatchReport').then(m => ({ default: m.BatchReport })));
const GradingComparisonView = React.lazy(() => import('@/components/scan/GradingComparisonView').then(m => ({ default: m.GradingComparisonView })));
import { ClassStudentSelector, useClassStudents } from '@/components/scan/ClassStudentSelector';
import { ScanClassStudentPicker, useStudentName } from '@/components/scan/ScanClassStudentPicker';
import { ScanQuestionSelector } from '@/components/scan/ScanQuestionSelector';
import { SaveForLaterTab } from '@/components/scan/SaveForLaterTab';
import { SyncStatusIndicator } from '@/components/scan/SyncStatusIndicator';
import { AILearningProgress } from '@/components/scan/AILearningProgress';
import { AITrainingWizard } from '@/components/scan/AITrainingWizard';
import { TeacherAnswerKeyDialog } from '@/components/scan/TeacherAnswerKeyDialog';
import { CreateAnswerSheetDialog } from '@/components/scan/CreateAnswerSheetDialog';
import { useAnalyzeStudentWork } from '@/hooks/useAnalyzeStudentWork';
import { useBatchAnalysis } from '@/hooks/useBatchAnalysis';
import { usePendingScans } from '@/hooks/usePendingScans';
import { useSaveAnalysisResults } from '@/hooks/useSaveAnalysisResults';
import { useQRCodeScanner } from '@/hooks/useQRCodeScanner';
import { useQRScanSettings } from '@/hooks/useQRScanSettings';
import { useStudentIdentification } from '@/hooks/useStudentIdentification';
import { useNameCorrections } from '@/hooks/useNameCorrections';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { ManualScoringForm } from '@/components/scan/ManualScoringForm';
import { MultiStudentScanner } from '@/components/scan/MultiStudentScanner';
import { ScannerImportMode } from '@/components/scan/ScannerImportMode';
import { GradingModeSelector, GradingMode } from '@/components/scan/GradingModeSelector';
import { BatchGradingModeSelector, BatchGradingMode } from '@/components/scan/BatchGradingModeSelector';
// GradingComparisonView is lazy-loaded above
import { GoogleClassroomImport, type ImportedSubmission } from '@/components/scan/GoogleClassroomImport';
import { GoogleConnectionPanel } from '@/components/scan/GoogleConnectionPanel';
import { GoogleDriveImport } from '@/components/scan/GoogleDriveImport';
import { SaveToDriveDialog } from '@/components/scan/SaveToDriveDialog';
import { ImagePreprocessDialog } from '@/components/scan/ImagePreprocessDialog';
import { preprocessImage, preprocessBatch, defaultSettings, PreprocessingSettings } from '@/lib/imagePreprocessing';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { useScanSessionPersistence } from '@/hooks/useScanSessionPersistence';

type ScanState = 'idle' | 'camera' | 'preview' | 'choose-method' | 'upload-solution' | 'analyzed' | 'manual-scoring' | 'analyze-saved' | 'comparison';
type ScanMode = 'scanner' | 'saved';

interface ManualResult {
  rubricScores: { criterion: string; score: number; maxScore: number; feedback: string }[];
  totalScore: { earned: number; possible: number; percentage: number };
  feedback: string;
  misconceptions: string[];
}

export default function Scan() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  
  const [scanMode, setScanMode] = useState<ScanMode>(() => {
    try {
      const savedMode = localStorage.getItem('scan-genius-scan-mode');
      if (savedMode && ['scanner', 'saved'].includes(savedMode)) {
        return savedMode as ScanMode;
      }
    } catch {}
    return 'scanner';
  });
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [solutionImage, setSolutionImage] = useState<string | null>(null);
  const [showBatchReport, setShowBatchReport] = useState(false);
  const [gradingMode, setGradingMode] = useState<GradingMode>('ai');
  const [manualResult, setManualResult] = useState<ManualResult | null>(null);
  const [batchCameraMode, setBatchCameraMode] = useState(false);
  const [answerGuideImage, setAnswerGuideImage] = useState<string | null>(null);
  const [showComparisonView, setShowComparisonView] = useState(false);
  const [selectedAnalysisResult, setSelectedAnalysisResult] = useState<'ai' | 'teacher-guided' | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSavedStudents, setBatchSavedStudents] = useState<Set<string>>(new Set());
  const [showBatchGradingModeSelector, setShowBatchGradingModeSelector] = useState(false);
  const [batchAnswerGuideImage, setBatchAnswerGuideImage] = useState<string | null>(null);
  const [showSaveToDriveDialog, setShowSaveToDriveDialog] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  
  // Drop processing progress state
  const [dropProcessing, setDropProcessing] = useState<{
    isProcessing: boolean;
    currentFile: number;
    totalFiles: number;
    currentPage: number;
    totalPages: number;
    fileName: string;
  } | null>(null);
  
  const solutionInputRef = useRef<HTMLInputElement>(null);

  // Class & student selection for batch mode
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const { students } = useClassStudents(selectedClassId);
  
  // Single scan class/student selection
  const [singleScanClassId, setSingleScanClassId] = useState<string | null>(null);
  const [singleScanStudentId, setSingleScanStudentId] = useState<string | null>(null);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const { students: singleScanStudents } = useClassStudents(singleScanClassId);

  const { analyze, analyzeWithTeacherGuide, runBothAnalyses, compareWithSolution, cancelAnalysis, isAnalyzing, isComparing, error, result, setResult, teacherGuidedResult, setTeacherGuidedResult, rawAnalysis, setRawAnalysis, comparisonResult } = useAnalyzeStudentWork();
  const { saveSession, loadSession, clearSession } = useScanSessionPersistence();
  const batch = useBatchAnalysis();
  // Only auto-fetch pending scans when the Saved tab is active to avoid extra traffic
  const { pendingScans, refresh: refreshPendingScans, updateScanStatus } = usePendingScans({
    autoFetch: scanMode === 'saved',
  });
  const { saveResults, saveMultiQuestionResults, isSaving, syncStatus, resetSyncStatus } = useSaveAnalysisResults();
  const { scanImageForQR, isScanning: isQRScanning, scanResult: qrScanResult, clearResult: clearQRResult } = useQRCodeScanner();
  const { settings: qrScanSettings } = useQRScanSettings();
  const { identifyStudent, isIdentifying, identificationResult, clearResult: clearIdentification } = useStudentIdentification();
  
  const [analyzingScanId, setAnalyzingScanId] = useState<string | null>(null);
  const [analyzingScanStudentId, setAnalyzingScanStudentId] = useState<string | null>(null);
  // Track question IDs for multi-question analysis
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [resultsSaved, setResultsSaved] = useState(false);
  const [multiQuestionResults, setMultiQuestionResults] = useState<Record<string, any>>({});
  
  // QR code detection state - now supports student-only, student-question, student-page, and worksheet QR codes
  const [detectedQR, setDetectedQR] = useState<{ studentId: string; questionId?: string; pageNumber?: number; totalPages?: number; worksheetId?: string; type: 'student-only' | 'student-question' | 'student-page' | 'worksheet' } | null>(null);
  
  // Auto-identified student state
  const [autoIdentifiedStudent, setAutoIdentifiedStudent] = useState<{
    studentId: string;
    studentName: string;
    confidence: 'learned' | 'high' | 'medium' | 'low' | 'none';
    handwrittenName?: string | null;
  } | null>(null);
  
  // Name corrections for learning from teacher corrections
  const { 
    corrections, 
    fetchCorrections, 
    saveCorrection, 
    findLearnedMatch,
    isSaving: isSavingCorrection 
  } = useNameCorrections(singleScanClassId);
  
  // Fetch corrections when class changes
  useEffect(() => {
    if (singleScanClassId) {
      fetchCorrections();
    }
  }, [singleScanClassId, fetchCorrections]);
  
  // Get student name for display
  const currentStudentId = detectedQR?.studentId || singleScanStudentId || analyzingScanStudentId;
  const studentName = useStudentName(currentStudentId);
  
  // Confirmation dialog state
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  
  // Multi-student grading mode
  const [showMultiStudentScanner, setShowMultiStudentScanner] = useState(false);
  
  // Continuous QR scanner mode
  const [showContinuousQRScanner, setShowContinuousQRScanner] = useState(false);
  
  // Scanner import pages
  const [scannerImportPages, setScannerImportPages] = useState<{ dataUrl: string; order: number }[]>([]);
  
  // Camera permission
  const { status: cameraStatus, canUseCamera, requestPermission, error: cameraError, hasCamera } = useCameraPermission();
  
  // AI suggestions for manual scoring
  const [aiSuggestions, setAiSuggestions] = useState<{
    scores: { criterion: string; score: number; maxScore: number; feedback: string }[];
    misconceptions: string[];
    feedback: string;
  } | null>(null);

  // Teacher answer key dialog
  const [showAnswerKeyDialog, setShowAnswerKeyDialog] = useState(false);
  const [answerKeyClassName, setAnswerKeyClassName] = useState<string | undefined>(undefined);
  
  // AI Training wizard
  const [showAITrainingWizard, setShowAITrainingWizard] = useState(false);
  
  // Create Answer Sheet dialog
  const [showCreateAnswerSheet, setShowCreateAnswerSheet] = useState(false);
  const [generatedAnswerSheet, setGeneratedAnswerSheet] = useState<any>(null);
  
  // Google Classroom import
  const [showGoogleClassroomImport, setShowGoogleClassroomImport] = useState(false);
  
  // Google Drive import  
  const [showGoogleDriveImport, setShowGoogleDriveImport] = useState(false);

  // Image preprocessing
  const [autoPreprocess, setAutoPreprocess] = useState(true);
  const [showPreprocessDialog, setShowPreprocessDialog] = useState(false);
  const [preprocessingImage, setPreprocessingImage] = useState<{ blob: Blob; name: string } | null>(null);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const mockRubricSteps = [
    { step_number: 1, description: 'Correctly identifies the problem type', points: 1 },
    { step_number: 2, description: 'Sets up equations/approach correctly', points: 2 },
    { step_number: 3, description: 'Shows clear work and reasoning', points: 2 },
    { step_number: 4, description: 'Arrives at correct answer', points: 1 },
  ];

  // ── Persist scanMode and batch classId to localStorage ──
  useEffect(() => {
    localStorage.setItem('scan-genius-scan-mode', scanMode);
  }, [scanMode]);

  useEffect(() => {
    if (selectedClassId) {
      localStorage.setItem('scan-genius-batch-class-id', selectedClassId);
    } else {
      localStorage.removeItem('scan-genius-batch-class-id');
    }
  }, [selectedClassId]);

  // ── Restore scan session on mount ──
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    
    // If batch items were restored, ensure we're in batch mode and restore class
    if (batch.isRestoredFromStorage && batch.items.length > 0) {
      setScanMode('scanner');
      try {
        const savedClassId = localStorage.getItem('scan-genius-batch-class-id');
        if (savedClassId) setSelectedClassId(savedClassId);
      } catch {}
      console.log(`[ScanSession] Auto-switched to batch mode with ${batch.items.length} restored items`);
      return; // batch takes priority over single session
    }
    
    // Try single scan session restore
    const session = loadSession();
    if (!session) return;
    
    setScanMode('scanner');
    setScanState(session.scanState as ScanState);
    setFinalImage(session.finalImage);
    setSingleScanClassId(session.singleScanClassId);
    setSingleScanStudentId(session.singleScanStudentId);
    setSelectedQuestionIds(session.selectedQuestionIds || []);
    setGradingMode(session.gradingMode as GradingMode);
    setResultsSaved(session.resultsSaved || false);
    setAnswerGuideImage(session.answerGuideImage);
    setMultiQuestionResults(session.multiQuestionResults || {});
    setCurrentQuestionIndex(session.currentQuestionIndex || 0);
    
    if (session.result) setResult(session.result);
    if (session.teacherGuidedResult) setTeacherGuidedResult(session.teacherGuidedResult);
    if (session.rawAnalysis) setRawAnalysis(session.rawAnalysis);
    
    toast.info('Previous scan session restored. Click "Start Over" to clear.', {
      duration: 4000,
    });
  }, [loadSession, setResult, setTeacherGuidedResult, setRawAnalysis, batch.isRestoredFromStorage, batch.items.length]);

  // ── Auto-save single scan session when meaningful state changes ──
  useEffect(() => {
    if (!['choose-method', 'analyzed', 'comparison', 'manual-scoring', 'upload-solution'].includes(scanState)) {
      return;
    }
    saveSession({
      scanState,
      finalImage,
      singleScanClassId,
      singleScanStudentId,
      selectedQuestionIds,
      gradingMode,
      resultsSaved,
      result,
      teacherGuidedResult,
      rawAnalysis,
      answerGuideImage,
      multiQuestionResults,
      currentQuestionIndex,
    });
  }, [scanState, finalImage, singleScanClassId, singleScanStudentId, selectedQuestionIds, gradingMode, resultsSaved, result, teacherGuidedResult, rawAnalysis, answerGuideImage, multiQuestionResults, currentQuestionIndex, saveSession]);


  const handleCameraCapture = useCallback(async (imageDataUrl: string) => {
    // Compress image on capture to prevent memory issues on mobile
    try {
      const compressed = await compressImage(imageDataUrl, 1200, 0.8);
      setCapturedImage(compressed);
    } catch (error) {
      console.warn('Compression failed, using original:', error);
      setCapturedImage(imageDataUrl);
    }
    setScanState('preview');
    setBatchCameraMode(false);
  }, []);

  const handleBatchCameraComplete = useCallback(async (images: string[]) => {
    if (images.length === 0) return;
    
    toast.info(`Processing ${images.length} captured image(s)...`);
    
    // Process all images with auto-identification if class is selected
    for (const imageDataUrl of images) {
      // Compress each image before processing to prevent memory issues
      let processedImage = imageDataUrl;
      try {
        processedImage = await compressImage(imageDataUrl, 1200, 0.8);
      } catch (error) {
        console.warn('Compression failed for batch image:', error);
      }
      
      if (selectedClassId && students.length > 0) {
        await batch.addImageWithAutoIdentify(processedImage, students);
      } else if (singleScanClassId && singleScanStudents.length > 0) {
        await batch.addImageWithAutoIdentify(processedImage, singleScanStudents);
      } else {
        batch.addImage(processedImage);
      }
    }
    
    // Switch to batch mode automatically
    setScanMode('scanner');
    toast.success(`Added ${images.length} image(s) to batch${(selectedClassId || singleScanClassId) ? ' with auto-identification' : ''}`);
    setBatchCameraMode(false);
  }, [batch, selectedClassId, singleScanClassId, students, singleScanStudents]);

  const handlePreviewConfirm = useCallback(async (finalImageDataUrl: string) => {
    // Always batch mode - auto-identify student if a class is selected
    if (selectedClassId && students.length > 0) {
      toast.info('Adding image & identifying student...');
      await batch.addImageWithAutoIdentify(finalImageDataUrl, students);
      toast.success('Image added with auto-identification');
    } else {
      batch.addImage(finalImageDataUrl);
      toast.success('Image added to batch');
    }
    setCapturedImage(null);
    setScanState('idle');
  }, [batch, selectedClassId, students]);

  const handleSolutionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const resizedBlob = await resizeImage(file);
        const dataUrl = await blobToBase64(resizedBlob);
        setSolutionImage(dataUrl);
        toast.success('Solution uploaded!');
      } catch (err) {
        console.error('Error resizing image:', err);
        // Fallback to original file
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setSolutionImage(dataUrl);
          toast.success('Solution uploaded!');
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const handleChooseAI = () => {
    setGradingMode('ai');
    analyzeImage();
  };

  const handleChooseTeacherGuided = async (guideImage: string) => {
    if (!finalImage) return;
    setGradingMode('teacher-guided');
    setAnswerGuideImage(guideImage);
    
    toast.info('Analyzing with your answer guide...');
    const analysisResult = await analyzeWithTeacherGuide(finalImage, guideImage, {
      questionId: selectedQuestionIds[0] || detectedQR?.questionId,
      rubricSteps: mockRubricSteps,
      studentName: studentName || undefined,
    });
    
    if (analysisResult) {
      setScanState('analyzed');
    }
  };

  const handleRunBothAnalyses = async (guideImage: string) => {
    if (!finalImage) return;
    setAnswerGuideImage(guideImage);
    
    toast.info('Running both AI and teacher-guided analysis for comparison...');
    const { aiResult, teacherGuidedResult: tgResult } = await runBothAnalyses(finalImage, guideImage, {
      questionId: selectedQuestionIds[0] || detectedQR?.questionId,
      rubricSteps: mockRubricSteps,
      studentName: studentName || undefined,
    });
    
    if (aiResult && tgResult) {
      setShowComparisonView(true);
      setScanState('comparison');
    } else if (aiResult) {
      toast.warning('Teacher-guided analysis failed. Showing AI result only.');
      setScanState('analyzed');
    } else if (tgResult) {
      toast.warning('AI analysis failed. Showing teacher-guided result only.');
      setScanState('analyzed');
    }
  };

  const handleSelectComparisonResult = (selectedResult: any, source: 'ai' | 'teacher-guided') => {
    setSelectedAnalysisResult(source);
    setShowComparisonView(false);
    setScanState('analyzed');
    toast.success(`Using ${source === 'ai' ? 'AI' : 'teacher-guided'} analysis result`);
  };

  const handleChooseTeacherManual = () => {
    setGradingMode('teacher-manual');
    setScanState('upload-solution');
  };

  const handleProceedWithComparison = async () => {
    // If solution is uploaded, get AI suggestions
    if (solutionImage && finalImage) {
      toast.info('Getting AI suggestions...');
      const comparison = await compareWithSolution(finalImage, solutionImage, mockRubricSteps);
      
      if (comparison) {
        // Map AI suggestions to the form format
        const mappedScores = mockRubricSteps.map((step, index) => {
          const suggested = comparison.suggestedScores[index];
          return {
            criterion: step.description,
            score: suggested?.score || 0,
            maxScore: step.points,
            feedback: suggested?.feedback || '',
          };
        });
        
        setAiSuggestions({
          scores: mappedScores,
          misconceptions: comparison.misconceptions,
          feedback: comparison.feedback,
        });
        toast.success('AI suggestions ready!');
      }
    }
    
    setScanState('manual-scoring');
  };

  const handleSkipToScoring = () => {
    setAiSuggestions(null);
    setScanState('manual-scoring');
  };

  const handlePreviewRetake = useCallback(() => {
    setCapturedImage(null);
    setScanState('camera');
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Check if it's a PDF
        if (isPdfFile(file)) {
          toast.info('Converting PDF to images...');
          const images = await pdfToImages(file);
          if (images.length === 0) {
            toast.error('Could not extract pages from PDF');
            return;
          }
          // For single scan, use the first page
          setCapturedImage(images[0]);
          setScanState('preview');
          if (images.length > 1) {
            toast.info(`PDF has ${images.length} pages. First page loaded. Use Batch mode for multi-page PDFs.`);
          }
        } else {
          const resizedBlob = await resizeImage(file);
          const dataUrl = await blobToBase64(resizedBlob);
          setCapturedImage(dataUrl);
          setScanState('preview');
        }
      } catch (err) {
        console.error('Error processing file:', err);
        // Fallback to original file (for images only)
        if (!isPdfFile(file)) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setCapturedImage(dataUrl);
            setScanState('preview');
          };
          reader.readAsDataURL(file);
        } else {
          toast.error('Failed to process PDF file');
        }
      }
    }
    e.target.value = '';
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const fileCount = files.length;
    toast.info(`Processing ${fileCount} file(s)...`);
    
    let totalPages = 0;
    
    // Helper to apply preprocessing to a data URL
    const maybePreprocess = async (dataUrl: string): Promise<string> => {
      if (!autoPreprocess) return dataUrl;
      try {
        // Convert data URL to blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const processed = await preprocessImage(blob, { ...defaultSettings, autoEnhance: true });
        return await blobToBase64(processed);
      } catch (err) {
        console.warn('Preprocessing failed, using original:', err);
        return dataUrl;
      }
    };
    
    // Process files with auto-identification if class is selected
    const processFile = async (file: File) => {
      try {
        // Check if it's a PDF
        if (isPdfFile(file)) {
          const images = await pdfToImages(file);
          for (const dataUrl of images) {
            const processedUrl = await maybePreprocess(dataUrl);
            if (selectedClassId && students.length > 0) {
              await batch.addImageWithAutoIdentify(processedUrl, students);
            } else {
              batch.addImage(processedUrl);
            }
            totalPages++;
          }
        } else {
          const resizedBlob = await resizeImage(file);
          let dataUrl = await blobToBase64(resizedBlob);
          dataUrl = await maybePreprocess(dataUrl);
          if (selectedClassId && students.length > 0) {
            await batch.addImageWithAutoIdentify(dataUrl, students);
          } else {
            batch.addImage(dataUrl);
          }
          totalPages++;
        }
      } catch (err) {
        console.error('Error processing file:', err);
        // Fallback to original file (for images only)
        if (!isPdfFile(file)) {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            let dataUrl = ev.target?.result as string;
            dataUrl = await maybePreprocess(dataUrl);
            if (selectedClassId && students.length > 0) {
              await batch.addImageWithAutoIdentify(dataUrl, students);
            } else {
              batch.addImage(dataUrl);
            }
            totalPages++;
          };
          reader.readAsDataURL(file);
        } else {
          toast.error(`Failed to process PDF: ${file.name}`);
        }
      }
    };

    // Process all files
    await Promise.all(Array.from(files).map(processFile));
    
    toast.success(`Added ${totalPages} page(s) from ${fileCount} file(s)${selectedClassId ? ' with auto-identification' : ''}`);
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Filter valid files (images and PDFs)
    // Use isPdfFile helper for consistent PDF detection across all MIME types
    const validFiles = files.filter(file => 
      file.type.startsWith('image/') || isPdfFile(file)
    );

    if (validFiles.length === 0) {
      toast.error('Please drop image or PDF files only');
      return;
    }

    // Helper to apply preprocessing to a data URL
    const maybePreprocessDrop = async (dataUrl: string): Promise<string> => {
      if (!autoPreprocess) return dataUrl;
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const processed = await preprocessImage(blob, { ...defaultSettings, autoEnhance: true });
        return await blobToBase64(processed);
      } catch (err) {
        console.warn('Preprocessing failed, using original:', err);
        return dataUrl;
      }
    };

    // Single file - still process as batch with one item
    if (validFiles.length === 1 && false) {
      const file = validFiles[0];
      try {
        setDropProcessing({
          isProcessing: true,
          currentFile: 1,
          totalFiles: 1,
          currentPage: 0,
          totalPages: 0,
          fileName: file.name,
        });
        
        if (isPdfFile(file)) {
          const images = await pdfToImages(file);
          if (images.length === 0) {
            toast.error('Could not extract pages from PDF');
            setDropProcessing(null);
            return;
          }
          setCapturedImage(images[0]);
          setScanState('preview');
          if (images.length > 1) {
            toast.info(`PDF has ${images.length} pages. First page loaded. Use Scanner mode for multi-page PDFs.`);
          }
        } else {
          const resizedBlob = await resizeImage(file);
          let dataUrl = await blobToBase64(resizedBlob);
          dataUrl = await maybePreprocessDrop(dataUrl);
          setCapturedImage(dataUrl);
          setScanState('preview');
        }
        toast.success('Image loaded from drop');
      } catch (err) {
        console.error('Error processing dropped file:', err);
        toast.error('Failed to process dropped file');
      } finally {
        setDropProcessing(null);
      }
    } else {
      // Multiple files or in scanner mode - process as batch with progress
      let totalPages = 0;
      let totalStudentsIdentified = 0;
      let totalPagesLinked = 0;
      
      // Initialize progress
      setDropProcessing({
        isProcessing: true,
        currentFile: 0,
        totalFiles: validFiles.length,
        currentPage: 0,
        totalPages: 0,
        fileName: '',
      });

      // Get the active student roster
      const activeRoster = singleScanStudents.length > 0 
        ? singleScanStudents 
        : students.length > 0 
          ? students 
          : [];

      for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex++) {
        const file = validFiles[fileIndex];
        
        try {
          if (isPdfFile(file)) {
            // Update progress for PDF
            setDropProcessing(prev => prev ? {
              ...prev,
              currentFile: fileIndex + 1,
              fileName: file.name,
              currentPage: 0,
              totalPages: 0,
            } : null);
            
            const images = await pdfToImages(file);
            
            // Update total pages for this PDF
            setDropProcessing(prev => prev ? {
              ...prev,
              totalPages: images.length,
            } : null);
            
            // Use auto-grouping if we have a roster with students AND setting is enabled
            if (activeRoster.length > 0 && images.length > 1 && qrScanSettings.autoHandwritingGroupingEnabled) {
              // Use the new auto-grouping function for multi-page PDFs
              const result = await batch.addPdfPagesWithAutoGrouping(
                images,
                activeRoster,
                (current, total, status) => {
                  setDropProcessing(prev => prev ? {
                    ...prev,
                    currentPage: current,
                    totalPages: total,
                    fileName: `${file.name} - ${status}`,
                  } : null);
                }
              );
              
              totalPages += result.pagesAdded;
              totalStudentsIdentified += result.studentsIdentified;
              totalPagesLinked += result.pagesLinked;
            } else {
              // Single page PDF or no roster - process normally
              for (let pageIndex = 0; pageIndex < images.length; pageIndex++) {
                let dataUrl = images[pageIndex];
                
                // Apply preprocessing if enabled
                dataUrl = await maybePreprocessDrop(dataUrl);
                
                // Update page progress
                setDropProcessing(prev => prev ? {
                  ...prev,
                  currentPage: pageIndex + 1,
                } : null);
                
                if (activeRoster.length > 0) {
                  await batch.addImageWithAutoIdentify(dataUrl, activeRoster);
                } else {
                  batch.addImage(dataUrl);
                }
                totalPages++;
              }
            }
          } else {
            // Update progress for image
            setDropProcessing(prev => prev ? {
              ...prev,
              currentFile: fileIndex + 1,
              fileName: file.name,
              currentPage: 1,
              totalPages: 1,
            } : null);
            
            const resizedBlob = await resizeImage(file);
            let dataUrl = await blobToBase64(resizedBlob);
            dataUrl = await maybePreprocessDrop(dataUrl);
            if (activeRoster.length > 0) {
              await batch.addImageWithAutoIdentify(dataUrl, activeRoster);
            } else {
              batch.addImage(dataUrl);
            }
            totalPages++;
          }
        } catch (err: any) {
          console.error('Error processing dropped file:', err);
          toast.error(`Failed to process ${file.name}`, {
            description: err?.message || 'Unknown error occurred',
          });
        }
      }

      setDropProcessing(null);
      
      if (totalPages > 0) {
        setScanMode('scanner');
        
        // Build descriptive success message
        let message = `Added ${totalPages} page(s) to batch`;
        const details: string[] = [];
        
        if (totalStudentsIdentified > 0) {
          details.push(`${totalStudentsIdentified} student(s) identified`);
        }
        if (totalPagesLinked > 0) {
          details.push(`${totalPagesLinked} page(s) auto-linked`);
        }
        
        if (details.length > 0) {
          toast.success(message, {
            description: details.join(', '),
          });
        } else {
          toast.success(message);
        }
      }
    }
  }, [scanMode, batch, selectedClassId, singleScanClassId, students, singleScanStudents]);

  const handleNativeCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const resizedBlob = await resizeImage(file);
        const dataUrl = await blobToBase64(resizedBlob);
        setCapturedImage(dataUrl);
        setScanState('preview');
      } catch (err) {
        console.error('Error resizing image:', err);
        // Fallback to original file
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setCapturedImage(dataUrl);
          setScanState('preview');
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const analyzeImage = async () => {
    if (!finalImage) return;

    // Multi-question analysis
    if (selectedQuestionIds.length > 0) {
      const results: Record<string, any> = {};
      
      for (let i = 0; i < selectedQuestionIds.length; i++) {
        setCurrentQuestionIndex(i);
        toast.info(`Analyzing question ${i + 1} of ${selectedQuestionIds.length}...`);
        
        const analysisResult = await analyze(finalImage, selectedQuestionIds[i], mockRubricSteps);
        if (analysisResult) {
          results[selectedQuestionIds[i]] = analysisResult;
        }
      }
      
      setMultiQuestionResults(results);
      setScanState('analyzed');
      
      const totalQuestions = selectedQuestionIds.length;
      const successCount = Object.keys(results).length;
      toast.success(`Analysis complete! ${successCount}/${totalQuestions} questions analyzed`);
      
      if (analyzingScanId) {
        await updateScanStatus(analyzingScanId, 'analyzed');
        refreshPendingScans();
      }
    } else {
      // Single question (legacy flow)
      const analysisResult = await analyze(finalImage, undefined, mockRubricSteps);
      
      if (analysisResult) {
        setScanState('analyzed');
        toast.success('Analysis complete!', {
          description: `Score: ${analysisResult.totalScore.earned}/${analysisResult.totalScore.possible} (${analysisResult.totalScore.percentage}%)`,
        });
        if (analyzingScanId) {
          await updateScanStatus(analyzingScanId, 'analyzed');
          refreshPendingScans();
        }
      } else if (error) {
        toast.error('Analysis failed', { description: error });
      }
    }
  };

  const handleManualScoreSubmit = async (manualScoreResult: ManualResult) => {
    setManualResult(manualScoreResult);
    setScanState('analyzed');
    toast.success('Score saved!', {
      description: `Score: ${manualScoreResult.totalScore.earned}/${manualScoreResult.totalScore.possible} (${manualScoreResult.totalScore.percentage}%)`,
    });
    // Update saved scan status if analyzing a saved scan
    if (analyzingScanId) {
      await updateScanStatus(analyzingScanId, 'analyzed');
      refreshPendingScans();
    }
  };

  const openBatchGradingModeSelector = () => {
    if (batch.items.length === 0) {
      toast.error('Add images to the batch first');
      return;
    }
    setShowBatchGradingModeSelector(true);
  };

  const handleBatchGradingModeSelect = async (mode: BatchGradingMode, answerGuideImage?: string) => {
    setShowBatchGradingModeSelector(false);
    
    // Check if all items have students assigned
    const unassigned = batch.items.filter(item => !item.studentId);
    if (unassigned.length > 0 && selectedClassId) {
      toast.warning(`${unassigned.length} paper(s) don't have students assigned`);
    }

    if (mode === 'manual') {
      // Mark all items as needing manual scoring
      toast.info('Manual scoring mode selected. Grade each paper individually after reviewing.');
      return;
    }

    if (mode === 'teacher-guided' && answerGuideImage) {
      setBatchAnswerGuideImage(answerGuideImage);
      toast.info(`Starting teacher-guided analysis of ${batch.items.length} papers...`);
      await batch.startTeacherGuidedBatchAnalysis(answerGuideImage, mockRubricSteps);
    } else if (mode === 'ai-learned') {
      toast.info(`Starting AI analysis with your learned grading style...`);
      await batch.startBatchAnalysis(mockRubricSteps, 'teacher', undefined, undefined, true);
    } else {
      toast.info(`Starting AI analysis of ${batch.items.length} papers...`);
      await batch.startBatchAnalysis(mockRubricSteps);
    }
    
    const summary = batch.generateSummary();
    setShowBatchReport(true);
    
    toast.success('Batch analysis complete!', {
      description: `Average score: ${summary.averageScore}%`,
    });
  };

  const startBatchAnalysis = async () => {
    openBatchGradingModeSelector();
  };

  const exportPDF = async () => {
    const summary = batch.summary;
    if (!summary) return;

    // Import and use the detailed export function
    const { exportGradingReportPDF } = await import('@/lib/gradingReportExport');
    
    try {
      await exportGradingReportPDF({
        items: batch.items,
        className: selectedClassId ? 'Class Grading Report' : 'Grading Report',
        assignmentName: batch.items[0]?.result?.problemIdentified || 'Assignment',
        includeImages: true,
        includeAnnotations: true,
        includeDetailedFeedback: true,
      });
      toast.success('Detailed grading report exported as PDF');
    } catch (err) {
      console.error('Error exporting detailed PDF:', err);
      // Fallback to basic export
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Class Grading Report', 20, 20);
      doc.setFontSize(12);
      doc.text(`Total Students: ${summary.totalStudents}`, 20, 35);
      doc.text(`Class Average: ${summary.averageScore}%`, 20, 45);
      doc.text(`Pass Rate: ${summary.passRate}%`, 20, 55);
      doc.text(`Score Range: ${summary.lowestScore}% - ${summary.highestScore}%`, 20, 65);
      doc.text('Individual Results:', 20, 80);
      let y = 90;
      batch.items
        .filter(item => item.status === 'completed' && item.result)
        .forEach((item, i) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(
            `${i + 1}. ${item.studentName}: ${item.result!.totalScore.earned}/${item.result!.totalScore.possible} (${item.result!.totalScore.percentage}%)`,
            20,
            y
          );
          y += 10;
        });
      doc.save('grading-report.pdf');
      toast.success('Basic report exported as PDF');
    }
  };

  // Save all batch results to gradebook directly from BatchQueue
  // Consolidates duplicate students into one averaged grade
  const handleBatchSaveToGradebook = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in to save results');
      return;
    }

    setBatchSaving(true);
    let successCount = 0;
    let failCount = 0;

    const completedItems = batch.items.filter(
      item => item.status === 'completed' && 
      item.result && 
      item.studentId && 
      item.pageType !== 'continuation' &&
      !batchSavedStudents.has(item.studentId)
    );

    // Group items by student ID to consolidate duplicate students
    const studentGroups = new Map<string, typeof completedItems>();
    for (const item of completedItems) {
      const studentId = item.studentId!;
      if (!studentGroups.has(studentId)) {
        studentGroups.set(studentId, []);
      }
      studentGroups.get(studentId)!.push(item);
    }

    try {
      for (const [studentId, studentItems] of studentGroups) {
        // Calculate averaged grade for students with multiple papers
        const grades: number[] = [];
        const regentsScores: number[] = [];
        const justifications: string[] = [];
        let topicName = '';
        let nysStandard: string | null = null;
        let totalEarned = 0;
        let totalPossible = 0;
        let hasOverride = false;
        let overrideJustification = '';

        for (const item of studentItems) {
          const result = item.result!;
          const effectiveGrade = result.overriddenGrade ?? result.grade ?? result.totalScore.percentage;
          grades.push(effectiveGrade);
          
          if (result.regentsScore !== undefined && result.regentsScore !== null) {
            regentsScores.push(result.regentsScore);
          }
          
          if (!topicName && result.problemIdentified) {
            topicName = result.problemIdentified;
          }
          if (!nysStandard && result.nysStandard) {
            nysStandard = result.nysStandard;
          }
          
          totalEarned += result.totalScore.earned || 0;
          totalPossible += result.totalScore.possible || 0;
          
          if (result.isOverridden) {
            hasOverride = true;
            overrideJustification = result.overrideJustification || '';
          }
          
          if (result.gradeJustification || result.feedback) {
            justifications.push(result.gradeJustification || result.feedback || '');
          }
        }

        // Calculate the averaged grade
        const averagedGrade = Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length);
        const averagedRegentsScore = regentsScores.length > 0 
          ? Math.round(regentsScores.reduce((sum, s) => sum + s, 0) / regentsScores.length)
          : null;
        
        // Build combined justification
        let gradeJustification = studentItems.length > 1
          ? `COMPOSITE GRADE (${studentItems.length} papers averaged: ${grades.join('%, ')}%). `
          : '';
        
        if (hasOverride && overrideJustification) {
          gradeJustification += `TEACHER OVERRIDE: ${overrideJustification}. `;
        }
        
        // Take first justification for brevity
        if (justifications.length > 0) {
          gradeJustification += justifications[0];
        }

        // Save to grade_history
        const { error: gradeError } = await supabase
          .from('grade_history')
          .insert({
            student_id: studentId,
            topic_name: topicName || 'General Assessment',
            grade: averagedGrade,
            grade_justification: gradeJustification || null,
            raw_score_earned: totalEarned,
            raw_score_possible: totalPossible,
            teacher_id: user.id,
            regents_score: averagedRegentsScore,
            nys_standard: nysStandard,
            regents_justification: studentItems[0].result?.regentsScoreJustification || null,
          });

        if (gradeError) {
          console.error('Error saving grade for', studentItems[0].studentName, ':', gradeError);
          failCount++;
          continue;
        }

        successCount++;
        setBatchSavedStudents(prev => new Set([...prev, studentId]));
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Saved ${successCount} student grade(s) to gradebook!`, {
          description: studentGroups.size !== completedItems.length 
            ? `${completedItems.length} papers consolidated into ${studentGroups.size} averaged grades`
            : undefined,
          icon: <Save className="h-4 w-4" />,
        });
      } else if (successCount > 0) {
        toast.warning(`${successCount} saved, ${failCount} failed`);
      } else if (failCount > 0) {
        toast.error('Failed to save grades to gradebook');
      } else {
        toast.info('No new grades to save');
      }
    } catch (err) {
      console.error('Batch save to gradebook error:', err);
      toast.error('Failed to save to gradebook');
    } finally {
      setBatchSaving(false);
    }
  };

  // Check if all batch items with students have been saved
  const allBatchSaved = batch.items.length > 0 && 
    batch.items.filter(i => i.status === 'completed' && i.studentId && i.pageType !== 'continuation')
      .every(i => batchSavedStudents.has(i.studentId!));

  const clearImage = () => {
    setFinalImage(null);
    setCapturedImage(null);
    setSolutionImage(null);
    setScanState('idle');
  };

  const startNewScan = () => {
    setFinalImage(null);
    setCapturedImage(null);
    setSolutionImage(null);
    setScanState('idle');
    setShowBatchReport(false);
    setManualResult(null);
    setAiSuggestions(null);
    setAnalyzingScanId(null);
    setAnalyzingScanStudentId(null);
    setSelectedQuestionIds([]);
    setCurrentQuestionIndex(0);
    setMultiQuestionResults({});
    setResultsSaved(false);
    setShowStudentPicker(false);
    setDetectedQR(null);
    setAutoIdentifiedStudent(null);
    setBatchSavedStudents(new Set());
    clearQRResult();
    clearIdentification();
    resetSyncStatus();
    clearSession();
    localStorage.removeItem('scan-genius-batch-class-id');
  };

  // Handle analyzing a saved scan with multiple questions
  const handleAnalyzeSavedScan = async (
    scan: { id: string; image_url: string; student_id: string | null },
    questionIds: string[]
  ) => {
    setAnalyzingScanId(scan.id);
    setAnalyzingScanStudentId(scan.student_id);
    setFinalImage(scan.image_url);
    setSelectedQuestionIds(questionIds);
    setCurrentQuestionIndex(0);
    setMultiQuestionResults({});
    setResultsSaved(false);
    setScanState('choose-method');
  };

  // Save multi-question analysis results to database
  const handleSaveResults = async () => {
    const studentId = currentStudentId;
    
    if (!studentId || Object.keys(multiQuestionResults).length === 0 || !finalImage) {
      toast.error('Missing student or results to save');
      return;
    }

    const success = await saveMultiQuestionResults(
      studentId,
      finalImage,
      multiQuestionResults,
      analyzingScanId || undefined
    );

    if (success) {
      setResultsSaved(true);
      refreshPendingScans();
    }
  };

  // Save single result to database
  const handleSaveSingleResult = async () => {
    const studentId = currentStudentId;
    
    if (!studentId) {
      toast.error('Please associate a student before saving');
      setShowStudentPicker(true);
      return;
    }
    
    // Use either AI result or manual result
    const resultToSave = result || (manualResult ? {
      ocrText: '',
      problemIdentified: '',
      approachAnalysis: '',
      rubricScores: manualResult.rubricScores,
      misconceptions: manualResult.misconceptions,
      totalScore: manualResult.totalScore,
      feedback: manualResult.feedback,
    } : null);
    
    if (!resultToSave || !finalImage) {
      toast.error('Missing analysis results to save');
      return;
    }

    // Check if we have a valid question ID
    const questionId = selectedQuestionIds[0] || detectedQR?.questionId;
    if (!questionId) {
      toast.error('No question selected. Please select a question from your library or use a QR-coded assessment.', {
        duration: 5000,
      });
      return;
    }

    const attemptId = await saveResults({
      studentId,
      questionId,
      imageUrl: finalImage,
      result: resultToSave,
    });

    if (attemptId) {
      setResultsSaved(true);
      toast.success('Analytics saved successfully');
    }
  };

  // Override the analyzed state handler to update scan status
  const handleAnalysisComplete = async () => {
    if (analyzingScanId) {
      await updateScanStatus(analyzingScanId, 'analyzed');
      refreshPendingScans();
    }
  };

  // Detect if running in Capacitor/native context
  const isNativeContext = typeof window !== 'undefined' && 
    (window.navigator.userAgent.includes('Capacitor') || 
     window.navigator.userAgent.includes('wv') ||
     (window as any).Capacitor);

  // Get selected students for display
  const selectedStudents = students.filter(s => selectedStudentIds.includes(s.id));

  return (
    <>
      <AppLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold">Scan Student Work</h1>
            <p className="text-muted-foreground">Capture or upload photos of student responses</p>
          </div>

          {/* AI Learning Progress Indicator */}
          <AILearningProgress compact />

          {/* Google Connection Panel */}
          <GoogleConnectionPanel 
            onDriveImport={() => setShowGoogleDriveImport(true)}
            onClassroomImport={() => setShowGoogleClassroomImport(true)}
          />

          {/* Train AI and Answer Key Buttons */}
          <div className="flex justify-end gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAITrainingWizard(true)}
              className="gap-2"
            >
              <Brain className="h-4 w-4" />
              Train AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAnswerKeyDialog(true);
              }}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Create Answer Key
            </Button>
          </div>

          {/* Mode Toggle */}
          <Tabs value={scanMode} onValueChange={(v) => {
            setScanMode(v as ScanMode);
            startNewScan();
            batch.clearAll();
            setSelectedClassId(null);
            setSelectedStudentIds([]);
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scanner" className="gap-2">
                <Layers className="h-4 w-4" />
                Scan Papers
              </TabsTrigger>
              <TabsTrigger value="saved" className="gap-2">
                <Clock className="h-4 w-4" />
                Saved ({pendingScans.length})
              </TabsTrigger>
            </TabsList>


            {/* Scanner Mode - Combined Batch + Scanner Import */}
            <TabsContent value="scanner" className="space-y-4 mt-4">
              <ScanResultsErrorBoundary
                grade={batch.items.find(i => i.result?.grade)?.result?.grade}
                onRetry={() => window.location.reload()}
              >
              <Suspense fallback={<div className="text-center py-8 text-muted-foreground">Loading...</div>}>
              {showBatchReport && batch.summary ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => setShowBatchReport(false)}>
                      ← Back to Queue
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      batch.clearAll();
                      setShowBatchReport(false);
                      setSelectedClassId(null);
                      setSelectedStudentIds([]);
                    }}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      New Batch
                    </Button>
                  </div>
                  <BatchReport 
                    items={batch.items} 
                    summary={batch.summary}
                    classId={selectedClassId || undefined}
                    questionId={selectedQuestionIds[0] || undefined}
                    students={students}
                    onExport={exportPDF}
                    onSaveComplete={() => {
                      toast.success('All grades saved to gradebook');
                    }}
                    onUnlinkContinuation={batch.unlinkContinuation}
                    onReanalyzeItem={batch.reanalyzeItem}
                  />
                </div>
              ) : (
                <>
                  {/* Class & Student Selector */}
                  <ClassStudentSelector
                    selectedClassId={selectedClassId}
                    selectedStudentIds={selectedStudentIds}
                    onClassChange={setSelectedClassId}
                    onStudentsChange={setSelectedStudentIds}
                    disabled={batch.isProcessing}
                  />

                  {/* Scanner Import Panel */}
                  <ScannerImportMode
                    onPagesReady={async (pages) => {
                      setScannerImportPages(pages);
                      
                      // Add all pages to batch for processing (with filename for topic grouping)
                      // If a class is selected with students, use auto-identification
                      if (selectedClassId && students.length > 0) {
                        toast.info(`Processing ${pages.length} pages with student identification...`);
                        for (const page of pages) {
                          await batch.addImageWithAutoIdentify(page.dataUrl, students);
                        }
                        toast.success(`${pages.length} pages added and students identified`);
                        
                        // Auto-group pages by the same student (handles front/back automatically)
                        const groupResult = batch.groupPagesByStudent();
                        if (groupResult.pagesLinked > 0) {
                          toast.success(`Auto-linked ${groupResult.pagesLinked} front/back pages for ${groupResult.studentsGrouped} students`, {
                            icon: <FileStack className="h-4 w-4" />,
                          });
                        }
                      } else {
                        // No class selected - add pages without identification
                        pages.forEach(page => {
                          batch.addImage(page.dataUrl, undefined, undefined, page.filename);
                        });
                        toast.success(`${pages.length} pages added for analysis`);
                      }
                      
                      // Auto-group by worksheet topic if filenames indicate multi-page papers
                      if (pages.length >= 2) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const topicResult = batch.groupPagesByWorksheetTopic();
                        if (topicResult.pagesLinked > 0) {
                          toast.success(`Auto-grouped ${topicResult.pagesLinked} pages by worksheet topic`, {
                            description: `${topicResult.topicsGrouped} multi-page papers detected`,
                            icon: <FileStack className="h-4 w-4" />,
                          });
                        }
                      }
                      
                      // Auto-run handwriting grouping if enabled and more than 1 page
                      if (qrScanSettings.autoHandwritingGroupingEnabled && pages.length >= 2) {
                        // Wait for state update
                        await new Promise(resolve => setTimeout(resolve, 100));
                        toast.info('Auto-grouping multi-page papers by handwriting...', { 
                          icon: <FileStack className="h-4 w-4" /> 
                        });
                        const result = await batch.detectMultiPageByHandwriting();
                        if (result.pagesLinked > 0) {
                          toast.success(`Auto-grouped ${result.pagesLinked} continuation pages`, {
                            description: `${result.groupsCreated} separate student papers detected`,
                            icon: <FileStack className="h-4 w-4" />,
                          });
                        }
                      }
                    }}
                    onClose={() => {}}
                  />

                  {/* Auto-enhance toggle for uploads */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-primary" />
                      <div>
                        <Label htmlFor="auto-preprocess" className="text-sm font-medium cursor-pointer">
                          Auto-enhance scanned images
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Improves contrast, sharpness, and reduces noise
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="auto-preprocess"
                      checked={autoPreprocess}
                      onCheckedChange={setAutoPreprocess}
                    />
                  </div>

                  {/* Add images section */}
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                          <Layers className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold">Add Student Papers</h2>
                          <p className="text-sm text-muted-foreground">
                            {selectedClassId 
                              ? `Papers will be auto-identified using QR codes or handwritten names`
                              : 'Select a class above to enable automatic student identification'}
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <input
                            ref={batchInputRef}
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            multiple
                            onChange={handleBatchUpload}
                            className="hidden"
                          />
                          <Button 
                            variant="outline"
                            onClick={() => batchInputRef.current?.click()}
                            disabled={batch.isProcessing}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Multiple
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setScanState('camera')}
                            disabled={batch.isProcessing}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Take Photo
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Queue with student assignment */}
                  <BatchQueue
                    items={batch.items}
                    students={students}
                    classId={selectedClassId}
                    onRemove={batch.removeImage}
                    onAssignStudent={batch.updateItemStudent}
                    onStudentCreated={async (studentId, studentName) => {
                      // Refresh the students list when a new student is added
                      toast.success(`${studentName} added to roster`);
                      // The useClassStudents hook should auto-refresh, but we can force a re-render
                    }}
                    onLinkContinuation={batch.linkContinuation}
                    onUnlinkContinuation={batch.unlinkContinuation}
                    onUnlinkAllPages={batch.unlinkAllPages}
                    onConvertToSeparate={batch.convertToSeparatePaper}
                    onReorder={batch.reorderItems}
                    onSaveToGradebook={handleBatchSaveToGradebook}
                    onSaveToDrive={() => setShowSaveToDriveDialog(true)}
                    onOverrideGrade={batch.overrideGrade}
                    onSelectRunAsGrade={batch.selectRunAsGrade}
                    currentIndex={batch.currentIndex}
                    isProcessing={batch.isProcessing}
                    isIdentifying={batch.isIdentifying}
                    isRestoredFromStorage={batch.isRestoredFromStorage}
                    isSaving={batchSaving}
                    allSaved={allBatchSaved}
                    driveSaved={driveSaved}
                  />

                  {/* Action buttons */}
                  {batch.items.length > 0 && (
                    <div className="space-y-3">
                      {/* QR Scan button - fast local scanning */}
                      {selectedClassId && students.length > 0 && batch.items.some(item => !item.identification?.qrCodeDetected) && (
                        <Button
                          variant="outline"
                          className="w-full border-green-500/50 text-green-700 dark:text-green-400 hover:bg-green-500/10"
                          onClick={async () => {
                            toast.info('Scanning all papers for QR codes...', { icon: <QrCode className="h-4 w-4" /> });
                            const result = await batch.scanAllQRCodes(students);
                            if (result.matched > 0) {
                              toast.success(`Found QR codes in ${result.matched} of ${result.total} papers!`, {
                                icon: <QrCode className="h-4 w-4" />,
                              });
                              // Auto-group pages by the same student (handles front/back automatically)
                              const groupResult = batch.groupPagesByStudent();
                              if (groupResult.pagesLinked > 0) {
                                toast.success(`Auto-linked ${groupResult.pagesLinked} front/back pages for ${groupResult.studentsGrouped} students`, {
                                  icon: <FileStack className="h-4 w-4" />,
                                });
                              }
                            } else {
                              toast.info('No QR codes detected. Try AI identification instead.');
                            }
                          }}
                          disabled={batch.isProcessing || batch.isIdentifying}
                        >
                          {batch.isIdentifying ? (
                            <>
                              <QrCode className="h-4 w-4 mr-2 animate-pulse" />
                              Scanning {batch.currentIndex + 1}/{batch.items.length}...
                            </>
                          ) : (
                            <>
                              <QrCode className="h-4 w-4 mr-2" />
                              Scan QR Codes (Fast)
                            </>
                          )}
                        </Button>
                      )}

                      {/* AI Auto-identify button - for papers without QR */}
                      {selectedClassId && students.length > 0 && batch.items.some(item => !item.studentId) && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={async () => {
                            toast.info('Auto-identifying students from handwritten names...');
                            await batch.autoIdentifyAll(students);
                            // Auto-group pages by the same student (handles front/back automatically)
                            const groupResult = batch.groupPagesByStudent();
                            if (groupResult.pagesLinked > 0) {
                              toast.success(`Auto-linked ${groupResult.pagesLinked} front/back pages for ${groupResult.studentsGrouped} students`, {
                                icon: <FileStack className="h-4 w-4" />,
                              });
                            }
                          }}
                          disabled={batch.isProcessing || batch.isIdentifying}
                        >
                          {batch.isIdentifying ? (
                            <>
                              <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                              Identifying {batch.currentIndex + 1}/{batch.items.length}...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              AI Identify Names (Slower)
                            </>
                          )}
                        </Button>
                      )}

                      {/* Manual grouping button - fallback if auto-grouping missed some */}
                      {batch.items.length >= 2 && batch.items.some(item => item.studentId) && batch.items.some(item => !item.pageType) && (
                        <Button
                          variant="outline"
                          className="w-full border-blue-500/50 text-blue-700 dark:text-blue-400 hover:bg-blue-500/10"
                          onClick={async () => {
                            toast.info('Analyzing handwriting to group multi-page papers...', { 
                              description: 'Sequential pages with similar handwriting will be linked together',
                              icon: <FileStack className="h-4 w-4" /> 
                            });
                            const result = await batch.detectMultiPageByHandwriting();
                            if (result.pagesLinked > 0) {
                              toast.success(`Grouped ${result.pagesLinked} continuation pages with their primary papers`, {
                                description: `${result.groupsCreated} separate student papers detected`,
                                icon: <FileStack className="h-4 w-4" />,
                              });
                            } else {
                              toast.info('All pages appear to be from different students', {
                                description: 'No multi-page groupings detected',
                              });
                            }
                          }}
                          disabled={batch.isProcessing || batch.isIdentifying}
                        >
                          {batch.isIdentifying ? (
                            <>
                              <FileStack className="h-4 w-4 mr-2 animate-pulse" />
                              Comparing {batch.currentIndex + 1}/{batch.items.length}...
                            </>
                          ) : (
                            <>
                              <FileStack className="h-4 w-4 mr-2" />
                              Group Two-Sided Papers
                            </>
                          )}
                        </Button>
                      )}

                      {/* Summary of identified papers */}
                      {batch.items.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <QrCode className="h-3.5 w-3.5 text-green-600" />
                            {batch.items.filter(i => i.identification?.qrCodeDetected).length} QR matched
                          </span>
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            {batch.items.filter(i => i.autoAssigned && !i.identification?.qrCodeDetected).length} name matched
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {batch.items.filter(i => !i.studentId).length} unassigned
                          </span>
                          {batch.items.some(i => i.pageType === 'continuation') && (
                            <span className="flex items-center gap-1">
                              <FileStack className="h-3.5 w-3.5 text-blue-600" />
                              {batch.items.filter(i => i.pageType === 'continuation').length} linked pages
                            </span>
                          )}
                        </div>
                      )}
                      {/* Create Answer Sheet - recommended first step */}
                      <Button
                        variant="outline"
                        className="w-full border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        onClick={() => setShowCreateAnswerSheet(true)}
                        disabled={batch.isProcessing}
                      >
                        <BookOpen className="h-4 w-4 mr-2" />
                        Create Answer Sheet {generatedAnswerSheet ? '✓' : '(Recommended First)'}
                      </Button>
                      
                      <div className="flex gap-3">
                        <Button 
                          variant="outline" 
                          className="flex-1"
                          onClick={batch.clearAll}
                          disabled={batch.isProcessing || batch.isIdentifying}
                        >
                          Clear All
                        </Button>
                        <Button 
                          variant="hero" 
                          className="flex-1"
                          onClick={startBatchAnalysis}
                          disabled={batch.isProcessing || batch.isIdentifying || batch.items.length === 0}
                        >
                          {batch.isProcessing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                              Analyzing {batch.currentIndex + 1}/{batch.items.length}
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Analyze All ({batch.items.length})
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Confidence Analysis Buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 border-blue-500/50 text-blue-700 dark:text-blue-400 hover:bg-blue-500/10"
                          onClick={async () => {
                            toast.info('Running double analysis for higher confidence...', {
                              icon: <ShieldCheck className="h-4 w-4" />,
                              description: 'Each paper will be analyzed twice and grades averaged',
                            });
                            await batch.startConfidenceAnalysis(2, mockRubricSteps);
                            const summary = batch.generateSummary();
                            setShowBatchReport(true);
                            toast.success('Double analysis complete!', {
                              description: `Average score: ${summary.averageScore}%`,
                            });
                          }}
                          disabled={batch.isProcessing || batch.isIdentifying || batch.items.length === 0}
                        >
                          {batch.isProcessing ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              2x Analysis
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 border-purple-500/50 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10"
                          onClick={async () => {
                            toast.info('Running triple analysis for maximum confidence...', {
                              icon: <ShieldCheck className="h-4 w-4" />,
                              description: 'Each paper will be analyzed three times and grades averaged',
                            });
                            await batch.startConfidenceAnalysis(3, mockRubricSteps);
                            const summary = batch.generateSummary();
                            setShowBatchReport(true);
                            toast.success('Triple analysis complete!', {
                              description: `Average score: ${summary.averageScore}%`,
                            });
                          }}
                          disabled={batch.isProcessing || batch.isIdentifying || batch.items.length === 0}
                        >
                          {batch.isProcessing ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              3x Analysis
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Multi-analysis runs AI grading 2-3 times per paper, averages the grades, and shows confidence level
                      </p>
                    </div>
                  )}

                  {/* Show report button if analysis complete */}
                  {batch.items.length > 0 && 
                   batch.items.every(item => item.status === 'completed' || item.status === 'failed') &&
                   !batch.isProcessing && (
                    <Button 
                      variant="default" 
                      className="w-full"
                      onClick={() => {
                        batch.generateSummary();
                        setShowBatchReport(true);
                      }}
                    >
                      View Class Report
                    </Button>
                  )}
                </>
              )}
              </Suspense>
              </ScanResultsErrorBoundary>
            </TabsContent>

            {/* Save for Later Mode */}
            <TabsContent value="saved" className="space-y-4 mt-4">
              <SaveForLaterTab
                pendingScans={pendingScans}
                onRefresh={refreshPendingScans}
                onAnalyzeScan={handleAnalyzeSavedScan}
              />
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>

      {/* Full-screen camera modal */}
      <CameraModal 
        isOpen={scanState === 'camera'}
        onClose={() => {
          setScanState('idle');
          setBatchCameraMode(false);
        }}
        onCapture={handleCameraCapture}
        batchMode={batchCameraMode}
        onBatchComplete={handleBatchCameraComplete}
      />

      {/* Full-screen preview with crop/rotate */}
      {scanState === 'preview' && capturedImage && (
        <ImagePreview
          imageDataUrl={capturedImage}
          onConfirm={handlePreviewConfirm}
          onRetake={handlePreviewRetake}
        />
      )}

      {/* Multi-Student Scanner Modal */}
      {showMultiStudentScanner && (
        <Dialog open={showMultiStudentScanner} onOpenChange={setShowMultiStudentScanner}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <MultiStudentScanner 
              onClose={() => setShowMultiStudentScanner(false)}
              rubricSteps={mockRubricSteps}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Continuous QR Scanner */}
      <ContinuousQRScanner
        isOpen={showContinuousQRScanner}
        onClose={() => setShowContinuousQRScanner(false)}
        studentRoster={singleScanStudents}
        onScanComplete={(scannedStudents) => {
          if (scannedStudents.length > 0) {
            toast.success(`Scanned ${scannedStudents.length} student papers!`, {
              description: 'Students identified and ready for batch processing',
            });
          }
        }}
      />

      {/* Batch Grading Mode Selector Dialog */}
      <Dialog open={showBatchGradingModeSelector} onOpenChange={setShowBatchGradingModeSelector}>
        <DialogContent className="max-w-md">
          <BatchGradingModeSelector
            itemCount={batch.items.length}
            onSelectMode={handleBatchGradingModeSelect}
            onCancel={() => setShowBatchGradingModeSelector(false)}
            isProcessing={batch.isProcessing}
          />
        </DialogContent>
      </Dialog>

      {/* Teacher Answer Key Dialog */}
      <TeacherAnswerKeyDialog
        open={showAnswerKeyDialog}
        onOpenChange={setShowAnswerKeyDialog}
        classId={singleScanClassId || selectedClassId || undefined}
      />

      {/* AI Training Wizard */}
      <AITrainingWizard
        open={showAITrainingWizard}
        onOpenChange={setShowAITrainingWizard}
        onTrainingComplete={() => {
          toast.success('AI training complete! The AI is now calibrated to your grading style.');
        }}
      />

      {/* Google Classroom Import */}
      <GoogleClassroomImport
        open={showGoogleClassroomImport}
        onOpenChange={setShowGoogleClassroomImport}
        onImportComplete={(submissions) => {
          // Add imported submissions to batch queue
          setScanMode('scanner');
          submissions.forEach(sub => {
            if (sub.attachments.length > 0) {
              // For each attachment, show info in toast
              sub.attachments.forEach(att => {
                toast.info(`${sub.studentName}: ${att.title}`, {
                  description: 'Open the link to download and add to batch',
                  action: {
                    label: 'Open',
                    onClick: () => window.open(att.url, '_blank'),
                  },
                });
              });
            }
          });
        }}
      />

      {/* Google Drive Import */}
      <Dialog open={showGoogleDriveImport} onOpenChange={setShowGoogleDriveImport}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import from Google Drive
            </DialogTitle>
          </DialogHeader>
          
          {/* Auto-enhance toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-2">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <Label htmlFor="auto-preprocess-drive" className="text-sm">
                Auto-enhance image quality
              </Label>
            </div>
            <Switch
              id="auto-preprocess-drive"
              checked={autoPreprocess}
              onCheckedChange={setAutoPreprocess}
            />
          </div>
          
          <GoogleDriveImport 
            onFilesSelected={async (files) => {
              setShowGoogleDriveImport(false);
              if (files.length === 0) return;
              
              setIsPreprocessing(true);
              
              try {
                // Separate PDFs from images
                const pdfFiles = files.filter(f => 
                  f.name.toLowerCase().endsWith('.pdf') || 
                  f.blob.type === 'application/pdf'
                );
                const imageFiles = files.filter(f => 
                  !f.name.toLowerCase().endsWith('.pdf') && 
                  f.blob.type !== 'application/pdf'
                );
                
                // Convert PDFs to images
                let allImageBlobs: { blob: Blob; name: string }[] = [...imageFiles];
                
                if (pdfFiles.length > 0) {
                  toast.info(`Converting ${pdfFiles.length} PDF(s) to images...`);
                  
                  for (const pdfFile of pdfFiles) {
                    try {
                      // Convert blob to File for pdfToImages
                      const file = new File([pdfFile.blob], pdfFile.name, { type: 'application/pdf' });
                      const pageImages = await pdfToImages(file, 2, (current, total) => {
                        // Could show progress here
                      });
                      
                      // Convert data URLs back to blobs
                      for (let i = 0; i < pageImages.length; i++) {
                        const response = await fetch(pageImages[i]);
                        const pageBlob = await response.blob();
                        const baseName = pdfFile.name.replace(/\.pdf$/i, '');
                        allImageBlobs.push({
                          blob: pageBlob,
                          name: `${baseName}_page${i + 1}.jpg`
                        });
                      }
                    } catch (err) {
                      console.error(`Error converting PDF ${pdfFile.name}:`, err);
                      toast.error(`Failed to convert PDF: ${pdfFile.name}`);
                    }
                  }
                }
                
                // Preprocess if enabled
                let processedFiles = allImageBlobs;
                if (autoPreprocess && allImageBlobs.length > 0) {
                  toast.info(`Enhancing ${allImageBlobs.length} image(s)...`);
                  processedFiles = await preprocessBatch(
                    allImageBlobs,
                    { ...defaultSettings, autoEnhance: true },
                    (current, total) => {
                      // Progress updates could be shown here
                    }
                  );
                  toast.success('Image enhancement complete');
                }
                
                toast.info(`Processing ${processedFiles.length} image(s) from Drive...`);
                
                for (const file of processedFiles) {
                  try {
                    const dataUrl = await blobToBase64(file.blob);
                    if (singleScanClassId && singleScanStudents.length > 0) {
                      await batch.addImageWithAutoIdentify(dataUrl, singleScanStudents);
                    } else if (selectedClassId && students.length > 0) {
                      await batch.addImageWithAutoIdentify(dataUrl, students);
                    } else {
                      batch.addImage(dataUrl);
                    }
                  } catch (err) {
                    console.error('Error processing Drive file:', err);
                  }
                }
                
                setScanMode('scanner');
                const pdfPageCount = allImageBlobs.length - imageFiles.length;
                const summary = pdfPageCount > 0 
                  ? `Added ${processedFiles.length} image(s) (${pdfPageCount} from PDFs)${autoPreprocess ? ' (enhanced)' : ''}`
                  : `Added ${processedFiles.length} file(s) to batch${autoPreprocess ? ' (enhanced)' : ''}`;
                toast.success(summary);
              } catch (err) {
                console.error('Processing error:', err);
                toast.error('Failed to process files');
              } finally {
                setIsPreprocessing(false);
              }
            }}
            onClose={() => setShowGoogleDriveImport(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Save to Google Drive Dialog */}
      <SaveToDriveDialog
        open={showSaveToDriveDialog}
        onOpenChange={setShowSaveToDriveDialog}
        files={batch.items
          .filter(item => (item.status === 'completed' || item.status === 'pending') && item.imageDataUrl && item.imageDataUrl.length > 100)
          .map((item, index) => {
            try {
              // Convert base64 to blob
              const base64Data = item.imageDataUrl.split(',')[1] || '';
              if (!base64Data) return null;
              const byteString = atob(base64Data);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: 'image/jpeg' });
            
              // Generate meaningful filename
              const studentName = item.studentName?.replace(/\s+/g, '_') || 'Unknown';
              const date = new Date().toISOString().split('T')[0];
              const topicName = item.result?.problemIdentified?.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'Scan';
              const fileName = `${studentName}_${topicName}_${date}_${index + 1}.jpg`;
              
              return { blob, name: fileName };
            } catch (e) {
              console.warn('Failed to convert image for Drive save:', e);
              return null;
            }
          }).filter(Boolean) as { blob: Blob; name: string }[]}
        onSaveComplete={(count, folderName) => {
          setDriveSaved(true);
        }}
      />

      {/* Image Preprocess Dialog */}
      <ImagePreprocessDialog
        open={showPreprocessDialog}
        onOpenChange={setShowPreprocessDialog}
        imageBlob={preprocessingImage?.blob || null}
        imageName={preprocessingImage?.name || 'Image'}
        onProcessed={async (processedBlob) => {
          if (!preprocessingImage) return;
          const dataUrl = await blobToBase64(processedBlob);
          batch.addImage(dataUrl);
          setPreprocessingImage(null);
          toast.success('Enhanced image added to batch');
        }}
      />
    </>
  );
}
