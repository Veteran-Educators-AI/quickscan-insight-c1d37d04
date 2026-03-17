import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, CheckCircle, X, Plus, Image as ImageIcon, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { resizeImage, blobToBase64 } from '@/lib/imageUtils';

interface CreateAnswerSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnswerSheetUploaded?: (images: string[]) => void;
}

export function CreateAnswerSheetDialog({ open, onOpenChange, onAnswerSheetUploaded }: CreateAnswerSheetDialogProps) {
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File): Promise<string> => {
    try {
      const resizedBlob = await resizeImage(file);
      return await blobToBase64(resizedBlob);
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const newImages: string[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await processFile(file);
        newImages.push(dataUrl);
      }
      setAnswerImages(prev => [...prev, ...newImages]);
    } catch {
      toast.error('Failed to process one or more images');
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setAnswerImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleUseAsGuide = () => {
    if (answerImages.length && onAnswerSheetUploaded) {
      onAnswerSheetUploaded(answerImages);
      onOpenChange(false);
      toast.success(`Answer sheet uploaded (${answerImages.length} page${answerImages.length !== 1 ? 's' : ''}) — ready for grading!`);
    }
  };

  const handleReset = () => {
    setAnswerImages([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Upload Answer Sheet
          </DialogTitle>
          <DialogDescription>
            Upload your answer key pages. These will be used as the grading reference when scanning student work.
          </DialogDescription>
        </DialogHeader>

        {answerImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Upload Your Answer Key</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select one or more pages of your answer sheet
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Select Pages
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ScrollArea className="max-h-[320px]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {answerImages.map((img, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border bg-muted/30">
                    <img
                      src={img}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-36 object-contain"
                    />
                    <div className="absolute top-1 left-1">
                      <Badge variant="secondary" className="text-xs">
                        Page {idx + 1}
                      </Badge>
                    </div>
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => addMoreRef.current?.click()}
                  className="flex flex-col items-center justify-center h-36 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors gap-2"
                >
                  <Plus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add Pages</span>
                </button>
              </div>
            </ScrollArea>

            <input
              ref={addMoreRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              {answerImages.length} page{answerImages.length !== 1 ? 's' : ''} uploaded
            </div>

            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" onClick={handleReset}>
                Start Over
              </Button>
              <Button onClick={handleUseAsGuide} className="flex-1">
                <CheckCircle className="h-4 w-4 mr-2" />
                Use as Grading Guide
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
