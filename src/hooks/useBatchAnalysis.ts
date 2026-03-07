import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { handleApiError } from '@/lib/apiErrorHandler';
import { useQRScanSettings } from '@/hooks/useQRScanSettings';
import { useDuplicateWorkDetection } from '@/hooks/useDuplicateWorkDetection';
import jsQR from 'jsqr';
import { parseStudentQRCode } from '@/components/print/StudentQRCode';
import { parseAnyStudentQRCode } from '@/components/print/StudentOnlyQRCode';
import { parseUnifiedStudentQRCode } from '@/components/print/StudentPageQRCode';
import { toast } from 'sonner';
import { compressImage } from '@/lib/imageUtils';
import { useGradeFloorSettings } from '@/hooks/useGradeFloorSettings';
import { detectBlankPage } from '@/lib/blankPageDetection';

// ═══════════════════════════════════════════════════════════════════════════════
// RESILIENT EDGE FUNCTION INVOCATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// Wraps supabase.functions.invoke with:
// 1. Automatic retry with exponential backoff for transient failures
// 2. Image compression to reduce payload size
// 3. Better error classification (retryable vs permanent)
// 4. Timeout protection
//
// ═══════════════════════════════════════════════════════════════════════════════

/** Errors that should NOT be retried */
function isPermanentError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || error.toString() || '').toLowerCase();
  // Auth errors, quota errors, and validation errors are permanent
  return (
    msg.includes('unauthorized') ||
    msg.includes('invalid token') ||
    msg.includes('401') ||
    msg.includes('402') ||
    msg.includes('payment') ||
    msg.includes('credit') ||
    msg.includes('quota') ||
    msg.includes('api key') ||
    msg.includes('403') ||
    msg.includes('image data is required')
  );
}

/** Check if response data indicates a permanent error */
function isResponsePermanentError(data: any): boolean {
  if (!data) return false;
  return (
    data.rateLimited === true ||
    data.creditsExhausted === true ||
    data.http_status === 401 ||
    data.http_status === 402 ||
    data.http_status === 403
  );
}

/** Sleep helper */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Compress an image data URL for sending to edge functions.
 * Targets a max dimension of 1200px and JPEG quality of 0.6.
 * Aggressive compression for faster uploads and lower latency.
 */
async function compressForEdgeFunction(imageDataUrl: string): Promise<string> {
  try {
    // Skip compression if already small (less than ~110KB base64)
    if (imageDataUrl.length < 150000) {
      return imageDataUrl;
    }
    const compressed = await compressImage(imageDataUrl, 1200, 0.6);
    const savings = Math.round((1 - compressed.length / imageDataUrl.length) * 100);
    if (savings > 5) {
      console.log(`[compressForEdgeFunction] Compressed image: ${Math.round(imageDataUrl.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB (${savings}% reduction)`);
    }
    return compressed;
  } catch (err) {
    console.warn('[compressForEdgeFunction] Compression failed, using original:', err);
    return imageDataUrl;
  }
}

interface InvokeWithRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  compressImages?: boolean;
  /** Keys in the body that contain base64 image data to compress */
  imageKeys?: string[];
  /** Keys in the body that contain arrays of base64 image data to compress */
  imageArrayKeys?: string[];
}

/**
 * Invoke a Supabase Edge Function with automatic retry and image compression.
 * Retries transient failures (network errors, timeouts, 5xx) with exponential backoff.
 * Does NOT retry permanent failures (auth, quota, validation).
 */
