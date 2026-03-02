import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Move, AlertTriangle, MapPin, Check, X, Save, Brain, Loader2, Pencil, PenTool, CheckCircle2, Lightbulb, BookOpen, Target, ThumbsUp, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ErrorRegion } from './ImageErrorOverlay';
import { extractErrorRegions } from './extractErrorRegions';
import { useMisconceptionFeedback, MisconceptionDecision } from '@/hooks/useMisconceptionFeedback';
import { useAnnotations } from '@/hooks/useAnnotations';
import { cn } from '@/lib/utils';

// Lazy-load directly (NOT from ./lazy barrel — this file IS in the barrel, so importing from it is circular)
const AnnotationToolbar = React.lazy(() => import('./AnnotationToolbar'));
const AnnotationCanvas = React.lazy(() => import('./AnnotationCanvas'));
const ImageErrorOverlay = React.lazy(() => import('./ImageErrorOverlay').then(m => ({ default: m.ImageErrorOverlay })));

interface BatchImageZoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  studentName: string;
  paperIndex: number;
  totalPapers: number;
  onNavigate?: (direction: 'prev' | 'next') => void;
  misconceptions?: string[];
  grade?: number;
  studentId?: string;
  attemptId?: string;
  topicName?: string;
  // Analysis details for sidebar display
  gradeJustification?: string;
  feedback?: string;
  whatStudentDidCorrectly?: string;
  whatStudentGotWrong?: string;
  approachAnalysis?: string;
  strengthsAnalysis?: string[];
  areasForImprovement?: string[];
  regentsScore?: number;
  regentsScoreJustification?: string;
}

