import { useRef, useState, useEffect, useCallback } from 'react';
import { X, SwitchCamera, Volume2, VolumeX, QrCode, Check, Users, Pause, Play, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { parseAnyStudentQRCode } from '@/components/print/StudentOnlyQRCode';
import { parseStudentQRCode } from '@/components/print/StudentQRCode';
import { playNotificationSound } from '@/lib/notificationSound';
import jsQR from 'jsqr';
import { useStudentNames } from '@/lib/StudentNameContext';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
}

interface ScannedStudent {
  studentId: string;
  studentName: string;
  questionId?: string;
  scannedAt: Date;
  type: 'student-only' | 'student-question';
}

interface ContinuousQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  studentRoster: Student[];
  onScanComplete?: (scannedStudents: ScannedStudent[]) => void;
}

export function ContinuousQRScanner({ 
  isOpen, 
  onClose, 
  studentRoster,
  onScanComplete 
}: ContinuousQRScannerProps) {
  const { getDisplayName } = useStudentNames();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannedStudents, setScannedStudents] = useState<ScannedStudent[]>([]);
  const [lastDetectedCode, setLastDetectedCode] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ message: string; type: 'success' | 'duplicate' | 'unknown' } | null>(null);
  const [activeTab, setActiveTab] = useState<'scanned' | 'absent'>('scanned');
  
  // Track scanned student IDs to avoid duplicates
  const scannedIdsRef = useRef<Set<string>>(new Set());
  
  // Get absent students (those in roster but not scanned)
  const absentStudents = studentRoster.filter(
    student => !scannedIdsRef.current.has(student.id)
  );
  
  // Mark a student as absent (add to scanned list with absent flag)
  const markStudentAbsent = useCallback((studentId: string) => {
    const student = studentRoster.find(s => s.id === studentId);
    if (student && !scannedIdsRef.current.has(studentId)) {
      scannedIdsRef.current.add(studentId);
      const newScanned: ScannedStudent = {
        studentId,
        studentName: `${student.first_name} ${student.last_name}`,
        scannedAt: new Date(),
        type: 'student-only',
      };
      setScannedStudents(prev => [newScanned, ...prev]);
      if (soundEnabled) {
        playNotificationSound('success');
      }
    }
  }, [studentRoster, soundEnabled]);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsReady(false);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsReady(true);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError('Unable to access camera.');
        }
      } else {
        setError('Unable to access camera.');
      }
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isReady || isPaused) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Scan multiple regions for QR codes
    const regions = [
      // Bottom-right corner (diagnostic worksheet QR location - prioritize this)
      { 
        x: Math.floor(canvas.width * 0.6), 
        y: Math.floor(canvas.height * 0.6), 
        w: Math.floor(canvas.width * 0.4), 
        h: Math.floor(canvas.height * 0.4) 
      },
      // Center region (most likely location)
      { 
        x: Math.floor(canvas.width * 0.2), 
        y: Math.floor(canvas.height * 0.2), 
        w: Math.floor(canvas.width * 0.6), 
        h: Math.floor(canvas.height * 0.6) 
      },
      // Top-left
      { x: 0, y: 0, w: Math.floor(canvas.width * 0.4), h: Math.floor(canvas.height * 0.4) },
      // Top-right
      { x: Math.floor(canvas.width * 0.6), y: 0, w: Math.floor(canvas.width * 0.4), h: Math.floor(canvas.height * 0.4) },
      // Bottom-left
      { x: 0, y: Math.floor(canvas.height * 0.6), w: Math.floor(canvas.width * 0.4), h: Math.floor(canvas.height * 0.4) },
      // Full frame (fallback)
      { x: 0, y: 0, w: canvas.width, h: canvas.height },
    ];

    for (const region of regions) {
      try {
        const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
        const code = jsQR(imageData.data, region.w, region.h, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data !== lastDetectedCode) {
          // Try unified parser first
          let parsed = parseAnyStudentQRCode(code.data);
          
          // Fallback to legacy parser
          if (!parsed) {
            const legacy = parseStudentQRCode(code.data);
            if (legacy) {
              parsed = { ...legacy, type: 'student-question' as const };
            }
          }

          if (parsed) {
            setLastDetectedCode(code.data);
            
            // Check if already scanned
            if (scannedIdsRef.current.has(parsed.studentId)) {
              // Find student name for duplicate message
              const student = studentRoster.find(s => s.id === parsed!.studentId);
              setScanFeedback({ 
                message: student ? `${student.first_name} ${student.last_name} already scanned` : 'Already scanned',
                type: 'duplicate' 
              });
              setTimeout(() => setScanFeedback(null), 1500);
            } else {
              // Find matching student in roster
              const student = studentRoster.find(s => s.id === parsed!.studentId);
              
              if (student) {
                // New successful scan
                scannedIdsRef.current.add(parsed.studentId);
                const newScanned: ScannedStudent = {
                  studentId: parsed.studentId,
                  studentName: `${student.first_name} ${student.last_name}`,
                  questionId: parsed.questionId,
                  scannedAt: new Date(),
                  type: parsed.type,
                };
                
                setScannedStudents(prev => [newScanned, ...prev]);
                setScanFeedback({ 
                  message: `✓ ${student.first_name} ${student.last_name}`,
                  type: 'success' 
                });
                
                if (soundEnabled) {
                  playNotificationSound('success');
                }
                
                setTimeout(() => setScanFeedback(null), 1500);
              } else {
                // QR code detected but student not in roster
                setScanFeedback({ 
                  message: 'Student not in roster',
                  type: 'unknown' 
                });
                setTimeout(() => setScanFeedback(null), 1500);
              }
            }
            
            // Clear last detected code after a delay to allow re-scanning same code
            setTimeout(() => setLastDetectedCode(null), 2000);
            break;
          }
        }
      } catch (e) {
        // Continue scanning
      }
    }

    animationRef.current = requestAnimationFrame(scanFrame);
  }, [isReady, isPaused, lastDetectedCode, studentRoster, soundEnabled]);

  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    if (onScanComplete && scannedStudents.length > 0) {
      onScanComplete(scannedStudents);
    }
    onClose();
  }, [stopCamera, onClose, onScanComplete, scannedStudents]);

  const clearScanned = useCallback(() => {
    setScannedStudents([]);
    scannedIdsRef.current.clear();
  }, []);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      setScannedStudents([]);
      scannedIdsRef.current.clear();
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // Start continuous scanning when ready
  useEffect(() => {
    if (isReady && !isPaused) {
      animationRef.current = requestAnimationFrame(scanFrame);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isReady, isPaused, scanFrame]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header controls */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-30">
        <button
          onClick={handleClose}
          className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Close scanner"
        >
          <X className="h-6 w-6" />
        </button>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-black/50 text-white border-white/30">
            <Users className="h-3 w-3 mr-1" />
            {scannedStudents.length} / {studentRoster.length}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            aria-label={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            onClick={switchCamera}
            className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            aria-label="Switch camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Video preview */}
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white p-6 max-w-md">
              <QrCode className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-4">{error}</p>
              <Button onClick={startCamera} variant="outline" className="bg-transparent border-white text-white">
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
              isReady ? "opacity-100" : "opacity-0"
            )}
          />
        )}

        {/* Loading state */}
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p>Starting camera...</p>
            </div>
          </div>
        )}

        {/* Scan guide overlay */}
        {isReady && !error && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Center scan area */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div 
                className={cn(
                  "w-48 h-48 border-4 rounded-2xl transition-all duration-300",
                  scanFeedback?.type === 'success' 
                    ? "border-green-400 bg-green-400/20" 
                    : scanFeedback?.type === 'duplicate'
                    ? "border-yellow-400 bg-yellow-400/20"
                    : scanFeedback?.type === 'unknown'
                    ? "border-red-400 bg-red-400/20"
                    : "border-white/50"
                )}
              >
                {/* Corner guides */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-l-4 border-t-4 border-white rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-r-4 border-t-4 border-white rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-l-4 border-b-4 border-white rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-r-4 border-b-4 border-white rounded-br-lg" />
              </div>
            </div>

            {/* Scan feedback */}
            {scanFeedback && (
              <div className="absolute top-1/3 left-0 right-0 flex justify-center">
                <div 
                  className={cn(
                    "px-6 py-3 rounded-full text-lg font-semibold animate-in fade-in zoom-in duration-200",
                    scanFeedback.type === 'success' && "bg-green-500 text-white",
                    scanFeedback.type === 'duplicate' && "bg-yellow-500 text-black",
                    scanFeedback.type === 'unknown' && "bg-red-500 text-white"
                  )}
                >
                  {scanFeedback.message}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="absolute top-20 left-0 right-0 text-center">
              <p className="text-white/80 text-sm bg-black/40 inline-block px-4 py-2 rounded-full">
                <QrCode className="h-4 w-4 inline-block mr-2" />
                Point camera at student QR codes
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Scanned/Absent students panel */}
      <div className="bg-background border-t">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scanned' | 'absent')} className="w-full">
          <div className="px-3 pt-2 flex items-center justify-between">
            <TabsList className="grid grid-cols-2 w-auto">
              <TabsTrigger value="scanned" className="flex items-center gap-1.5 text-xs px-3">
                <UserCheck className="h-3.5 w-3.5" />
                Scanned ({scannedStudents.length})
              </TabsTrigger>
              <TabsTrigger value="absent" className="flex items-center gap-1.5 text-xs px-3">
                <UserX className="h-3.5 w-3.5" />
                Absent ({absentStudents.length})
              </TabsTrigger>
            </TabsList>
            
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
                className="h-8 px-2"
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              {scannedStudents.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearScanned}
                  className="h-8 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleClose}
                className="h-8"
              >
                Done ({scannedStudents.length})
              </Button>
            </div>
          </div>

          <TabsContent value="scanned" className="mt-0">
            <ScrollArea className="h-36">
              <div className="p-2 space-y-1">
                {scannedStudents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <QrCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No students scanned yet</p>
                    <p className="text-xs">Point camera at student QR codes</p>
                  </div>
                ) : (
                  scannedStudents.map((student, index) => (
                    <div 
                      key={`${student.studentId}-${index}`}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{student.studentName}</span>
                        {student.questionId && (
                          <Badge variant="outline" className="text-xs">Q: {student.questionId.slice(0, 8)}...</Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {student.scannedAt.toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="absent" className="mt-0">
            <ScrollArea className="h-36">
              <div className="p-2 space-y-1">
                {absentStudents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">All students scanned!</p>
                    <p className="text-xs">No absent students</p>
                  </div>
                ) : (
                  absentStudents.map((student) => (
                    <div 
                      key={student.id}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-red-500" />
                        <span className="font-medium">{getDisplayName(student.id, student.first_name, student.last_name)}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markStudentAbsent(student.id)}
                        className="h-7 text-xs"
                      >
                        Mark Present
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Hidden canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