async function invokeWithRetry(
  functionName: string,
  body: Record<string, any>,
  options: InvokeWithRetryOptions = {}
): Promise<{ data: any; error: any }> {
  const {
    maxRetries = 1,
    initialDelayMs = 1500,
    compressImages = true,
    imageKeys = ['imageBase64', 'image1Base64', 'image2Base64', 'answerGuideBase64', 'solutionBase64'],
    imageArrayKeys = ['additionalImages'],
  } = options;

  // Step 1: Compress images in the body to reduce payload size
  let processedBody = { ...body };
  if (compressImages) {
    for (const key of imageKeys) {
      if (processedBody[key] && typeof processedBody[key] === 'string') {
        processedBody[key] = await compressForEdgeFunction(processedBody[key]);
      }
    }
    for (const arrKey of imageArrayKeys) {
      if (Array.isArray(processedBody[arrKey])) {
        processedBody[arrKey] = await Promise.all(
          processedBody[arrKey].map((img: string) =>
            typeof img === 'string' ? compressForEdgeFunction(img) : img
          )
        );
      }
    }
  }

  // Step 2: Attempt invocation with retries
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`[invokeWithRetry] Retry ${attempt}/${maxRetries} for ${functionName} after ${delay}ms`);
        await sleep(delay);
      }

      const invokePromise = supabase.functions.invoke(functionName, {
        body: processedBody,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 65 seconds')), 65000)
      );

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as { data: any; error: any };

      // If there's an error from Supabase client (FunctionsFetchError, FunctionsHttpError, etc.)
      if (error) {
        lastError = error;

        // Don't retry permanent errors
        if (isPermanentError(error)) {
          console.error(`[invokeWithRetry] Permanent error on ${functionName}:`, error.message);
          return { data: null, error };
        }

        // For retryable errors, continue to next attempt
        console.warn(`[invokeWithRetry] Transient error on ${functionName} (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message || error);
        continue;
      }

      // If the response data itself indicates an error
      if (data && !data.success && data.error) {
        // Check if it's a permanent error in the response
        if (isResponsePermanentError(data)) {
          console.error(`[invokeWithRetry] Permanent error in response from ${functionName}:`, data.error);
          return { data, error: null };
        }

        // Rate limit with retry
        if (data.rateLimited) {
          lastError = { message: data.error || 'Rate limited' };
          console.warn(`[invokeWithRetry] Rate limited on ${functionName}, will retry...`);
          // Wait longer for rate limits
          await sleep(initialDelayMs * Math.pow(2, attempt));
          continue;
        }
      }

      // Success!
      return { data, error: null };

    } catch (err: any) {
      lastError = err;

      if (isPermanentError(err)) {
        console.error(`[invokeWithRetry] Permanent exception on ${functionName}:`, err.message);
        return { data: null, error: err };
      }

      console.warn(`[invokeWithRetry] Exception on ${functionName} (attempt ${attempt + 1}/${maxRetries + 1}):`, err.message || err);
    }
  }

  // All retries exhausted
  console.error(`[invokeWithRetry] All ${maxRetries + 1} attempts failed for ${functionName}`);
  return {
    data: null,
    error: lastError || new Error(`Failed to invoke ${functionName} after ${maxRetries + 1} attempts`),
  };
}

/** Delay between batch chunks (reduced for faster flow; increase if hitting rate limits) */
const BATCH_ITEM_DELAY_MS = 800;

/** Number of papers to analyze concurrently in batch mode */
const BATCH_CONCURRENCY = 2;

/** Number of papers to identify concurrently via OCR (no rate limit concerns) */
const IDENTIFY_CONCURRENCY = 5;

const BATCH_STORAGE_KEY = 'scan-genius-batch-data';
const BATCH_SUMMARY_KEY = 'scan-genius-batch-summary';

interface RubricStep {
  step_number: number;
  description: string;
  points: number;
}

interface RubricScore {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface AnalysisResult {
  ocrText: string;
  problemIdentified: string;
  approachAnalysis: string;
  strengthsAnalysis?: string[];
  areasForImprovement?: string[];
  whatStudentDidCorrectly?: string;
  whatStudentGotWrong?: string;
  rubricScores: RubricScore[];
  misconceptions: string[];
  totalScore: { earned: number; possible: number; percentage: number };
  feedback: string;
  grade?: number;
  gradeJustification?: string;
  nysStandard?: string;
  regentsScore?: number;
  regentsScoreJustification?: string;
  // Multi-analysis confidence fields
  multiAnalysisGrades?: number[];
  multiAnalysisResults?: AnalysisResult[]; // Full breakdown of each analysis run
  confidenceScore?: number; // 0-100 based on grade consistency
  isOverridden?: boolean;
  overriddenGrade?: number;
  overrideJustification?: string;
  selectedRunIndex?: number; // Index of manually selected run (instead of average)
  studentWorkPresent?: boolean; // False when blank page detected
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
}

export interface IdentificationResult {
  qrCodeDetected: boolean;
  qrCodeContent: string | null;
  parsedQRCode?: { 
    studentId: string; 
    questionId?: string; 
    pageNumber?: number;
    totalPages?: number;
    type?: 'student-only' | 'student-question' | 'student-page';
  } | null;
  handwrittenName: string | null;
  matchedStudentId: string | null;
  matchedStudentName: string | null;
  matchedQuestionId?: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface HandwritingSimilarity {
  isSameStudent: boolean;
  confidence: 'high' | 'medium' | 'low';
  similarityScore: number;
  reasoning: string;
}

export interface BatchItem {
  id: string;
  imageDataUrl: string;
  studentId?: string;
  studentName?: string;
  questionId?: string;
  status: 'pending' | 'identifying' | 'analyzing' | 'completed' | 'failed' | 'needs-reupload';
  identification?: IdentificationResult;
  autoAssigned?: boolean;
  result?: AnalysisResult;
  error?: string;
  rawAnalysis?: string;
  // Multi-page paper support
  pageType?: 'new' | 'continuation';
  continuationOf?: string; // ID of the primary page this is a continuation of
  continuationPages?: string[]; // IDs of pages that are continuations of this paper
  // QR-detected page info for front/back identification
  pageNumber?: number;
  totalPages?: number;
  // Handwriting similarity info
  handwritingSimilarity?: HandwritingSimilarity;
  // Flag when a continuation is converted to separate paper for individual grading
  wasConvertedFromContinuation?: boolean;
  // Filename for grouping multi-page papers by topic
  filename?: string;
  worksheetTopic?: string; // Parsed topic name from filename (for grouping)
  // Multi-page averaging
  isAveragedResult?: boolean; // True if this result is averaged from multiple papers
  averagedFromIds?: string[]; // IDs of items that were averaged together
}

export interface BatchSummary {
  totalStudents: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  commonMisconceptions: { misconception: string; count: number }[];
  scoreDistribution: { range: string; count: number }[];
}

interface UseBatchAnalysisReturn {
  items: BatchItem[];
  addImage: (imageDataUrl: string, studentId?: string, studentName?: string, filename?: string) => string;
  addImageWithAutoIdentify: (imageDataUrl: string, studentRoster?: Student[]) => Promise<string>;
  addPdfPagesWithAutoGrouping: (
    pages: string[],
    studentRoster: Student[],
    onProgress?: (current: number, total: number, status: string) => void
  ) => Promise<{ pagesAdded: number; studentsIdentified: number; pagesLinked: number }>;
  removeImage: (id: string) => void;
  updateItemStudent: (itemId: string, studentId: string, studentName: string) => void;
  reorderItems: (activeId: string, overId: string) => void;
  clearAll: () => void;
  autoIdentifyAll: (studentRoster: Student[]) => Promise<void>;
  scanAllQRCodes: (studentRoster: Student[]) => Promise<{ matched: number; total: number }>;
  detectPageTypes: () => Promise<{ newPapers: number; continuations: number }>;
  detectMultiPageByHandwriting: () => Promise<{ groupsCreated: number; pagesLinked: number }>;
  groupPagesByStudent: () => { studentsGrouped: number; pagesLinked: number };
  groupPagesByWorksheetTopic: () => { topicsGrouped: number; pagesLinked: number };
  linkContinuation: (continuationId: string, primaryId: string) => void;
  unlinkContinuation: (continuationId: string) => void;
  unlinkAllPages: () => void;
  convertToSeparatePaper: (itemId: string) => void;
  startBatchAnalysis: (rubricSteps?: RubricStep[], assessmentMode?: 'teacher' | 'ai', promptText?: string, answerGuideImage?: string, useLearnedStyle?: boolean) => Promise<void>;
  startConfidenceAnalysis: (analysisCount: 2 | 3, rubricSteps?: RubricStep[], assessmentMode?: 'teacher' | 'ai', promptText?: string) => Promise<void>;
  startTeacherGuidedBatchAnalysis: (answerGuideImage: string, rubricSteps?: RubricStep[]) => Promise<void>;
  reanalyzeItem: (itemId: string, rubricSteps?: RubricStep[], assessmentMode?: 'teacher' | 'ai', promptText?: string) => Promise<BatchItem | null>;
  overrideGrade: (itemId: string, newGrade: number, justification: string) => void;
  selectRunAsGrade: (itemId: string, runIndex: number) => void;
  isProcessing: boolean;
  isIdentifying: boolean;
  isRestoredFromStorage: boolean;
  currentIndex: number;
  summary: BatchSummary | null;
  generateSummary: () => BatchSummary;
  /** Worksheet ID detected from QR code on a scanned paper */
  detectedWorksheetId: string | null;
}

export function useBatchAnalysis(): UseBatchAnalysisReturn {
  const { user } = useAuth();
  const { settings: qrScanSettings } = useQRScanSettings();
  const { gradeFloor: teacherGradeFloor } = useGradeFloorSettings();
  const { checkForDuplicate, quickDuplicateCheck, clearDuplicateCache } = useDuplicateWorkDetection();
  const hasLoadedFromStorage = useRef(false);
  const lastSavedItems = useRef<string>('');
  const lastSavedSummary = useRef<string>('');
  
  // Load initial state from localStorage
  const [items, setItems] = useState<BatchItem[]>(() => {
    try {
      const stored = localStorage.getItem(BATCH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[BatchAnalysis] Restored ${parsed.length} items from session`);
          hasLoadedFromStorage.current = true;
          lastSavedItems.current = stored;
          // Mark items with missing image data as needs-reupload instead of pending
          return parsed.map((item: BatchItem) => ({
            ...item,
            status: (!item.imageDataUrl || item.imageDataUrl.length < 100)
              ? 'needs-reupload' as const
              : item.status,
          }));
        }
      }
    } catch (e) {
      console.error('[BatchAnalysis] Failed to restore batch data:', e);
    }
    return [];
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  // Load summary from localStorage
  const [summary, setSummary] = useState<BatchSummary | null>(() => {
    try {
      const storedSummary = localStorage.getItem(BATCH_SUMMARY_KEY);
      if (storedSummary) {
        const parsed = JSON.parse(storedSummary);
        console.log('[BatchAnalysis] Restored summary from session');
        lastSavedSummary.current = storedSummary;
        return parsed;
      }
    } catch (e) {
      console.error('[BatchAnalysis] Failed to restore summary:', e);
    }
    return null;
  });

  // Persist items to localStorage when they change - strip imageDataUrl to avoid QuotaExceededError
  useEffect(() => {
    try {
      if (items.length > 0) {
        // Strip base64 image data before persisting - it's too large for localStorage (~5MB limit)
        const itemsForStorage = items.map(item => ({
          ...item,
          imageDataUrl: '', // Don't persist images - they're too large
        }));
        const serialized = JSON.stringify(itemsForStorage);
        if (serialized !== lastSavedItems.current) {
          console.log(`[BatchAnalysis] Persisting ${items.length} items to localStorage (images stripped)`);
          localStorage.setItem(BATCH_STORAGE_KEY, serialized);
          lastSavedItems.current = serialized;
        }
      } else if (lastSavedItems.current !== '') {
        // Only clear if we previously had data (prevents clearing on initial empty load)
        console.log('[BatchAnalysis] Clearing items from localStorage');
        localStorage.removeItem(BATCH_STORAGE_KEY);
        localStorage.removeItem(BATCH_SUMMARY_KEY);
        lastSavedItems.current = '';
        lastSavedSummary.current = '';
      }
    } catch (e) {
      console.error('[BatchAnalysis] Failed to persist batch data:', e);
    }
  }, [items]);

  // Persist summary to localStorage when it changes
  useEffect(() => {
    try {
      const serialized = summary ? JSON.stringify(summary) : '';
      
      if (serialized !== lastSavedSummary.current) {
        if (summary) {
          console.log('[BatchAnalysis] Persisting summary to localStorage');
          localStorage.setItem(BATCH_SUMMARY_KEY, serialized);
          lastSavedSummary.current = serialized;
        } else if (lastSavedSummary.current !== '') {
          console.log('[BatchAnalysis] Clearing summary from localStorage');
          localStorage.removeItem(BATCH_SUMMARY_KEY);
          lastSavedSummary.current = '';
        }
      }
    } catch (e) {
      console.error('[BatchAnalysis] Failed to persist summary:', e);
    }
  }, [summary]);

  // Auto-regenerate summary on mount if we have completed items but no summary
  useEffect(() => {
    const completedItems = items.filter(item => item.status === 'completed' && item.result);
    if (completedItems.length > 0 && !summary) {
      console.log('Auto-regenerating summary for restored items');
      // Delay to ensure state is fully initialized
      setTimeout(() => {
        const validScores = completedItems
          .map(item => item.result?.grade ?? item.result?.totalScore?.percentage)
          .filter((s): s is number => typeof s === 'number' && !isNaN(s));

        if (validScores.length > 0) {
          const avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
          const highScore = Math.max(...validScores);
          const lowScore = Math.min(...validScores);
          const passCount = validScores.filter(s => s >= 65).length;
          
          const misconceptionCounts: Record<string, number> = {};
          completedItems.forEach(item => {
            (item.result?.misconceptions || []).forEach(m => {
              misconceptionCounts[m] = (misconceptionCounts[m] || 0) + 1;
            });
          });
          
          const ranges = [
            { range: '0-59%', min: 0, max: 59 },
            { range: '60-69%', min: 60, max: 69 },
            { range: '70-79%', min: 70, max: 79 },
            { range: '80-89%', min: 80, max: 89 },
            { range: '90-100%', min: 90, max: 100 },
          ];
          
          setSummary({
            totalStudents: completedItems.length,
            averageScore: Math.round(avgScore * 10) / 10,
            highestScore: highScore,
            lowestScore: lowScore,
            passRate: Math.round((passCount / validScores.length) * 100),
            commonMisconceptions: Object.entries(misconceptionCounts)
              .map(([misconception, count]) => ({ misconception, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5),
            scoreDistribution: ranges.map(({ range, min, max }) => ({
              range,
              count: validScores.filter(s => s >= min && s <= max).length,
            })),
          });
        }
      }, 100);
    }
  }, []); // Only run on mount

  // Apply grade curve to a result
  const applyGradeCurve = useCallback((result: AnalysisResult): AnalysisResult => {
    const curvePercent = qrScanSettings.gradeCurvePercent || 0;
    if (curvePercent <= 0) return result;

    const newPercentage = Math.min(100, result.totalScore.percentage + curvePercent);
    const newGrade = result.grade ? Math.min(100, result.grade + curvePercent) : undefined;

    return {
      ...result,
      totalScore: {
        ...result.totalScore,
        percentage: newPercentage,
      },
      grade: newGrade,
      gradeJustification: result.gradeJustification 
        ? `${result.gradeJustification} (Grade curved +${curvePercent}%)`
        : `Grade curved +${curvePercent}%`,
    };
  }, [qrScanSettings.gradeCurvePercent]);

  // Parse worksheet topic from filename (removes extension, page numbers, cleans up)
  const parseWorksheetTopic = useCallback((filename: string): string => {
    if (!filename) return '';
    // Remove file extension
    let name = filename.replace(/\.[^/.]+$/, '');
    // Remove page numbers like _0001, _0002, (1), (2), -page1, page 2, etc.
    name = name.replace(/[_\-\s]*(page\s*)?\d{1,4}$/i, '');
    name = name.replace(/\(\d+\)$/, '');
    name = name.replace(/_+$/, '');
    // Replace underscores with spaces
    name = name.replace(/_/g, ' ');
    // Clean up multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    return name.toLowerCase() || filename.toLowerCase();
  }, []);

  const addImage = useCallback((imageDataUrl: string, studentId?: string, studentName?: string, filename?: string): string => {
    const id = crypto.randomUUID();
    const worksheetTopic = filename ? parseWorksheetTopic(filename) : undefined;
    const newItem: BatchItem = {
      id,
      imageDataUrl,
      studentId,
      studentName: studentName || undefined,
      status: 'pending',
      filename,
      worksheetTopic,
    };
    setItems(prev => [...prev, newItem]);
    return id;
  }, [parseWorksheetTopic]);

  // Auto-identify a single newly added image
  const autoIdentifySingle = useCallback(async (itemId: string, studentRoster: Student[]) => {
    if (studentRoster.length === 0) return;

    // Mark as identifying
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, status: 'identifying' } : item
    ));

    const item = items.find(i => i.id === itemId) || { id: itemId, imageDataUrl: '', status: 'pending' as const };
    
    // We need to get the item from current state, use a ref pattern or fetch from latest
    setItems(prev => {
      const currentItem = prev.find(i => i.id === itemId);
      if (!currentItem) return prev;
      
      // Start async identification
      (async () => {
        const result = await identifyStudent(currentItem, studentRoster);
        setItems(p => p.map(i => i.id === itemId ? result : i));
      })();
      
      return prev;
    });
  }, []);

  // Add image and auto-identify if roster provided
  // IMPORTANT: Uses local QR scanning first (fast & reliable), falls back to AI vision only when needed
  const addImageWithAutoIdentify = useCallback(async (imageDataUrl: string, studentRoster?: Student[]): Promise<string> => {
    const id = crypto.randomUUID();
    console.log(`[addImageWithAutoIdentify] Adding image, roster size: ${studentRoster?.length ?? 0}`);
    
    const newItem: BatchItem = {
      id,
      imageDataUrl,
      status: studentRoster && studentRoster.length > 0 ? 'identifying' : 'pending',
    };
    
    setItems(prev => [...prev, newItem]);

    // Auto-identify if roster is provided
    if (studentRoster && studentRoster.length > 0) {
      try {
        console.log(`[addImageWithAutoIdentify] Starting identification for image ${id}`);
        
        // STEP 1: Try local QR scan first (fast & reliable using jsQR)
        const qrResult = await scanQRCodeFromImage(imageDataUrl);
        
        if (qrResult && qrResult.studentId) {
          console.log(`[addImageWithAutoIdentify] Local QR scan found student: ${qrResult.studentId}, type: ${qrResult.type}`);
          
          // Match against roster
          const matchedStudent = studentRoster.find(s => s.id === qrResult.studentId);
          
          if (matchedStudent) {
            console.log(`[addImageWithAutoIdentify] QR matched to roster: ${matchedStudent.first_name} ${matchedStudent.last_name}`);
            
            // SUCCESS: QR code found and matched - skip expensive AI call!
            const identifiedItem: BatchItem = {
              ...newItem,
              status: 'pending',
              studentId: matchedStudent.id,
              studentName: `${matchedStudent.first_name} ${matchedStudent.last_name}`,
              questionId: qrResult.questionId,
              pageNumber: qrResult.pageNumber,
              totalPages: qrResult.totalPages,
              autoAssigned: true,
              identification: {
                qrCodeDetected: true,
                qrCodeContent: JSON.stringify(qrResult),
                parsedQRCode: qrResult,
                handwrittenName: null,
                matchedStudentId: matchedStudent.id,
                matchedStudentName: `${matchedStudent.first_name} ${matchedStudent.last_name}`,
                matchedQuestionId: qrResult.questionId || null,
                confidence: 'high',
              },
            };
            
            setItems(prev => prev.map(item => item.id === id ? identifiedItem : item));
            return id;
          } else {
            console.log(`[addImageWithAutoIdentify] QR student ID ${qrResult.studentId} not found in roster, will try AI vision`);
          }
        } else {
          console.log(`[addImageWithAutoIdentify] No QR code detected locally, falling back to AI vision`);
        }
        
        // STEP 2: QR not found or not matched - use AI vision for handwriting recognition
        const result = await identifyStudent(newItem, studentRoster);
        console.log(`[addImageWithAutoIdentify] AI identification complete for ${id}: ${result.studentName || 'no match'}`);
        setItems(prev => prev.map(item => item.id === id ? result : item));
      } catch (err: any) {
        console.error('[addImageWithAutoIdentify] Auto-identify failed:', err);
        // The page was already added, just update status to pending
        setItems(prev => prev.map(item => 
          item.id === id ? { ...item, status: 'pending' } : item
        ));
      }
    }

    return id;
  }, []);

  // Add multiple PDF pages with automatic student separation based on handwriting/name detection
  const addPdfPagesWithAutoGrouping = useCallback(async (
    pages: string[],
    studentRoster: Student[],
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<{ pagesAdded: number; studentsIdentified: number; pagesLinked: number }> => {
    console.log(`[addPdfPagesWithAutoGrouping] Starting with ${pages.length} pages and ${studentRoster.length} students`);
    
    if (pages.length === 0) {
      console.log('[addPdfPagesWithAutoGrouping] No pages to process');
      return { pagesAdded: 0, studentsIdentified: 0, pagesLinked: 0 };
    }

    if (studentRoster.length === 0) {
      console.warn('[addPdfPagesWithAutoGrouping] No students in roster - pages will be added without identification');
    } else {
      console.log('[addPdfPagesWithAutoGrouping] Roster sample:', 
        studentRoster.slice(0, 3).map(s => `${s.first_name} ${s.last_name} (${s.id})`));
    }

    setIsIdentifying(true);
    
    // Structure to track student groups as we process pages
    interface StudentGroup {
      primaryId: string;
      studentId?: string;
      studentName?: string;
      pageIds: string[];
    }
    
    const studentGroups: StudentGroup[] = [];
    let currentGroup: StudentGroup | null = null;
    let studentsIdentified = 0;
    let pagesLinked = 0;
    const newItems: BatchItem[] = [];

    try {

    for (let i = 0; i < pages.length; i++) {
      const pageDataUrl = pages[i];
      const pageId = crypto.randomUUID();
      
      console.log(`[addPdfPagesWithAutoGrouping] Processing page ${i + 1}/${pages.length}`);
      onProgress?.(i + 1, pages.length, i === 0 ? 'Scanning for QR codes...' : 'Processing page...');
      
      // Create base item
      const baseItem: BatchItem = {
        id: pageId,
        imageDataUrl: pageDataUrl,
        status: 'pending',
      };
      
      // First, try QR code detection for page-based grouping
      let qrResult = null;
      try {
        qrResult = await scanQRCodeFromImage(pageDataUrl);
        if (qrResult) {
          console.log(`[addPdfPagesWithAutoGrouping] QR code found:`, qrResult.type, qrResult.studentId);
        }
      } catch (qrError) {
        console.warn('[addPdfPagesWithAutoGrouping] QR scan failed:', qrError);
      }
      
      if (qrResult && qrResult.studentId) {
        // We have a student ID from QR code - use it for grouping regardless of QR type
        const matchedStudent = studentRoster.find(s => s.id === qrResult.studentId);
        
        // Check if this student already has a group (handles interleaved pages: A, B, A)
        const existingGroup = studentGroups.find(g => g.studentId === qrResult.studentId);
        
        const isPageType = qrResult.type === 'student-page' && qrResult.pageNumber !== undefined;
        const isContinuation = isPageType ? qrResult.pageNumber > 1 : !!existingGroup;
        
        if (existingGroup && isContinuation) {
          // This is a continuation page for an already-seen student
          pagesLinked++;
          existingGroup.pageIds.push(pageId);
          
          newItems.push({
            ...baseItem,
            pageType: 'continuation',
            continuationOf: existingGroup.primaryId,
            pageNumber: qrResult.pageNumber,
            totalPages: qrResult.totalPages,
            studentId: matchedStudent?.id || existingGroup.studentId,
            studentName: matchedStudent ? `${matchedStudent.first_name} ${matchedStudent.last_name}` : existingGroup.studentName,
            autoAssigned: true,
            identification: {
              qrCodeDetected: true,
              qrCodeContent: JSON.stringify(qrResult),
              parsedQRCode: qrResult,
              handwrittenName: null,
              matchedStudentId: matchedStudent?.id || null,
              matchedStudentName: matchedStudent ? `${matchedStudent.first_name} ${matchedStudent.last_name}` : null,
              confidence: 'high',
            },
          });
          currentGroup = existingGroup;
        } else {
          // First page for this student (or page 1 of student-page type)
          if (matchedStudent) studentsIdentified++;
          
          currentGroup = {
            primaryId: pageId,
            studentId: matchedStudent?.id || qrResult.studentId,
            studentName: matchedStudent ? `${matchedStudent.first_name} ${matchedStudent.last_name}` : undefined,
            pageIds: [pageId],
          };
          
          newItems.push({
            ...baseItem,
            pageType: 'new',
            pageNumber: qrResult.pageNumber,
            totalPages: qrResult.totalPages,
            studentId: matchedStudent?.id || qrResult.studentId,
            studentName: matchedStudent ? `${matchedStudent.first_name} ${matchedStudent.last_name}` : undefined,
            autoAssigned: !!matchedStudent,
            identification: {
              qrCodeDetected: true,
              qrCodeContent: JSON.stringify(qrResult),
              parsedQRCode: qrResult,
              handwrittenName: null,
              matchedStudentId: matchedStudent?.id || null,
              matchedStudentName: matchedStudent ? `${matchedStudent.first_name} ${matchedStudent.last_name}` : null,
              confidence: matchedStudent ? 'high' : 'low',
            },
          });
          studentGroups.push(currentGroup);
        }
        continue;
      }
      
      // Fall back to handwriting-based grouping
      if (i === 0) {
        // First page - always identify student
        onProgress?.(i + 1, pages.length, 'Identifying first student...');
        try {
          const identResult = await identifyStudent(baseItem, studentRoster);
          
          currentGroup = {
            primaryId: pageId,
            studentId: identResult.studentId,
            studentName: identResult.studentName,
            pageIds: [pageId],
          };
          
          if (identResult.studentId) studentsIdentified++;
          
          newItems.push({
            ...identResult,
            pageType: 'new',
          });
          studentGroups.push(currentGroup);
        } catch (err) {
          console.error('First page identification failed:', err);
          currentGroup = {
            primaryId: pageId,
            pageIds: [pageId],
          };
          newItems.push({
            ...baseItem,
            pageType: 'new',
          });
          studentGroups.push(currentGroup);
        }
      } else {
        // Subsequent pages - check handwriting similarity with previous page
        const previousItem = newItems[i - 1];
        
        // Handwriting similarity detection disabled — treat each page as a new paper
        // Teachers can manually link front/back pages using the existing link button
        onProgress?.(i + 1, pages.length, 'Identifying student...');
        
        try {
          const identResult = await identifyStudent(baseItem, studentRoster);
          
          // Check ALL existing groups for this student (handles interleaved pages)
          const existingGroupForStudent = identResult.studentId 
            ? studentGroups.find(g => g.studentId === identResult.studentId)
            : null;
          
          if (existingGroupForStudent) {
            pagesLinked++;
            existingGroupForStudent.pageIds.push(pageId);
            
            newItems.push({
              ...identResult,
              pageType: 'continuation',
              continuationOf: existingGroupForStudent.primaryId,
            });
            currentGroup = existingGroupForStudent;
          } else {
            if (identResult.studentId) studentsIdentified++;
            currentGroup = {
              primaryId: pageId,
              studentId: identResult.studentId,
              studentName: identResult.studentName,
              pageIds: [pageId],
            };
            newItems.push({
              ...identResult,
              pageType: 'new',
            });
            studentGroups.push(currentGroup);
          }
        } catch (err) {
          console.error('Student identification failed:', err);
          currentGroup = {
            primaryId: pageId,
            pageIds: [pageId],
          };
          newItems.push({
            ...baseItem,
            pageType: 'new',
          });
          studentGroups.push(currentGroup);
        }
      }
    }

    // Update continuation pages lists for primary items
    const finalItems = newItems.map(item => {
      if (item.pageType === 'new') {
        const group = studentGroups.find(g => g.primaryId === item.id);
        if (group && group.pageIds.length > 1) {
          return {
            ...item,
            continuationPages: group.pageIds.slice(1),
          };
        }
      }
      return item;
    });

    console.log(`[addPdfPagesWithAutoGrouping] Complete: ${finalItems.length} pages, ${studentsIdentified} identified, ${pagesLinked} linked`);
    
    // Add all items to the batch
    setItems(prev => [...prev, ...finalItems]);
    setIsIdentifying(false);

    return {
      pagesAdded: finalItems.length,
      studentsIdentified,
      pagesLinked,
    };
    } catch (outerError: any) {
      console.error('[addPdfPagesWithAutoGrouping] Outer error:', outerError);
      toast.error('Error processing PDF pages', {
        description: outerError?.message || 'Some pages may not have been added. Please try again.',
      });
      
      // Still try to add any pages that were successfully processed
      if (newItems.length > 0) {
        console.log(`[addPdfPagesWithAutoGrouping] Saving ${newItems.length} pages despite error`);
        setItems(prev => [...prev, ...newItems]);
      }
      
      setIsIdentifying(false);
      return {
        pagesAdded: newItems.length,
        studentsIdentified,
        pagesLinked,
      };
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateItemStudent = useCallback((itemId: string, studentId: string, studentName: string) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, studentId, studentName, autoAssigned: false } : item
    ));
  }, []);

  const clearAll = useCallback(() => {
    console.log('[BatchAnalysis] Clearing all data');
    setItems([]);
    setSummary(null);
    setCurrentIndex(-1);
    // Clear persisted data explicitly
    try {
      localStorage.removeItem(BATCH_STORAGE_KEY);
      localStorage.removeItem(BATCH_SUMMARY_KEY);
      lastSavedItems.current = '';
      lastSavedSummary.current = '';
    } catch (e) {
      console.error('[BatchAnalysis] Failed to clear batch data:', e);
    }
    // Clear duplicate detection cache for fresh batch
    clearDuplicateCache();
  }, [clearDuplicateCache]);

  // Local QR code scanning function - supports student-only, student+question, and student+page QR codes
  const scanQRCodeFromImage = async (imageDataUrl: string): Promise<{ studentId: string; questionId?: string; pageNumber?: number; totalPages?: number; type: 'student-only' | 'student-question' | 'student-page' } | null> => {
    return new Promise((resolve) => {
      // Add timeout to prevent hanging on large/broken images
      const timeoutId = setTimeout(() => {
        console.warn('[scanQRCodeFromImage] Timed out after 10s');
        resolve(null);
      }, 10000);

      const img = new Image();
      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          
          // Limit canvas size for very large images to prevent memory issues
          const maxDim = 3000;
          let drawWidth = img.width;
          let drawHeight = img.height;
          if (drawWidth > maxDim || drawHeight > maxDim) {
            const scale = maxDim / Math.max(drawWidth, drawHeight);
            drawWidth = Math.floor(drawWidth * scale);
            drawHeight = Math.floor(drawHeight * scale);
            console.log(`[scanQRCodeFromImage] Scaling image from ${img.width}x${img.height} to ${drawWidth}x${drawHeight}`);
          }
          
          canvas.width = drawWidth;
          canvas.height = drawHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.warn('[scanQRCodeFromImage] Failed to get canvas context');
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
          
          // Calculate region sizes based on image dimensions
          const cornerSize = Math.max(200, Math.min(500, Math.floor(drawWidth / 2.5)));
          const edgeWidth = Math.max(150, Math.min(400, Math.floor(drawWidth / 3)));
          
          // Try scanning different regions - TOP-RIGHT FIRST (where student QR is placed)
          const regions = [
            // TOP-RIGHT CORNER (PRIMARY - StudentOnlyQRCode placement)
            { x: Math.max(0, drawWidth - cornerSize), y: 0, w: cornerSize, h: cornerSize },
            // Top edge full width (header area)
            { x: 0, y: 0, w: drawWidth, h: Math.min(400, Math.floor(drawHeight / 3)) },
            // Top-left corner (for question QRs)
            { x: 0, y: 0, w: cornerSize, h: cornerSize },
            // Right edge full height
            { x: Math.max(0, drawWidth - edgeWidth), y: 0, w: edgeWidth, h: drawHeight },
            // Upper half of image
            { x: 0, y: 0, w: drawWidth, h: Math.floor(drawHeight / 2) },
            // Bottom corners (legacy support)
            { x: Math.max(0, drawWidth - cornerSize), y: Math.max(0, drawHeight - cornerSize), w: cornerSize, h: cornerSize },
            { x: 0, y: Math.max(0, drawHeight - cornerSize), w: cornerSize, h: cornerSize },
            // Full image (final fallback)
            { x: 0, y: 0, w: drawWidth, h: drawHeight },
          ];

          for (const region of regions) {
            try {
              // Ensure region dimensions are valid (> 0)
              if (region.w <= 0 || region.h <= 0) continue;
              
              const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
              const code = jsQR(imageData.data, region.w, region.h, {
                inversionAttempts: 'attemptBoth',
              });
              
              if (code && code.data) {
                console.log(`[scanQRCodeFromImage] QR code found in region (${region.x},${region.y},${region.w},${region.h}): ${code.data.substring(0, 80)}`);
                
                // Try unified parser first (handles v1, v2, and v3 with page numbers)
                const fullUnified = parseUnifiedStudentQRCode(code.data);
                if (fullUnified) {
                  console.log('[scanQRCodeFromImage] Parsed as unified:', fullUnified.type);
                  resolve(fullUnified);
                  return;
                }
                
                // Fallback to v2 parser
                const unified = parseAnyStudentQRCode(code.data);
                if (unified) {
                  console.log('[scanQRCodeFromImage] Parsed as v2:', unified.type);
                  resolve(unified);
                  return;
                }
                
                // Fallback to legacy v1 parser
                const parsed = parseStudentQRCode(code.data);
                if (parsed) {
                  console.log('[scanQRCodeFromImage] Parsed as v1 student-question');
                  resolve({ ...parsed, type: 'student-question' as const });
                  return;
                }
                
                // QR found but not a student QR - log for debugging
                console.log('[scanQRCodeFromImage] QR found but not a student QR code:', code.data.substring(0, 100));
              }
            } catch (e) {
              // Continue to next region
            }
          }

          console.log('[scanQRCodeFromImage] No student QR code found in any region');
          resolve(null);
        } catch (err) {
          console.error('[scanQRCodeFromImage] Error processing image:', err);
          resolve(null);
        }
      };

      img.onerror = (err) => {
        clearTimeout(timeoutId);
        console.error('[scanQRCodeFromImage] Image failed to load:', err);
        resolve(null);
      };
      img.src = imageDataUrl;
    });
  };

  // Batch QR code scanning - fast local scanning
  const scanAllQRCodes = useCallback(async (studentRoster: Student[]): Promise<{ matched: number; total: number }> => {
    if (items.length === 0 || isIdentifying || isProcessing) {
      return { matched: 0, total: 0 };
    }

    setIsIdentifying(true);
    let matchedCount = 0;

    for (let i = 0; i < items.length; i++) {
      // Skip already assigned items with high confidence
      if (items[i].identification?.confidence === 'high' && items[i].studentId) {
        matchedCount++;
        continue;
      }

      setCurrentIndex(i);
      
      // Mark as identifying
      setItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'identifying' } : item
      ));

      // Try local QR scan first (fast)
      const qrResult = await scanQRCodeFromImage(items[i].imageDataUrl);
      
      if (qrResult) {
        // Find matching student from roster
        const matchedStudent = studentRoster.find(s => s.id === qrResult.studentId);
        
        if (matchedStudent) {
          matchedCount++;
          setItems(prev => prev.map((item, idx) => 
            idx === i ? {
              ...item,
              status: 'pending',
              studentId: matchedStudent.id,
              studentName: `${matchedStudent.first_name} ${matchedStudent.last_name}`,
              questionId: qrResult.questionId,
              pageNumber: qrResult.pageNumber,
              totalPages: qrResult.totalPages,
              autoAssigned: true,
              identification: {
                qrCodeDetected: true,
                qrCodeContent: JSON.stringify(qrResult),
                parsedQRCode: qrResult,
                handwrittenName: null,
                matchedStudentId: matchedStudent.id,
                matchedStudentName: `${matchedStudent.first_name} ${matchedStudent.last_name}`,
                matchedQuestionId: qrResult.questionId,
                confidence: 'high',
              },
            } : item
          ));
        } else {
          // QR detected but student not in roster
          setItems(prev => prev.map((item, idx) => 
            idx === i ? {
              ...item,
              status: 'pending',
              questionId: qrResult.questionId,
              identification: {
                qrCodeDetected: true,
                qrCodeContent: JSON.stringify(qrResult),
                parsedQRCode: qrResult,
                handwrittenName: null,
                matchedStudentId: null,
                matchedStudentName: null,
                matchedQuestionId: qrResult.questionId,
                confidence: 'low',
              },
            } : item
          ));
        }
      } else {
        // No QR found, mark as pending
        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'pending' } : item
        ));
      }
    }

    setCurrentIndex(-1);
    setIsIdentifying(false);
    
    return { matched: matchedCount, total: items.length };
  }, [items, isIdentifying, isProcessing]);

  const identifyStudent = async (item: BatchItem, studentRoster: Student[]): Promise<BatchItem> => {
    try {
      // Guard: skip items with no image data
      if (!item.imageDataUrl || item.imageDataUrl.length < 100) {
        console.warn(`[identifyStudent] Skipping item ${item.id}: no image data`);
        return { ...item, status: 'pending' };
      }
      console.log(`[identifyStudent] Starting identification with ${studentRoster.length} students in roster`);
      console.log(`[identifyStudent] Roster sample:`, studentRoster.slice(0, 3).map(s => `${s.first_name} ${s.last_name}`));
      const { data, error } = await invokeWithRetry('analyze-student-work', {
        imageBase64: item.imageDataUrl,
        identifyOnly: true,
        studentRoster: studentRoster.map(s => ({
          id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          student_id: s.student_id,
        })),
      }, { maxRetries: 0 });

      if (error) {
        console.error('[identifyStudent] Edge function error:', error);
        throw new Error(error.message || 'Edge function request failed');
      }
      
      if (!data?.success) {
        console.error('[identifyStudent] Identification failed:', data?.error);
        throw new Error(data?.error || 'Identification failed');
      }

      const identification = data.identification as IdentificationResult;
      console.log(`[identifyStudent] Result: matched=${identification.matchedStudentName}, confidence=${identification.confidence}`);
      
      return {
        ...item,
        status: 'pending',
        identification,
        studentId: identification.matchedStudentId || item.studentId,
        studentName: identification.matchedStudentName || item.studentName,
        questionId: identification.matchedQuestionId || item.questionId,
        autoAssigned: !!identification.matchedStudentId,
      };
    } catch (err: any) {
      console.error('[identifyStudent] Error:', err?.message || err);
      // Show a toast for visibility
      toast.error(`Student identification failed: ${err?.message || 'Unknown error'}`, {
        description: 'The page was added but not matched to a student. You can manually assign it.',
        duration: 5000,
      });
      return {
        ...item,
        status: 'pending',
        identification: {
          qrCodeDetected: false,
          qrCodeContent: null,
          parsedQRCode: null,
          handwrittenName: null,
          matchedStudentId: null,
          matchedStudentName: null,
          matchedQuestionId: null,
          confidence: 'none',
        },
      };
    }
  };

  const autoIdentifyAll = useCallback(async (studentRoster: Student[]) => {
    if (items.length === 0 || isIdentifying || isProcessing) return;
    if (studentRoster.length === 0) return;

    setIsIdentifying(true);

    // Identify items that need identification (no QR match yet)
    const unassigned = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.studentId && item.imageDataUrl && item.imageDataUrl.length > 100);

    // Mark all as identifying
    setItems(prev => prev.map((item, idx) => 
      unassigned.some(u => u.idx === idx) ? { ...item, status: 'identifying' } : item
    ));

    // Process in parallel batches using batch OCR endpoint
    for (let batchStart = 0; batchStart < unassigned.length; batchStart += IDENTIFY_CONCURRENCY) {
      const batch = unassigned.slice(batchStart, batchStart + IDENTIFY_CONCURRENCY);
      setCurrentIndex(batch[0].idx);

      try {
        // Use batch identify endpoint — sends all images in one request for parallel OCR
        const { data, error } = await invokeWithRetry('analyze-student-work', {
          batchIdentify: true,
          images: batch.map(({ item }) => ({
            id: item.id,
            imageBase64: item.imageDataUrl,
          })),
          studentRoster: studentRoster.map(s => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            student_id: s.student_id,
          })),
        }, { maxRetries: 1, imageKeys: [], imageArrayKeys: [] });

        if (error || !data?.success) {
          console.error('[autoIdentifyAll] Batch identify failed, falling back to individual:', error?.message || data?.error);
          // Fallback: identify individually
          const results = await Promise.all(
            batch.map(({ item }) => identifyStudent(item, studentRoster))
          );
          setItems(prev => {
            const updated = [...prev];
            batch.forEach(({ idx }, i) => { updated[idx] = results[i]; });
            return updated;
          });
        } else {
          // Apply batch results
          const resultMap = new Map<string, any>();
          for (const r of data.results) {
            resultMap.set(r.id, r.identification);
          }

          setItems(prev => prev.map(item => {
            const identification = resultMap.get(item.id) as IdentificationResult | undefined;
            if (!identification) return item;
            return {
              ...item,
              status: 'pending' as const,
              identification,
              studentId: identification.matchedStudentId || item.studentId,
              studentName: identification.matchedStudentName || item.studentName,
              questionId: identification.matchedQuestionId || item.questionId,
              autoAssigned: !!identification.matchedStudentId,
            };
          }));

          console.log(`[autoIdentifyAll] Batch ${batchStart / IDENTIFY_CONCURRENCY + 1}: ${data.results.filter((r: any) => r.identification.matchedStudentId).length}/${batch.length} matched in ${data.latencyMs}ms`);
        }
      } catch (err: any) {
        console.error('[autoIdentifyAll] Batch error:', err);
        // Mark remaining as pending
        setItems(prev => prev.map(item => 
          batch.some(b => b.item.id === item.id) && item.status === 'identifying'
            ? { ...item, status: 'pending' as const }
            : item
        ));
      }
    }

    setCurrentIndex(-1);
    setIsIdentifying(false);
  }, [items, isIdentifying, isProcessing]);

  const analyzeItem = async (item: BatchItem, rubricSteps?: RubricStep[], assessmentMode?: 'teacher' | 'ai', promptText?: string): Promise<BatchItem> => {
    try {
      // Guard: skip items with no image data (e.g. restored from localStorage with stripped images)
      if (!item.imageDataUrl || item.imageDataUrl.length < 100) {
        console.warn(`[analyzeItem] Skipping item ${item.id}: no image data`);
        return {
          ...item,
          status: 'needs-reupload' as const,
          error: 'Image data missing — please re-upload this paper',
        };
      }
      // Check for duplicate work before spending AI credits
      if (item.studentId && item.questionId) {
        const duplicateCheck = await checkForDuplicate(
          item.studentId,
          item.questionId,
          undefined, // We don't have OCR text yet
          item.imageDataUrl
        );

        if (duplicateCheck.isDuplicate) {
          const gradeInfo = duplicateCheck.existingGrade 
            ? `${duplicateCheck.existingGrade}%` 
            : 'recorded';
          toast.info(
            `Skipping duplicate: ${item.studentName || 'Student'}'s work already analyzed (${gradeInfo})`,
            { duration: 3000 }
          );
          return {
            ...item,
            status: 'completed',
            result: {
              ocrText: '',
              problemIdentified: 'Duplicate work - previously analyzed',
              approachAnalysis: 'This work was already analyzed in a previous scan.',
              rubricScores: [],
              misconceptions: [],
              totalScore: { 
                earned: duplicateCheck.existingGrade ? Math.round(duplicateCheck.existingGrade / 10) : 0, 
                possible: 10, 
                percentage: duplicateCheck.existingGrade || 0 
              },
              feedback: `This work was already analyzed${duplicateCheck.createdAt ? ` on ${new Date(duplicateCheck.createdAt).toLocaleDateString()}` : ''}.`,
              grade: duplicateCheck.existingGrade,
              gradeJustification: 'Duplicate submission - using previous grade',
            },
          };
        }
      }

      // Quick session-level duplicate check (catches rescans in same session)
      const quickCheck = await quickDuplicateCheck(
        item.studentId || 'unknown',
        item.questionId,
        item.imageDataUrl
      );

      if (quickCheck.isDuplicate) {
        toast.info(
          `Skipping: Same image already processed this session`,
          { duration: 2000 }
        );
        return {
          ...item,
          status: 'failed',
          error: 'Duplicate image in this batch - already processed',
        };
      }

      // Blank page guard for single-item analysis (non-continuation path)
      // Run a quick OCR to check for blank pages before calling the grading AI
      let singleOcrText: string | null = null;
      try {
        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-student-work', {
          body: { imageBase64: item.imageDataUrl },
        });
        if (!ocrError && ocrData?.success && ocrData?.ocrText) {
          singleOcrText = ocrData.ocrText;
        }
      } catch { /* OCR failed, continue to AI */ }

      // Strip common header/boilerplate words before checking for student work
      const headerStripped = (singleOcrText || '')
        .replace(/name|date|period|class|form|level|page|student|teacher|grade|score|warm.?up|practice|questions?|answer|work.?area|instructions?|show.?work|explain|directions?|side\s*[ab]/gi, '');
      const alphaOnly = headerStripped.replace(/[^a-zA-Z0-9]/g, '');
      if (alphaOnly.length < 30) {
        console.log(`[analyzeItem] Blank page detected (${alphaOnly.length} alphanumeric chars). Skipping AI call.`);
        return {
          ...item,
          status: 'completed' as const,
          result: {
            ocrText: singleOcrText || '',
            problemIdentified: 'Blank or nearly blank page',
            approachAnalysis: 'No student work detected',
            strengthsAnalysis: [],
            areasForImprovement: ['No work submitted'],
            whatStudentDidCorrectly: '',
            whatStudentGotWrong: 'No work was submitted for this page',
            rubricScores: (rubricSteps || []).map(step => ({
              criterion: step.description || (step as any).step_number?.toString() || 'Step',
              score: 0,
              maxScore: step.points,
              feedback: 'No work shown',
            })),
            misconceptions: [],
            totalScore: { earned: 0, possible: rubricSteps?.reduce((s, r) => s + r.points, 0) || 6, percentage: 0 },
            grade: 0,
            gradeJustification: 'No student work detected on this page.',
            feedback: 'No student work detected.',
            studentWorkPresent: false,
          } as AnalysisResult,
        };
      }

      const { data, error } = await invokeWithRetry('analyze-student-work', {
        imageBase64: item.imageDataUrl,
        rubricSteps,
        studentName: item.studentName,
        teacherId: user?.id,
        assessmentMode: assessmentMode || 'teacher',
        promptText,
        preExtractedOCR: singleOcrText || undefined,
      }, { maxRetries: 2 });

      if (error) {
        const errorMsg = handleApiError(error, 'Analysis');
        throw new Error(errorMsg);
      }
      if (data?.error) {
        const errorMsg = handleApiError({ message: data.error }, 'Analysis');
        throw new Error(errorMsg);
      }
      if (!data?.success || !data?.analysis) throw new Error('Invalid response from analysis');

      // Apply grade curve if configured
      const curvedAnalysis = applyGradeCurve(data.analysis);

      return {
        ...item,
        status: 'completed',
        result: curvedAnalysis,
        rawAnalysis: data.rawAnalysis,
      };
    } catch (err) {
      return {
        ...item,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Analysis failed',
      };
    }
  };

  // Detect page types for all items (new paper vs continuation)
  const detectPageTypes = useCallback(async (): Promise<{ newPapers: number; continuations: number }> => {
    if (items.length === 0 || isProcessing || isIdentifying) {
      return { newPapers: 0, continuations: 0 };
    }

    setIsIdentifying(true);
    let newPapers = 0;
    let continuations = 0;
    let lastNewPaperId: string | null = null;

    // Separate already-marked items from those needing detection
    const needsDetection: { item: BatchItem; index: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].pageType) {
        if (items[i].pageType === 'new') {
          lastNewPaperId = items[i].id;
          newPapers++;
        } else {
          continuations++;
        }
      } else {
        needsDetection.push({ item: items[i], index: i });
      }
    }

    // Process in parallel batches of BATCH_CONCURRENCY
    for (let batchStart = 0; batchStart < needsDetection.length; batchStart += BATCH_CONCURRENCY) {
      const batch = needsDetection.slice(batchStart, batchStart + BATCH_CONCURRENCY);
      setCurrentIndex(batch[0].index);

      // Mark batch as identifying
      setItems(prev => prev.map((item, idx) => 
        batch.some(b => b.index === idx) ? { ...item, status: 'identifying' } : item
      ));

      const results = await Promise.all(batch.map(async ({ item, index: i }) => {
        try {
          const { data, error } = await invokeWithRetry('analyze-student-work', {
            imageBase64: item.imageDataUrl,
            detectPageType: true,
          }, { maxRetries: 0 });

          return { i, item, data, error, exception: null };
        } catch (err) {
          return { i, item, data: null, error: null, exception: err };
        }
      }));

      // Process results sequentially to maintain lastNewPaperId ordering
      for (const { i, item, data, error, exception } of results) {
        if (!exception && !error && data?.success && data?.pageType) {
          const isNew = data.pageType.isNewPaper && !data.pageType.isContinuation;
          
          if (isNew) {
            newPapers++;
            lastNewPaperId = item.id;
            setItems(prev => prev.map((it, idx) => 
              idx === i ? { ...it, status: 'pending', pageType: 'new', continuationOf: undefined } : it
            ));
          } else {
            continuations++;
            setItems(prev => {
              const updated: BatchItem[] = prev.map((it, idx) => {
                if (idx === i) {
                  return { ...it, status: 'pending' as const, pageType: 'continuation' as const, continuationOf: lastNewPaperId || undefined };
                }
                if (lastNewPaperId && it.id === lastNewPaperId) {
                  return { ...it, continuationPages: [...(it.continuationPages || []), item.id] };
                }
                return it;
              });
              return updated;
            });
          }
        } else {
          // Default to new paper if detection fails
          console.error('Page type detection failed:', exception || error);
          newPapers++;
          lastNewPaperId = item.id;
          setItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'pending', pageType: 'new' } : it
          ));
        }
      }

      // Small delay between batches
      if (batchStart + BATCH_CONCURRENCY < needsDetection.length) {
        await sleep(BATCH_ITEM_DELAY_MS);
      }
    }

    setCurrentIndex(-1);
    setIsIdentifying(false);
    
    return { newPapers, continuations };
  }, [items, isProcessing, isIdentifying]);

  // Detect multi-page papers using handwriting similarity between sequential pages
  const detectMultiPageByHandwriting = useCallback(async (): Promise<{ groupsCreated: number; pagesLinked: number }> => {
    if (items.length < 2 || isProcessing || isIdentifying) {
      return { groupsCreated: 0, pagesLinked: 0 };
    }

    setIsIdentifying(true);
    let groupsCreated = 0;
    let pagesLinked = 0;
    let lastNewPaperId: string | null = null;

    // First pass: identify pages with students already assigned
    const itemsWithStudents = items.map((item, idx) => ({
      ...item,
      originalIndex: idx,
      hasStudent: !!(item.studentId || item.identification?.matchedStudentId),
    }));

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i];
      
      // If this is the first item or has a student assigned, treat as new paper
      if (i === 0 || currentItem.studentId || currentItem.identification?.matchedStudentId) {
        lastNewPaperId = currentItem.id;
        groupsCreated++;
        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, pageType: 'new' as const } : item
        ));
        continue;
      }

      // If no previous paper to link to, mark as new
      if (!lastNewPaperId) {
        lastNewPaperId = currentItem.id;
        groupsCreated++;
        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, pageType: 'new' as const } : item
        ));
        continue;
      }

      setCurrentIndex(i);
      
      // Mark as identifying
      setItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'identifying' } : item
      ));

      // Get the previous item (the one we're comparing to)
      const previousItem = items[i - 1];

      // Handwriting similarity detection disabled — treat each page as a new paper
      // Teachers can manually link front/back pages using the existing link button
      lastNewPaperId = currentItem.id;
      groupsCreated++;
      setItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'pending' as const, pageType: 'new' as const } : item
      ));
    }

    setCurrentIndex(-1);
    setIsIdentifying(false);
    
    return { groupsCreated, pagesLinked };
  }, [items, isProcessing, isIdentifying]);

  // Manually link a continuation page to a primary paper
  const linkContinuation = useCallback((continuationId: string, primaryId: string) => {
    setItems(prev => {
      return prev.map(item => {
        if (item.id === continuationId) {
          return { ...item, pageType: 'continuation', continuationOf: primaryId };
        }
        if (item.id === primaryId) {
          const existingContinuations = item.continuationPages || [];
          if (!existingContinuations.includes(continuationId)) {
            return { ...item, continuationPages: [...existingContinuations, continuationId] };
          }
        }
        return item;
      });
    });
  }, []);

  // Unlink a continuation page
  const unlinkContinuation = useCallback((continuationId: string) => {
    setItems(prev => {
      const continuationItem = prev.find(i => i.id === continuationId);
      const primaryId = continuationItem?.continuationOf;
      
      return prev.map(item => {
        if (item.id === continuationId) {
          return { ...item, pageType: 'new', continuationOf: undefined };
        }
        if (primaryId && item.id === primaryId) {
          return { 
            ...item, 
            continuationPages: (item.continuationPages || []).filter(id => id !== continuationId) 
          };
        }
        return item;
      });
    });
  }, []);

  // Unlink ALL pages - reset all linking
  const unlinkAllPages = useCallback(() => {
    setItems(prev => 
      prev.map(item => ({
        ...item,
        pageType: 'new',
        continuationOf: undefined,
        continuationPages: undefined,
      }))
    );
  }, []);

  // Convert a continuation page to a separate paper (keeps it as 'new' and clears continuation info)
  // This allows it to be saved to gradebook independently
  const convertToSeparatePaper = useCallback((itemId: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === itemId);
      const primaryId = item?.continuationOf;
      
      return prev.map(it => {
        if (it.id === itemId) {
          // Convert to separate paper - mark as 'new' so it can be saved
          return { 
            ...it, 
            pageType: 'new', 
            continuationOf: undefined,
            // Mark it as converted so we know it was originally a continuation
            wasConvertedFromContinuation: true,
          };
        }
        if (primaryId && it.id === primaryId) {
          // Remove from primary's continuation list
          return { 
            ...it, 
            continuationPages: (it.continuationPages || []).filter(id => id !== itemId) 
          };
        }
        return it;
      });
    });
  }, []);

  // Group pages by the same student - automatically links front/back pages
  // Uses functional state update to always read the latest items (avoids stale closure)
  const groupPagesByStudent = useCallback((): { studentsGrouped: number; pagesLinked: number } => {
    let studentsGrouped = 0;
    let pagesLinked = 0;

    setItems(prev => {
      // Build a map of studentId -> list of item indices (in order) from LATEST state
      const studentPages: Map<string, number[]> = new Map();
      
      prev.forEach((item, index) => {
        const studentId = item.studentId || item.identification?.matchedStudentId;
        if (studentId) {
          const existing = studentPages.get(studentId) || [];
          existing.push(index);
          studentPages.set(studentId, existing);
        }
      });

      // Check if any grouping is needed
      let needsUpdate = false;
      studentPages.forEach((indices) => {
        if (indices.length > 1) needsUpdate = true;
      });
      
      if (!needsUpdate) return prev;

      const updated = [...prev];
      
      studentPages.forEach((indices, studentId) => {
        if (indices.length <= 1) return; // Only one page, nothing to group
        
        studentsGrouped++;
        const primaryIndex = indices[0]; // First page becomes primary
        const primaryId = updated[primaryIndex].id;
        const primaryItem = updated[primaryIndex];
        
        // Merge existing continuation IDs with new ones
        const existingContinuations = primaryItem.continuationPages || [];
        const newContinuationIds = indices.slice(1).map(idx => updated[idx].id);
        const allContinuationIds = [...new Set([...existingContinuations, ...newContinuationIds])];
        
        // Mark primary as 'new' with continuation pages
        updated[primaryIndex] = {
          ...primaryItem,
          pageType: 'new',
          continuationOf: undefined,
          continuationPages: allContinuationIds,
        };

        // Mark subsequent pages as continuations
        indices.slice(1).forEach(idx => {
          // Only count as newly linked if not already a continuation of this primary
          if (updated[idx].continuationOf !== primaryId) {
            pagesLinked++;
          }
          updated[idx] = {
            ...updated[idx],
            pageType: 'continuation',
            continuationOf: primaryId,
            continuationPages: undefined,
            // Ensure student info is consistent
            studentId: primaryItem.studentId,
            studentName: primaryItem.studentName,
          };
        });
      });

      return updated;
    });

    return { studentsGrouped, pagesLinked };
  }, []);

  // Group pages by worksheet topic AND student name - for multi-page papers from same student on same topic
  const groupPagesByWorksheetTopic = useCallback((): { topicsGrouped: number; pagesLinked: number } => {
    // Build a map of (worksheetTopic + studentName) -> list of item indices
    // This groups papers like "Composite Figure Day 3" page 1 and page 2 for the same student
    const topicStudentPages: Map<string, number[]> = new Map();
    
    items.forEach((item, index) => {
      // Only group items that have both a worksheet topic and student identification
      const topic = item.worksheetTopic;
      const studentKey = item.studentId || item.identification?.matchedStudentId || item.studentName || item.identification?.handwrittenName;
      
      if (topic && studentKey) {
        const groupKey = `${topic}:::${studentKey.toLowerCase()}`;
        const existing = topicStudentPages.get(groupKey) || [];
        existing.push(index);
        topicStudentPages.set(groupKey, existing);
      }
    });

    let topicsGrouped = 0;
    let pagesLinked = 0;

    // For each topic+student combination with multiple pages, link them
    setItems(prev => {
      const updated = [...prev];
      
      topicStudentPages.forEach((indices, groupKey) => {
        if (indices.length <= 1) return; // Only one page, nothing to group
        
        topicsGrouped++;
        const primaryIndex = indices[0]; // First page becomes primary
        const primaryId = updated[primaryIndex].id;
        const primaryItem = updated[primaryIndex];
        
        // Get all continuation IDs (existing + new)
        const existingContinuations = primaryItem.continuationPages || [];
        const newContinuationIds = indices.slice(1).map(idx => updated[idx].id);
        const allContinuationIds = [...new Set([...existingContinuations, ...newContinuationIds])];
        
        // Mark primary as 'new' with continuation pages
        updated[primaryIndex] = {
          ...primaryItem,
          pageType: 'new',
          continuationOf: undefined,
          continuationPages: allContinuationIds,
        };

        // Mark subsequent pages as continuations
        indices.slice(1).forEach(idx => {
          pagesLinked++;
          updated[idx] = {
            ...updated[idx],
            pageType: 'continuation',
            continuationOf: primaryId,
            continuationPages: undefined,
            // Ensure student info is consistent
            studentId: primaryItem.studentId,
            studentName: primaryItem.studentName,
          };
        });
      });

      return updated;
    });

    return { topicsGrouped, pagesLinked };
  }, [items]);

  // Reorder items (drag and drop)
  const reorderItems = useCallback((activeId: string, overId: string) => {
    setItems(prev => {
      const oldIndex = prev.findIndex(item => item.id === activeId);
      const newIndex = prev.findIndex(item => item.id === overId);
      
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return prev;
      }
      
      const newItems = [...prev];
      const [movedItem] = newItems.splice(oldIndex, 1);
      newItems.splice(newIndex, 0, movedItem);
      
      return newItems;
    });
  }, []);

  /**
   * Helper: For each continuation page, OCR it individually and run blank detection.
   * If blank → set grade to 0%. If not blank → inherit the primary's result.
   */
  const checkContinuationBlankAndApply = async (
    primaryItem: BatchItem,
    primaryResult: AnalysisResult | undefined,
    allItems: BatchItem[],
  ) => {
    if (!primaryItem.continuationPages || primaryItem.continuationPages.length === 0) return;

    for (const contId of primaryItem.continuationPages) {
      const contItem = allItems.find(it => it.id === contId);
      if (!contItem || !contItem.imageDataUrl || contItem.imageDataUrl.length < 100) {
        // No image data — just inherit the primary result
        setItems(prev => prev.map(it =>
          it.id === contId ? { ...it, status: 'completed' as const, result: primaryResult } : it
        ));
        continue;
      }

      // OCR this individual continuation page
      let contOcrText: string | null = null;
      try {
        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-student-work', {
          body: { imageBase64: contItem.imageDataUrl },
        });
        if (!ocrError && ocrData?.success && ocrData?.ocrText) {
          contOcrText = ocrData.ocrText;
        }
      } catch (e: any) {
        console.warn(`[checkContinuationBlank] OCR failed for ${contId}:`, e.message);
      }

      // Run blank detection on this page's text only
      const blankResult = detectBlankPage(contOcrText || '');
      if (blankResult.isBlank) {
        console.log(`[checkContinuationBlank] Continuation ${contId} is BLANK (${blankResult.normalizedLength} chars). Assigning 0%.`);
        setItems(prev => prev.map(it =>
          it.id === contId ? {
            ...it,
            status: 'completed' as const,
            result: {
              ocrText: contOcrText || '',
              problemIdentified: 'Blank or nearly blank page',
              approachAnalysis: 'No student work detected',
              strengthsAnalysis: [],
              areasForImprovement: ['No work submitted'],
              rubricScores: [],
              misconceptions: [],
              totalScore: { earned: 0, possible: 0, percentage: 0 },
              grade: 0,
              gradeJustification: 'No student work detected on this page.',
              feedback: 'No student work detected.',
              studentWorkPresent: false,
            } as AnalysisResult,
          } : it
        ));
      } else {
        // Not blank — inherit primary's result
        setItems(prev => prev.map(it =>
          it.id === contId ? { ...it, status: 'completed' as const, result: primaryResult } : it
        ));
      }
    }
  };

  const analyzeItemWithContinuations = async (
    item: BatchItem, 
    allItems: BatchItem[],
    rubricSteps?: RubricStep[], 
    assessmentMode?: 'teacher' | 'ai', 
    promptText?: string,
    useLearnedStyle?: boolean
  ): Promise<BatchItem> => {
    try {
      // Guard: skip items with no image data (e.g. restored from localStorage with stripped images)
      if (!item.imageDataUrl || item.imageDataUrl.length < 100) {
        console.warn(`[analyzeItemWithContinuations] Skipping item ${item.id}: no image data (restored session?)`);
        return {
          ...item,
          status: 'needs-reupload' as const,
          error: 'Image data missing — please re-upload this paper',
        };
      }
      // Get all continuation page images
      const additionalImages: string[] = [];
      if (item.continuationPages && item.continuationPages.length > 0) {
        for (const contId of item.continuationPages) {
          const contItem = allItems.find(i => i.id === contId);
          if (contItem) {
            additionalImages.push(contItem.imageDataUrl);
          }
        }
      }

      // STEP 1: OCR the PRIMARY page ALONE first for blank detection.
      // We must NOT combine with continuation images here, because a blank primary
      // with a non-blank continuation would pass blank detection on the combined text.
      let primaryOcrText: string | null = null;
      try {
        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-student-work', {
          body: { imageBase64: item.imageDataUrl },
        });
        if (!ocrError && ocrData?.success && ocrData?.ocrText) {
          primaryOcrText = ocrData.ocrText;
          console.log(`[OCR] Primary page: extracted ${primaryOcrText!.length} chars in ${ocrData.latencyMs}ms`);
        } else {
          console.warn('[OCR] Primary page failed:', ocrError?.message || ocrData?.error);
        }
      } catch (ocrErr: any) {
        console.warn('[OCR] Primary page exception:', ocrErr.message);
      }

      // STEP 1.5: Blank page detection on the PRIMARY page only.
      {
        const textToCheck = primaryOcrText || '';
        const blankResult = detectBlankPage(textToCheck);
        if (blankResult.isBlank) {
          console.log(`[BlankPageDetection] Primary page BLANK (normalized: ${blankResult.normalizedLength} chars, reason: ${blankResult.detectionReason}). Skipping AI call.`);
          return {
            ...item,
            status: 'completed' as const,
            result: {
              ocrText: textToCheck,
              problemIdentified: 'Blank or nearly blank page',
              approachAnalysis: 'No student work detected',
              strengthsAnalysis: [],
              areasForImprovement: ['No work submitted'],
              whatStudentDidCorrectly: '',
              whatStudentGotWrong: 'No work was submitted for this page',
              rubricScores: (rubricSteps || []).map(step => ({
                criterion: step.description,
                score: 0,
                maxScore: step.points,
                feedback: 'No work shown',
              })),
              misconceptions: [],
              totalScore: { earned: 0, possible: rubricSteps?.reduce((s, r) => s + r.points, 0) || 6, percentage: 0 },
              grade: 0,
              gradeJustification: 'No student work detected on this page.',
              feedback: 'No student work detected.',
              studentWorkPresent: false,
            } as AnalysisResult,
          };
        }
      }

      // STEP 1.6: Primary is NOT blank — now combine with continuation pages for full grading.
      let ocrText = primaryOcrText;
      if (additionalImages.length > 0) {
        try {
          const ocrBody: any = { imageBase64: item.imageDataUrl, additionalImages };
          const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-student-work', {
            body: ocrBody,
          });
          if (!ocrError && ocrData?.success && ocrData?.ocrText) {
            ocrText = ocrData.ocrText;
            console.log(`[OCR] Combined (primary + ${additionalImages.length} continuations): ${ocrText!.length} chars`);
          }
        } catch (ocrErr: any) {
          console.warn('[OCR] Combined extraction failed, using primary-only text:', ocrErr.message);
        }
      }

      // STEP 2: Grade using extracted text (no image = much faster) or fall back to image
      const requestBody: any = {
        rubricSteps,
        studentName: item.studentName,
        teacherId: user?.id,
        assessmentMode: assessmentMode || 'teacher',
        promptText,
        useLearnedStyle: useLearnedStyle || false,
      };

      // Always send exactly ONE image (first page) so AI can see diagrams/graphs
      requestBody.imageBase64 = item.imageDataUrl;

      // If OCR returned any text at all, send it — the AI gets both text AND image
      const hasOcrText = ocrText && ocrText.trim().length > 0 && !ocrText.includes('[OCR FAILED');
      if (hasOcrText) {
        requestBody.preExtractedOCR = ocrText;
        // Do NOT send additionalImages — OCR text already covers all pages
      }
      // If OCR completely failed, still only send the first page image (not continuation images)
      // to avoid payload bloat and timeouts

      const { data, error } = await invokeWithRetry('analyze-student-work', requestBody, {
        maxRetries: 0,
      });

      if (error) {
        const errorMsg = handleApiError(error, 'Analysis');
        throw new Error(errorMsg);
      }
      if (data?.error) {
        const errorMsg = handleApiError({ message: data.error }, 'Analysis');
        throw new Error(errorMsg);
      }
      if (!data?.success || !data?.analysis) throw new Error('Invalid response from analysis');

      // Apply grade curve if configured
      const curvedAnalysis = applyGradeCurve(data.analysis);

      return {
        ...item,
        status: 'completed',
        result: curvedAnalysis,
        rawAnalysis: data.rawAnalysis,
      };
    } catch (err) {
      return {
        ...item,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Analysis failed',
      };
    }
  };

  const startBatchAnalysis = useCallback(async (rubricSteps?: RubricStep[], assessmentMode?: 'teacher' | 'ai', promptText?: string, answerGuideImage?: string, useLearnedStyle?: boolean) => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setSummary(null);

    // Get current items state for the async loop
    const currentItems = [...items];
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 15;

    // Separate items into analyzable (primary papers), continuations, and needs-reupload
    const analyzableItems: { item: BatchItem; index: number }[] = [];
    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      if (item.status === 'needs-reupload') {
        // Skip items missing image data — don't attempt analysis
        console.log(`[startBatchAnalysis] Skipping item ${item.id}: needs re-upload`);
        continue;
      } else if (item.pageType === 'continuation' && item.continuationOf) {
        // Mark continuation pages as completed immediately
        setItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'completed' } : it
        ));
      } else {
        analyzableItems.push({ item, index: i });
      }
    }

    // Process papers in parallel batches of BATCH_CONCURRENCY
    for (let batchStart = 0; batchStart < analyzableItems.length; batchStart += BATCH_CONCURRENCY) {
      // Circuit breaker — stop only on consecutive failures (not scattered ones)
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[startBatchAnalysis] ${MAX_CONSECUTIVE_FAILURES} consecutive failures - stopping batch`);
        toast.error(`Batch stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Please check your connection and try again.`);
        const remainingIndices = new Set(analyzableItems.slice(batchStart).map(a => a.index));
        setItems(prev => prev.map((it, idx) => 
          remainingIndices.has(idx) && it.status !== 'completed' ? { ...it, status: 'failed', error: 'Batch stopped due to failures' } : it
        ));
        break;
      }

      const batch = analyzableItems.slice(batchStart, batchStart + BATCH_CONCURRENCY);
      setCurrentIndex(batch[0].index);

      // Mark all items in this batch as analyzing
      const batchIndices = new Set(batch.map(b => b.index));
      const batchContIds = new Set<string>();
      batch.forEach(({ item }) => {
        if (item.continuationPages) {
          item.continuationPages.forEach(id => batchContIds.add(id));
        }
      });
      setItems(prev => prev.map((it, idx) => {
        if (batchIndices.has(idx)) {
          return { ...it, status: 'analyzing', result: undefined, error: undefined };
        }
        if (batchContIds.has(it.id)) {
          return { ...it, status: 'analyzing', result: undefined, error: undefined };
        }
        return it;
      }));

      // Run batch in parallel
      const results = await Promise.all(
        batch.map(({ item }) => 
          analyzeItemWithContinuations(item, currentItems, rubricSteps, assessmentMode, promptText, useLearnedStyle)
        )
      );

      // Apply results
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const { item, index } = batch[j];

        if (result.status === 'failed') {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }

        // Update primary item
        setItems(prev => prev.map((it, idx) => 
          idx === index ? result : it
        ));

        // Update continuation pages — check each for blank before inheriting
        if (item.continuationPages && item.continuationPages.length > 0) {
          await checkContinuationBlankAndApply(item, result.result, currentItems);
        }
      }

      // Small delay between batches (not between individual items)
      if (batchStart + BATCH_CONCURRENCY < analyzableItems.length) {
        await sleep(BATCH_ITEM_DELAY_MS);
      }
    }

    setCurrentIndex(-1);
    setIsProcessing(false);
  }, [items, isProcessing, analyzeItemWithContinuations, checkContinuationBlankAndApply]);

  // Calculate confidence score based on grade consistency across multiple analyses
  const calculateConfidence = (grades: number[]): number => {
    if (grades.length < 2) return 100;
    const max = Math.max(...grades);
    const min = Math.min(...grades);
    const range = max - min;
    // If grades are within 5 points, very high confidence
    // If within 10 points, high confidence
    // If within 15 points, medium confidence
    // If within 20 points, lower confidence
    // Beyond 20 points, very low confidence
    if (range <= 5) return 95;
    if (range <= 10) return 85;
    if (range <= 15) return 70;
    if (range <= 20) return 55;
    return Math.max(30, 100 - range * 2);
  };

  // Start confidence analysis - run multiple analyses per item and average
  const startConfidenceAnalysis = useCallback(async (
    analysisCount: 2 | 3,
    rubricSteps?: RubricStep[], 
    assessmentMode?: 'teacher' | 'ai', 
    promptText?: string
  ) => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setSummary(null);

    const currentItems = [...items];

    // Build list of analyzable items (skip continuations)
    const analyzableItems: { item: BatchItem; index: number }[] = [];
    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      if (item.status === 'needs-reupload') {
        console.log(`[startConfidenceAnalysis] Skipping item ${item.id}: needs re-upload`);
        continue;
      } else if (item.pageType === 'continuation' && item.continuationOf) {
        setItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'completed' } : it
        ));
      } else {
        analyzableItems.push({ item, index: i });
      }
    }

    // Process papers in parallel batches of BATCH_CONCURRENCY
    for (let batchStart = 0; batchStart < analyzableItems.length; batchStart += BATCH_CONCURRENCY) {
      const batch = analyzableItems.slice(batchStart, batchStart + BATCH_CONCURRENCY);
      setCurrentIndex(batch[0].index);

      // Mark batch as analyzing and clear stale results
      setItems(prev => prev.map((it, idx) => {
        const inBatch = batch.some(b => b.index === idx);
        const isContinuation = batch.some(b => b.item.continuationPages?.includes(it.id));
        if (inBatch || isContinuation) {
          return { ...it, status: 'analyzing', result: undefined, error: undefined };
        }
        return it;
      }));

      await Promise.all(batch.map(async ({ item, index: i }) => {
        // Run multiple analyses sequentially per paper
        const analysisResults: AnalysisResult[] = [];
        for (let run = 0; run < analysisCount; run++) {
          const result = await analyzeItemWithContinuations(item, currentItems, rubricSteps, assessmentMode, promptText);
          if (result.result) {
            analysisResults.push(result.result);
          }
        }

        if (analysisResults.length === 0) {
          setItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'failed', error: 'All analysis attempts failed' } : it
          ));
          return;
        }

        const grades = analysisResults.map(r => r.grade ?? r.totalScore.percentage);
        const averageGrade = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
        const confidenceScore = calculateConfidence(grades);

        const combinedResult: AnalysisResult = {
          ...analysisResults[0],
          grade: averageGrade,
          gradeJustification: `Average of ${analysisCount} analyses (${grades.join('%, ')}%). ${analysisResults[0].gradeJustification || ''}`,
          multiAnalysisGrades: grades,
          multiAnalysisResults: analysisResults,
          confidenceScore,
        };

        const curvedResult = applyGradeCurve(combinedResult);

        setItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'completed', result: curvedResult } : it
        ));

        if (item.continuationPages && item.continuationPages.length > 0) {
          await checkContinuationBlankAndApply(item, curvedResult, currentItems);
        }
      }));

      // Small delay between batches
      if (batchStart + BATCH_CONCURRENCY < analyzableItems.length) {
        await sleep(BATCH_ITEM_DELAY_MS);
      }
    }

    setCurrentIndex(-1);
    setIsProcessing(false);
  }, [items, isProcessing, applyGradeCurve, analyzeItemWithContinuations, checkContinuationBlankAndApply]);

  // Override grade for a specific item
  const overrideGrade = useCallback((itemId: string, newGrade: number, justification: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId && item.result) {
        return {
          ...item,
          result: {
            ...item.result,
            isOverridden: true,
            overriddenGrade: newGrade,
            overrideJustification: justification,
            grade: newGrade,
            gradeJustification: `Teacher override: ${justification}. Original: ${item.result.multiAnalysisGrades?.join('%, ') || item.result.grade}%`,
            selectedRunIndex: undefined, // Clear selected run when manually overriding
          },
        };
      }
      return item;
    }));
  }, []);

  // Select a specific analysis run as the final grade (instead of average)
  const selectRunAsGrade = useCallback((itemId: string, runIndex: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId && item.result?.multiAnalysisResults?.[runIndex]) {
        const selectedRun = item.result.multiAnalysisResults[runIndex];
        const selectedGrade = selectedRun.grade ?? selectedRun.totalScore.percentage;
        const originalGrades = item.result.multiAnalysisGrades || [];
        
        return {
          ...item,
          result: {
            ...item.result,
            grade: selectedGrade,
            gradeJustification: `Selected Run #${runIndex + 1} (${selectedGrade}%). Other runs: ${originalGrades.filter((_, i) => i !== runIndex).join('%, ')}%`,
            selectedRunIndex: runIndex,
            isOverridden: false,
            overriddenGrade: undefined,
            overrideJustification: undefined,
          },
        };
      }
      return item;
    }));
  }, []);

  // Teacher-guided batch analysis - analyzes all items with a common answer guide
  const startTeacherGuidedBatchAnalysis = useCallback(async (
    answerGuideImage: string,
    rubricSteps?: RubricStep[]
  ) => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setSummary(null);

    const currentItems = [...items];

    // Build list of analyzable items (skip continuations)
    const analyzableItems: { item: BatchItem; index: number }[] = [];
    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i];
      if (item.status === 'needs-reupload') {
        console.log(`[startTeacherGuidedBatchAnalysis] Skipping item ${item.id}: needs re-upload`);
        continue;
      } else if (item.pageType === 'continuation' && item.continuationOf) {
        setItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'completed' } : it
        ));
      } else {
        analyzableItems.push({ item, index: i });
      }
    }

    // Process papers in parallel batches of BATCH_CONCURRENCY
    for (let batchStart = 0; batchStart < analyzableItems.length; batchStart += BATCH_CONCURRENCY) {
      const batch = analyzableItems.slice(batchStart, batchStart + BATCH_CONCURRENCY);
      setCurrentIndex(batch[0].index);

      // Mark batch as analyzing and clear stale results
      setItems(prev => prev.map((it, idx) => {
        const inBatch = batch.some(b => b.index === idx);
        const isContinuation = batch.some(b => b.item.continuationPages?.includes(it.id));
        if (inBatch || isContinuation) {
          return { ...it, status: 'analyzing', result: undefined, error: undefined };
        }
        return it;
      }));

      await Promise.all(batch.map(async ({ item, index: i }) => {
        try {
          // Guard: skip items with no image data
          if (!item.imageDataUrl || item.imageDataUrl.length < 100) {
            setItems(prev => prev.map((it, idx) => 
              idx === i ? { ...it, status: 'needs-reupload' as const, error: 'Image data missing — please re-upload this paper' } : it
            ));
            return;
          }
          const additionalImages: string[] = [];
          if (item.continuationPages && item.continuationPages.length > 0) {
            for (const contId of item.continuationPages) {
              const contItem = currentItems.find(it => it.id === contId);
              if (contItem) {
                additionalImages.push(contItem.imageDataUrl);
              }
            }
          }

          // OCR extraction for blank page detection
          let ocrText: string | null = null;
          try {
            const ocrBody: any = { imageBase64: item.imageDataUrl };
            if (additionalImages.length > 0) {
              ocrBody.additionalImages = additionalImages;
            }
            const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-student-work', {
              body: ocrBody,
            });
            if (!ocrError && ocrData?.success && ocrData?.ocrText) {
              ocrText = ocrData.ocrText;
            }
          } catch (ocrErr: any) {
            console.warn('[OCR] Teacher-guided batch exception:', ocrErr.message);
          }

          // Blank page detection — skip AI grading for empty pages
          const textToCheck = ocrText || '';
          const blankResult = detectBlankPage(textToCheck);
          if (blankResult.isBlank) {
            console.log(`[BlankPageDetection] Teacher-guided: Blank page detected (normalized: ${blankResult.normalizedLength} chars). Skipping AI.`);
            const blankAnalysis = {
              ocrText: textToCheck,
              problemIdentified: 'Blank or nearly blank page',
              approachAnalysis: 'No student work detected',
              strengthsAnalysis: [],
              areasForImprovement: ['No work submitted'],
              rubricScores: (rubricSteps || []).map(step => ({
                criterion: step.description,
                score: 0,
                maxScore: step.points,
                feedback: 'No work shown',
              })),
              misconceptions: [],
              totalScore: { earned: 0, possible: rubricSteps?.reduce((s, r) => s + r.points, 0) || 6, percentage: 0 },
              grade: 0,
              gradeJustification: 'No student work detected on this page.',
              feedback: 'No student work detected.',
              studentWorkPresent: false,
            };
            setItems(prev => prev.map((it, idx) => 
              idx === i ? { ...it, status: 'completed', result: blankAnalysis } : it
            ));
            return;
          }

          const requestBody: any = {
            imageBase64: item.imageDataUrl,
            additionalImages: additionalImages.length > 0 ? additionalImages : undefined,
            answerGuideBase64: answerGuideImage,
            rubricSteps,
            studentName: item.studentName,
            teacherId: user?.id,
            assessmentMode: 'teacher-guided',
          };

          // Send OCR text if available so server can use it
          if (ocrText && ocrText.trim().length > 0) {
            requestBody.preExtractedOCR = ocrText;
          }

          const { data, error } = await invokeWithRetry('analyze-student-work', requestBody, { maxRetries: 0 });

          if (error) {
            const errorMsg = handleApiError(error, 'Analysis');
            throw new Error(errorMsg);
          }
          if (data?.error) {
            const errorMsg = handleApiError({ message: data.error }, 'Analysis');
            throw new Error(errorMsg);
          }
          if (!data?.success || !data?.analysis) throw new Error('Invalid response from analysis');

          const curvedAnalysis = applyGradeCurve(data.analysis);

          setItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'completed', result: curvedAnalysis, rawAnalysis: data.rawAnalysis } : it
          ));

          if (item.continuationPages && item.continuationPages.length > 0) {
            await checkContinuationBlankAndApply(item, curvedAnalysis, currentItems);
          }
        } catch (err) {
          setItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'failed', error: err instanceof Error ? err.message : 'Analysis failed' } : it
          ));
        }
      }));

      // Small delay between batches
      if (batchStart + BATCH_CONCURRENCY < analyzableItems.length) {
        await sleep(BATCH_ITEM_DELAY_MS);
      }
    }

    setCurrentIndex(-1);
    setIsProcessing(false);
  }, [items, isProcessing, user?.id]);

  const generateSummary = useCallback((): BatchSummary => {
    // Only count primary pages (not continuations) to avoid double-counting
    const completedItems = items.filter(item => 
      item.status === 'completed' && 
      item.result && 
      item.pageType !== 'continuation'
    );
    
    if (completedItems.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        commonMisconceptions: [],
        scoreDistribution: [],
      };
    }

    // Use overridden grade if available, then grade, then percentage
    const scores = completedItems.map(item => {
      const result = item.result!;
      return result.overriddenGrade ?? result.grade ?? result.totalScore.percentage;
    });
    
    const validScores = scores.filter(s => typeof s === 'number' && !isNaN(s));
    
    if (validScores.length === 0) {
      return {
        totalStudents: completedItems.length,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        commonMisconceptions: [],
        scoreDistribution: [],
      };
    }
    
    const averageScore = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
    const highestScore = Math.max(...validScores);
    const lowestScore = Math.min(...validScores);
    const passRate = Math.round((validScores.filter(s => s >= 60).length / validScores.length) * 100);

    // Count misconceptions
    const misconceptionCounts: Record<string, number> = {};
    completedItems.forEach(item => {
      item.result!.misconceptions.forEach(m => {
        misconceptionCounts[m] = (misconceptionCounts[m] || 0) + 1;
      });
    });
    const commonMisconceptions = Object.entries(misconceptionCounts)
      .map(([misconception, count]) => ({ misconception, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Score distribution using valid scores
    const ranges = [
      { range: '0-59%', min: 0, max: 59 },
      { range: '60-69%', min: 60, max: 69 },
      { range: '70-79%', min: 70, max: 79 },
      { range: '80-89%', min: 80, max: 89 },
      { range: '90-100%', min: 90, max: 100 },
    ];
    const scoreDistribution = ranges.map(({ range, min, max }) => ({
      range,
      count: validScores.filter(s => s >= min && s <= max).length,
    }));

    const newSummary = {
      totalStudents: completedItems.length,
      averageScore,
      highestScore,
      lowestScore,
      passRate,
      commonMisconceptions,
      scoreDistribution,
    };

    setSummary(newSummary);
    return newSummary;
  }, [items]);

  // Re-analyze a single item (useful when analysis was incomplete)
  const reanalyzeItem = useCallback(async (
    itemId: string,
    rubricSteps?: RubricStep[],
    assessmentMode?: 'teacher' | 'ai',
    promptText?: string
  ): Promise<BatchItem | null> => {
    const itemIndex = items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      toast.error('Item not found');
      return null;
    }

    const item = items[itemIndex];
    
    // Mark item as analyzing
    setItems(prev => prev.map((it, idx) => 
      idx === itemIndex ? { ...it, status: 'analyzing', result: undefined, error: undefined } : it
    ));

    // Mark continuation pages as analyzing too (clear stale results)
    if (item.continuationPages && item.continuationPages.length > 0) {
      setItems(prev => prev.map(it => 
        item.continuationPages!.includes(it.id) ? { ...it, status: 'analyzing', result: undefined, error: undefined } : it
      ));
    }

    try {
      const result = await analyzeItemWithContinuations(
        { ...item, status: 'pending' }, 
        items, 
        rubricSteps, 
        assessmentMode, 
        promptText,
        true // Use learned style by default for reanalysis
      );

      // Update the item with new result
      setItems(prev => prev.map((it, idx) => 
        idx === itemIndex ? result : it
      ));

      // Also mark continuation pages as completed
      if (item.continuationPages && item.continuationPages.length > 0) {
        setItems(prev => prev.map(it => 
          item.continuationPages!.includes(it.id) ? { ...it, status: 'completed' } : it
        ));
      }

      if (result.status === 'completed') {
        toast.success(`Reanalysis complete for ${item.studentName || 'student'}`);
      } else {
        toast.error(`Reanalysis failed: ${result.error || 'Unknown error'}`);
      }

      // Regenerate summary
      setTimeout(() => generateSummary(), 100);

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Reanalysis failed';
      toast.error(errorMsg);
      
      setItems(prev => prev.map((it, idx) => 
        idx === itemIndex ? { ...it, status: 'failed', error: errorMsg } : it
      ));

      return null;
    }
  }, [items, analyzeItemWithContinuations, generateSummary]);

  return {
    items,
    addImage,
    addImageWithAutoIdentify,
    addPdfPagesWithAutoGrouping,
    removeImage,
    updateItemStudent,
    reorderItems,
    clearAll,
    autoIdentifyAll,
    scanAllQRCodes,
    detectPageTypes,
    detectMultiPageByHandwriting,
    groupPagesByStudent,
    groupPagesByWorksheetTopic,
    linkContinuation,
    unlinkContinuation,
    unlinkAllPages,
    convertToSeparatePaper,
    startBatchAnalysis,
    startConfidenceAnalysis,
    startTeacherGuidedBatchAnalysis,
    reanalyzeItem,
    overrideGrade,
    selectRunAsGrade,
    isProcessing,
    isIdentifying,
    isRestoredFromStorage: hasLoadedFromStorage.current,
    currentIndex,
    summary,
    generateSummary,
  };
}