export function BatchImageZoomDialog({
  open,
  onOpenChange,
  imageUrl,
  studentName,
  paperIndex,
  totalPapers,
  onNavigate,
  misconceptions = [],
  grade,
  studentId,
  attemptId,
  topicName = 'Unknown Topic',
  gradeJustification,
  feedback,
  whatStudentDidCorrectly,
  whatStudentGotWrong,
  approachAnalysis,
  strengthsAnalysis,
  areasForImprovement,
  regentsScore,
  regentsScoreJustification,
}: BatchImageZoomDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [highlightedError, setHighlightedError] = useState<number | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isEditingRegions, setIsEditingRegions] = useState(false);
  const [customRegions, setCustomRegions] = useState<Record<number, Partial<ErrorRegion>>>({});
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [noErrorConfirmed, setNoErrorConfirmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    decisions,
    confirmError,
    dismissError,
    clearDecision,
    resetDecisions,
    saveFeedback,
    isSaving,
    hasDecisions,
  } = useMisconceptionFeedback();

  // Annotation system
  const {
    annotations,
    selectedId: selectedAnnotationId,
    activeTool,
    activeColor,
    canUndo,
    setSelectedId: setSelectedAnnotationId,
    setActiveTool,
    setActiveColor,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    undo: undoAnnotation,
    clearAll: clearAllAnnotations,
    resetAnnotations,
  } = useAnnotations();

  // Extract error regions from misconceptions and merge with custom positions
  // Filter out dismissed errors from the overlay
  const baseErrorRegions = extractErrorRegions(misconceptions);
  const allErrorRegions = baseErrorRegions.map(region => ({
    ...region,
    ...customRegions[region.id],
  }));
  
  // Only show non-dismissed errors on the image overlay
  const errorRegions = allErrorRegions.filter(region => decisions[region.id] !== 'dismissed');
  
  // Calculate adjusted grade based on dismissed errors
  const calculateAdjustedGrade = () => {
    if (grade === undefined) return undefined;
    const totalErrors = misconceptions.length;
    if (totalErrors === 0) return grade;
    
    // Compute dismissed count locally to avoid TDZ reference to later-declared const
    const dismissed = Object.values(decisions).filter(d => d === 'dismissed').length;
    
    // Each dismissed error adds points back (errors were incorrectly identified)
    // Estimate ~5-10 points per dismissed error, capped at effort floor to max
    const pointsPerError = Math.min(10, (100 - grade) / Math.max(1, totalErrors));
    const adjustedGrade = Math.min(100, grade + (dismissed * pointsPerError));
    return Math.round(adjustedGrade);
  };
  
  const adjustedGrade = calculateAdjustedGrade();

  // Handle region updates (drag/resize)
  const handleRegionUpdate = useCallback((id: number, updates: Partial<ErrorRegion>) => {
    setCustomRegions(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }));
  }, []);

  // Track the last image URL to detect actual changes
  const lastImageUrlRef = useRef<string>(imageUrl);

  // Reset view only when image actually changes (not on every render)
  useEffect(() => {
    if (lastImageUrlRef.current !== imageUrl) {
      lastImageUrlRef.current = imageUrl;
      resetView();
      setHighlightedError(null);
      resetDecisions();
      setCustomRegions({});
      setIsEditingRegions(false);
      setIsAnnotating(false);
      resetAnnotations();
      setNoErrorConfirmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.02, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.02, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  
  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      setStartPos({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      setPosition({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't process shortcuts if annotating (let annotation canvas handle them)
    if (isAnnotating) {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoAnnotation();
      }
      return;
    }
    
    if (e.key === 'ArrowLeft' && onNavigate && paperIndex > 0) {
      onNavigate('prev');
    } else if (e.key === 'ArrowRight' && onNavigate && paperIndex < totalPapers - 1) {
      onNavigate('next');
    } else if (e.key === '+' || e.key === '=') {
      handleZoomIn();
    } else if (e.key === '-') {
      handleZoomOut();
    } else if (e.key === 'r') {
      handleRotate();
    } else if (e.key === '0') {
      resetView();
    }
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom > 1) {
      setIsPanning(true);
      setStartPos({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPanning && e.touches.length === 1 && zoom > 1) {
      setPosition({
        x: e.touches[0].clientX - startPos.x,
        y: e.touches[0].clientY - startPos.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
  };

  const getGradeColor = (g: number) => {
    if (g >= 90) return 'bg-green-500';
    if (g >= 80) return 'bg-blue-500';
    if (g >= 70) return 'bg-yellow-500';
    if (g >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const handleSaveFeedback = async () => {
    const feedback = Object.entries(decisions).map(([id, decision]) => {
      const errorIndex = parseInt(id);
      const misconceptionText = misconceptions[errorIndex - 1] || '';
      const region = errorRegions.find(r => r.id === errorIndex);
      
      return {
        misconceptionText,
        decision: decision as MisconceptionDecision,
        errorIndex,
        location: region ? { vertical: region.vertical, horizontal: region.horizontal } : undefined,
      };
    });

    const result = await saveFeedback({
      studentId,
      attemptId,
      topicName,
      feedback,
      aiGrade: grade,
      noErrorsConfirmed: noErrorConfirmed && misconceptions.length === 0,
    });

    if (result.success) {
      resetDecisions();
      setNoErrorConfirmed(false);
    }
  };

  const handleConfirmAll = () => {
    misconceptions.forEach((_, i) => confirmError(i + 1));
  };

  const handleDismissAll = () => {
    misconceptions.forEach((_, i) => dismissError(i + 1));
  };

  const hasMisconceptions = misconceptions.length > 0;
  const hasAnnotatableErrors = errorRegions.length > 0;
  const confirmedCount = Object.values(decisions).filter(d => d === 'confirmed').length;
  const dismissedCount = Object.values(decisions).filter(d => d === 'dismissed').length;
  const canSaveFeedback = hasDecisions || noErrorConfirmed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl max-h-[95vh] p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="p-3 border-b flex flex-row items-center justify-between">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            Paper {paperIndex + 1} of {totalPapers}
            {studentName && ` • ${studentName}`}
            {grade !== undefined && (
              <>
                {dismissedCount > 0 && adjustedGrade !== grade ? (
                  <div className="flex items-center gap-1 ml-2">
                    <Badge className={cn("opacity-50 line-through", getGradeColor(grade))}>
                      {grade}%
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge className={cn(getGradeColor(adjustedGrade!))}>
                      {adjustedGrade}%
                    </Badge>
                  </div>
                ) : (
                  <Badge className={cn("ml-2", getGradeColor(grade))}>
                    {grade}%
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
          <div className="flex items-center gap-1">
            {/* Annotate button - always available */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isAnnotating ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsAnnotating(!isAnnotating);
                      if (!isAnnotating) {
                        setIsEditingRegions(false);
                      }
                    }}
                    className={cn(
                      "h-7 px-2 gap-1",
                      isAnnotating && "bg-primary"
                    )}
                  >
                    <PenTool className="h-3 w-3" />
                    {isAnnotating ? 'Done' : 'Annotate'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isAnnotating 
                    ? 'Exit annotation mode' 
                    : 'Mark mistakes on the paper'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Toggle annotations and edit mode */}
            {hasMisconceptions && (
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant={showAnnotations ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className="h-7 px-2 gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {showAnnotations ? 'Hide' : 'Show'} Errors
                </Button>
                {showAnnotations && hasAnnotatableErrors && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isEditingRegions ? "default" : "outline"}
                          size="sm"
                          onClick={() => setIsEditingRegions(!isEditingRegions)}
                          className={cn(
                            "h-7 px-2 gap-1",
                            isEditingRegions && "bg-primary"
                          )}
                        >
                          <Pencil className="h-3 w-3" />
                          {isEditingRegions ? 'Done' : 'Edit'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isEditingRegions 
                          ? 'Exit edit mode' 
                          : 'Drag to move boxes, drag corners to resize'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}

            {/* Navigation */}
            {onNavigate && (
              <div className="flex items-center gap-1 mr-2 border-r pr-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('prev')}
                  disabled={paperIndex === 0}
                  className="h-7 px-2"
                >
                  ← Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('next')}
                  disabled={paperIndex >= totalPapers - 1}
                  className="h-7 px-2"
                >
                  Next →
                </Button>
              </div>
            )}
            
            {/* Zoom controls */}
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomOut} disabled={zoom <= 0.25}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleZoomIn} disabled={zoom >= 5}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleRotate}>
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetView}>
              Reset
            </Button>
          </div>
        </DialogHeader>

        {/* Annotation toolbar - shown when annotating */}
        {isAnnotating && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50">
            <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
              <AnnotationToolbar
                activeTool={activeTool}
                activeColor={activeColor}
                onToolChange={setActiveTool}
                onColorChange={setActiveColor}
                onUndo={undoAnnotation}
                onClearAll={clearAllAnnotations}
                canUndo={canUndo}
                annotationCount={annotations.length}
              />
            </Suspense>
          </div>
        )}

        <div className="flex h-[70vh]">
          {/* Main image area */}
          <div
            ref={containerRef}
            className={cn(
              "relative overflow-hidden bg-muted/30 flex-1",
              isAnnotating ? 'cursor-crosshair' : zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
              isPanning && !isAnnotating && 'cursor-grabbing'
            )}
            onMouseDown={isAnnotating ? undefined : handleMouseDown}
            onMouseMove={isAnnotating ? undefined : handleMouseMove}
            onMouseUp={isAnnotating ? undefined : handleMouseUp}
            onMouseLeave={isAnnotating ? undefined : handleMouseUp}
            onWheel={isAnnotating ? undefined : handleWheel}
            onTouchStart={isAnnotating ? undefined : handleTouchStart}
            onTouchMove={isAnnotating ? undefined : handleTouchMove}
            onTouchEnd={isAnnotating ? undefined : handleTouchEnd}
            onClick={isAnnotating ? undefined : () => {
              if (zoom === 1) handleZoomIn();
            }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center transition-transform duration-100"
              style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
              }}
            >
              {/* Image container with relative positioning for overlay */}
              <div className="relative inline-block">
                <img
                  src={imageUrl}
                  alt={`Student work - ${studentName}`}
                  className="max-h-full max-w-full object-contain select-none"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transition: isPanning ? 'none' : 'transform 0.2s ease-out',
                  }}
                  draggable={false}
                />
                
                {/* Error region overlay */}
                {showAnnotations && hasAnnotatableErrors && !isAnnotating && (
                  <Suspense fallback={null}>
                    <ImageErrorOverlay
                      errorRegions={errorRegions}
                      highlightedError={highlightedError}
                      onErrorHover={setHighlightedError}
                      onErrorClick={(id) => setHighlightedError(id === highlightedError ? null : id)}
                      onRegionUpdate={handleRegionUpdate}
                      zoom={zoom}
                      rotation={rotation}
                      isEditing={isEditingRegions}
                    />
                  </Suspense>
                )}

                {/* Teacher annotation canvas */}
                {isAnnotating && (
                  <Suspense fallback={null}>
                    <AnnotationCanvas
                      annotations={annotations}
                      activeTool={activeTool}
                      activeColor={activeColor}
                      onAnnotationAdd={addAnnotation}
                      onAnnotationUpdate={updateAnnotation}
                      onAnnotationDelete={deleteAnnotation}
                      selectedId={selectedAnnotationId}
                      onSelect={setSelectedAnnotationId}
                      disabled={false}
                    />
                  </Suspense>
                )}

                {/* Show annotations even when not in annotation mode */}
                {!isAnnotating && annotations.length > 0 && (
                  <Suspense fallback={null}>
                    <AnnotationCanvas
                      annotations={annotations}
                      activeTool="select"
                      activeColor={activeColor}
                      onAnnotationAdd={addAnnotation}
                      onAnnotationUpdate={updateAnnotation}
                      onAnnotationDelete={deleteAnnotation}
                      selectedId={null}
                      onSelect={() => {}}
                      disabled={true}
                    />
                  </Suspense>
                )}
              </div>
            </div>

            {/* Zoom hint overlay */}
            {zoom === 1 && !hasMisconceptions && !isAnnotating && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-muted-foreground flex items-center gap-2">
                <Move className="h-3 w-3" />
                Click or scroll to zoom • Drag to pan when zoomed
              </div>
            )}

            {/* Annotation mode hint */}
            {isAnnotating && annotations.length === 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg text-xs flex items-center gap-3 border shadow-lg">
                <PenTool className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">
                  Draw on the paper to mark mistakes • Use toolbar to change tools & colors
                </span>
              </div>
            )}

            {/* Annotation legend when showing errors */}
            {showAnnotations && hasAnnotatableErrors && zoom === 1 && !isAnnotating && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg text-xs flex items-center gap-3 border shadow-lg">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded border-2 border-amber-500 bg-amber-500/20" />
                  <span className="text-muted-foreground">Error location</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded border-2 border-destructive bg-destructive/20" />
                  <span className="text-muted-foreground">Selected</span>
                </div>
                {isEditingRegions ? (
                  <span className="text-primary font-medium">• Drag to move, corners to resize</span>
                ) : (
                  <span className="text-muted-foreground">• Click Edit to adjust boxes</span>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Misconceptions list with confirm/dismiss */}
          {hasMisconceptions && showAnnotations && !isAnnotating && (
            <div className="w-80 border-l bg-background flex flex-col">
              <div className="p-3 border-b bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Errors Found ({misconceptions.length})
                  </h3>
                  {hasDecisions && (
                    <Badge variant="outline" className="text-xs">
                      {confirmedCount}✓ {dismissedCount}✗
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Review AI findings and train by confirming or dismissing
                </p>
                {dismissedCount > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {dismissedCount} error(s) dismissed — grade adjusted
                  </p>
                )}
                
                {/* Bulk actions */}
                <div className="flex items-center gap-2 mt-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1"
                          onClick={handleConfirmAll}
                        >
                          <Check className="h-3 w-3 text-green-600" />
                          Confirm All
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>All errors are correct</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1"
                          onClick={handleDismissAll}
                        >
                          <X className="h-3 w-3 text-red-600" />
                          Dismiss All
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>All errors are wrong</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {misconceptions.map((m, i) => {
                    const errorNum = i + 1;
                    const region = errorRegions.find(r => r.id === errorNum);
                    const isHighlighted = highlightedError === errorNum;
                    const decision = decisions[errorNum];
                    
                    // Parse out the location prefix if present
                    const cleanText = m.replace(/^ERROR_LOCATION:\s*\w+-\w+\s*\|\s*/i, '');

                    // Hide dismissed errors from the list - they disappear when dismissed
                    if (decision === 'dismissed') {
                      return (
                        <div
                          key={i}
                          className="p-2 rounded-lg border border-dashed border-red-200 bg-red-50/30 dark:bg-red-950/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <X className="h-3 w-3 text-red-400" />
                              <span className="line-through">Error #{errorNum} dismissed</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearDecision(errorNum);
                              }}
                            >
                              Undo
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    // Show confirmed items as collapsed with undo option
                    if (decision === 'confirmed') {
                      return (
                        <div
                          key={i}
                          className="p-2 rounded-lg border border-dashed border-green-200 bg-green-50/30 dark:bg-green-950/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                              <Check className="h-3 w-3" />
                              <span>Error #{errorNum} confirmed</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearDecision(errorNum);
                              }}
                            >
                              Undo
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-lg border transition-all",
                          isHighlighted && "border-destructive bg-destructive/10 shadow-md",
                          !isHighlighted && "border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20"
                        )}
                        onMouseEnter={() => setHighlightedError(errorNum)}
                        onMouseLeave={() => setHighlightedError(null)}
                      >
                        <div className="flex items-start gap-2">
                          <div className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
                            isHighlighted && "bg-destructive text-destructive-foreground",
                            !isHighlighted && "bg-amber-500 text-white"
                          )}>
                            {errorNum}
                          </div>
                          <div className="flex-1 min-w-0">
                            {region && (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[10px] mb-1.5",
                                  isHighlighted && "border-destructive text-destructive",
                                  !isHighlighted && "border-amber-400 text-amber-700 dark:text-amber-300"
                                )}
                              >
                                <MapPin className="h-2.5 w-2.5 mr-1" />
                                {region.vertical}-{region.horizontal}
                              </Badge>
                            )}
                            <p className="text-xs leading-relaxed text-foreground/80">
                              {cleanText}
                            </p>

                            {/* Confirm/Dismiss buttons */}
                            <div className="flex items-center gap-1 mt-2">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-xs gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmError(errorNum);
                                      }}
                                    >
                                      <Check className="h-3 w-3" />
                                      Confirm
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>AI correctly identified this error</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-xs gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        dismissError(errorNum);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                      Dismiss
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>AI incorrectly flagged this as an error</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Analysis details in misconceptions sidebar */}
                  {(gradeJustification || feedback) && (
                    <div className="mt-3 pt-3 border-t border-muted">
                      {gradeJustification && (
                        <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 mb-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <BookOpen className="h-3 w-3 text-blue-600" />
                            <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">Grade Justification</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-foreground/80">{gradeJustification}</p>
                        </div>
                      )}
                      {feedback && (
                        <div className="p-2.5 rounded-lg border border-purple-200 bg-purple-50/30 dark:bg-purple-950/10">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Lightbulb className="h-3 w-3 text-purple-600" />
                            <span className="text-[10px] font-medium text-purple-700 dark:text-purple-400">Feedback</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-foreground/80">{feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Save feedback button */}
              {canSaveFeedback && (
                <div className="p-3 border-t bg-muted/30">
                  <Button
                    className="w-full gap-2"
                    onClick={handleSaveFeedback}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4" />
                    )}
                    Save & Train AI
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                    Your feedback improves future grading accuracy
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sidebar - No errors found panel with analysis details (only show if analysis was actually run) */}
          {!hasMisconceptions && showAnnotations && !isAnnotating && grade !== undefined && (
            <div className="w-80 border-l bg-background flex flex-col">
              <div className="p-3 border-b bg-muted/30">
                {grade !== undefined && grade >= 85 ? (
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    No Errors Detected
                  </h3>
                ) : (
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    AI Analysis Complete
                  </h3>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Do you agree with the AI's grade of <strong>{grade}%</strong>?
                </p>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {/* Grade Agreement Buttons */}
                  <div className="p-3 rounded-lg border border-muted bg-muted/30">
                    <p className="text-xs font-medium mb-2">Is this grade correct?</p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={noErrorConfirmed ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          "h-7 px-3 text-xs gap-1 flex-1",
                          noErrorConfirmed && "bg-green-600 hover:bg-green-700 text-white"
                        )}
                        onClick={() => setNoErrorConfirmed(true)}
                      >
                        <Check className="h-3 w-3" />
                        Yes, {grade}% is right
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs gap-1 flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => setNoErrorConfirmed(false)}
                      >
                        <Edit2 className="h-3 w-3" />
                        No, correct it
                      </Button>
                    </div>

                    {noErrorConfirmed && (
                      <p className="text-[10px] text-green-600 mt-2 text-center">
                        ✓ Grade confirmed — click "Save & Train AI" below
                      </p>
                    )}
                  </div>

                  {/* Low-grade warning */}
                  {grade !== undefined && grade < 70 && (
                    <div className="p-3 rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                          The AI gave a low grade but didn't list specific errors. Review the paper and use "No, correct it" above if the grade should be different.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Analysis Details Section - What the student did well */}
                  {(whatStudentDidCorrectly || approachAnalysis) && (
                    <div className="p-3 rounded-lg border border-green-200 bg-green-50/30 dark:bg-green-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">What the Student Did Well</span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {whatStudentDidCorrectly || approachAnalysis}
                      </p>
                    </div>
                  )}

                  {/* Strengths Analysis */}
                  {strengthsAnalysis && strengthsAnalysis.length > 0 && (
                    <div className="p-3 rounded-lg border border-green-200 bg-green-50/30 dark:bg-green-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Strengths</span>
                      </div>
                      <ul className="space-y-1">
                        {strengthsAnalysis.map((s, i) => (
                          <li key={i} className="text-xs leading-relaxed text-foreground/80 flex items-start gap-1">
                            <span className="text-green-500 mt-0.5 shrink-0">+</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Areas for Improvement */}
                  {areasForImprovement && areasForImprovement.length > 0 && (
                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Target className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Areas for Improvement</span>
                      </div>
                      <ul className="space-y-1">
                        {areasForImprovement.map((a, i) => (
                          <li key={i} className="text-xs leading-relaxed text-foreground/80 flex items-start gap-1">
                            <span className="text-amber-500 mt-0.5 shrink-0">-</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* What Student Got Wrong - if any text response */}
                  {whatStudentGotWrong && (
                    <div className="p-3 rounded-lg border border-orange-200 bg-orange-50/30 dark:bg-orange-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                        <span className="text-xs font-medium text-orange-700 dark:text-orange-400">What Needs Correction</span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {whatStudentGotWrong}
                      </p>
                    </div>
                  )}

                  {/* Grade Justification */}
                  {gradeJustification && (
                    <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Grade Justification</span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {gradeJustification}
                      </p>
                    </div>
                  )}

                  {/* Feedback & Suggestions */}
                  {feedback && (
                    <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/30 dark:bg-purple-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-purple-600" />
                        <span className="text-xs font-medium text-purple-700 dark:text-purple-400">Feedback & Suggestions</span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {feedback}
                      </p>
                    </div>
                  )}

                  {/* Regents Score & Justification */}
                  {regentsScore !== undefined && (
                    <div className="p-3 rounded-lg border border-muted bg-muted/30">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground">NYS Regents Score: {regentsScore}/4</span>
                      </div>
                      {regentsScoreJustification && (
                        <p className="text-xs leading-relaxed text-foreground/80">
                          {regentsScoreJustification}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Save feedback button */}
              {noErrorConfirmed && (
                <div className="p-3 border-t bg-muted/30">
                  <Button
                    className="w-full gap-2"
                    onClick={handleSaveFeedback}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4" />
                    )}
                    Save & Train AI
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                    Your feedback improves future grading accuracy
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          <span className="mr-4">← → Navigate papers</span>
          <span className="mr-4">+ - Zoom</span>
          <span className="mr-4">R Rotate</span>
          <span>0 Reset</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BatchImageZoomDialog;
