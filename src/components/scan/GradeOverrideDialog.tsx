import { useState } from 'react';
import { Edit2, RefreshCw, CheckCircle, Brain } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGradingCorrections } from '@/hooks/useGradingCorrections';
import { toast } from 'sonner';

interface ReassessmentCriteria {
  id: string;
  label: string;
  description: string;
  gradeAdjustment: number;
}

const POSITIVE_CRITERIA: ReassessmentCriteria[] = [
  {
    id: 'showed_work',
    label: 'Showed Work',
    description: 'Student showed their problem-solving process',
    gradeAdjustment: 5,
  },
  {
    id: 'partial_understanding',
    label: 'Partial Understanding',
    description: 'Demonstrated partial understanding of concepts',
    gradeAdjustment: 8,
  },
  {
    id: 'computational_error',
    label: 'Computational Error Only',
    description: 'Correct approach but arithmetic/calculation error',
    gradeAdjustment: 10,
  },
  {
    id: 'misread_problem',
    label: 'Misread Problem',
    description: 'Would have been correct if problem was read correctly',
    gradeAdjustment: 12,
  },
  {
    id: 'effort_evident',
    label: 'Effort Evident',
    description: 'Clear effort was made despite incorrect answer',
    gradeAdjustment: 5,
  },
  {
    id: 'close_answer',
    label: 'Close Answer',
    description: 'Answer was very close to correct',
    gradeAdjustment: 7,
  },
];

const NEGATIVE_CRITERIA: ReassessmentCriteria[] = [
  {
    id: 'ai_too_lenient',
    label: 'AI Too Lenient',
    description: 'AI gave too much credit for this work',
    gradeAdjustment: -10,
  },
  {
    id: 'incomplete_work',
    label: 'Incomplete Work',
    description: 'Work is missing key steps that AI credited',
    gradeAdjustment: -8,
  },
  {
    id: 'wrong_method',
    label: 'Wrong Method Used',
    description: 'Student used an invalid approach the AI accepted',
    gradeAdjustment: -12,
  },
  {
    id: 'no_work_shown',
    label: 'No Work Shown',
    description: 'Answer only with no supporting work',
    gradeAdjustment: -15,
  },
  {
    id: 'copied_work',
    label: 'Copied / Not Original',
    description: 'Work appears copied or not the student\'s own',
    gradeAdjustment: -20,
  },
];

interface GradeOverrideDialogProps {
  currentGrade: number;
  currentJustification?: string;
  onOverride: (grade: number, justification: string) => void;
  disabled?: boolean;
  studentId?: string;
  attemptId?: string;
  topicName?: string;
  regentsScore?: number;
}

export function GradeOverrideDialog({
  currentGrade,
  currentJustification,
  onOverride,
  disabled = false,
  studentId,
  attemptId,
  topicName = 'General',
  regentsScore,
}: GradeOverrideDialogProps) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(currentGrade);
  const [justification, setJustification] = useState(currentJustification || '');
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('quick');
  const [isSaving, setIsSaving] = useState(false);
  const { saveCorrection } = useGradingCorrections();

  const allCriteria = [...POSITIVE_CRITERIA, ...NEGATIVE_CRITERIA];

  const handleCriteriaToggle = (criteriaId: string) => {
    setSelectedCriteria(prev => {
      const newCriteria = prev.includes(criteriaId)
        ? prev.filter(id => id !== criteriaId)
        : [...prev, criteriaId];
      
      // Calculate new grade based on selected criteria
      const totalAdjustment = newCriteria.reduce((sum, id) => {
        const criteria = allCriteria.find(c => c.id === id);
        return sum + (criteria?.gradeAdjustment || 0);
      }, 0);
      
      const newGrade = Math.max(0, Math.min(100, currentGrade + totalAdjustment));
      setGrade(newGrade);
      
      // Auto-generate justification based on selected criteria
      const selectedLabels = newCriteria.map(id => 
        allCriteria.find(c => c.id === id)?.label
      ).filter(Boolean);
      
      if (selectedLabels.length > 0) {
        setJustification(`Grade adjusted based on: ${selectedLabels.join(', ')}`);
      }
      
      return newCriteria;
    });
  };

  const handleSubmit = async () => {
    if (!justification.trim()) return;
    
    setIsSaving(true);
    
    // Map selected criteria to grading focus
    const gradingFocus = selectedCriteria.map(id => {
      switch (id) {
        case 'showed_work': return 'work_shown';
        case 'partial_understanding': return 'partial_credit';
        case 'computational_error': return 'methodology';
        case 'effort_evident': return 'effort';
        default: return id;
      }
    });
    
    // Save the correction for AI training
    const result = await saveCorrection({
      studentId,
      attemptId,
      topicName,
      aiGrade: Math.round(currentGrade),
      aiRegentsScore: regentsScore,
      aiJustification: currentJustification,
      correctedGrade: Math.round(grade),
      correctionReason: justification.trim(),
      gradingFocus: gradingFocus.length > 0 ? gradingFocus : undefined,
    });

    if (result.success) {
      toast.success('Grade updated & AI training saved', {
        description: 'The AI will learn from this correction.',
        icon: <Brain className="h-4 w-4" />,
      });
    }
    
    onOverride(grade, justification.trim());
    setIsSaving(false);
    setOpen(false);
  };

  const handleReset = () => {
    setGrade(currentGrade);
    setSelectedCriteria([]);
    setJustification('');
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 90) return 'text-green-600';
    if (grade >= 80) return 'text-blue-600';
    if (grade >= 70) return 'text-yellow-600';
    return 'text-orange-600';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className="gap-1">
          <Edit2 className="h-3.5 w-3.5" />
          Override
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override AI Grade</DialogTitle>
          <DialogDescription>
            Adjust the grade using quick criteria or set a manual override.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quick" className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Quick Reassess
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1">
              <Edit2 className="h-3.5 w-3.5" />
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Raise Grade:</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[130px] overflow-y-auto">
                {POSITIVE_CRITERIA.map(criteria => (
                  <div
                    key={criteria.id}
                    className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      selectedCriteria.includes(criteria.id)
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleCriteriaToggle(criteria.id)}
                  >
                    <Checkbox
                      checked={selectedCriteria.includes(criteria.id)}
                      onCheckedChange={() => handleCriteriaToggle(criteria.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">
                        {criteria.label}
                        <span className="ml-1 text-xs text-green-600">
                          +{criteria.gradeAdjustment}%
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {criteria.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Label>Lower Grade:</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[130px] overflow-y-auto">
                {NEGATIVE_CRITERIA.map(criteria => (
                  <div
                    key={criteria.id}
                    className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                      selectedCriteria.includes(criteria.id)
                        ? 'bg-destructive/10 border-destructive'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleCriteriaToggle(criteria.id)}
                  >
                    <Checkbox
                      checked={selectedCriteria.includes(criteria.id)}
                      onCheckedChange={() => handleCriteriaToggle(criteria.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">
                        {criteria.label}
                        <span className="ml-1 text-xs text-destructive">
                          {criteria.gradeAdjustment}%
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {criteria.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Original Grade</p>
                <p className="text-lg font-semibold">{Math.round(currentGrade)}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Adjustment</p>
                <p className={`text-lg font-semibold ${grade - currentGrade >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {grade - currentGrade >= 0 ? '+' : ''}{Math.round(grade - currentGrade)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">New Grade</p>
                <p className={`text-lg font-bold ${getGradeColor(grade)}`}>
                  {Math.round(grade)}%
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="grade">Grade (0-100)</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[grade]}
                  onValueChange={([value]) => setGrade(value)}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <Input
                  id="grade"
                  type="number"
                  min={0}
                  max={100}
                  value={grade}
                  onChange={(e) => setGrade(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-20"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (Below Standards)</span>
                <span className={`font-medium ${getGradeColor(grade)}`}>
                  {grade >= 90 ? 'Exceeds' : grade >= 80 ? 'Meets' : grade >= 70 ? 'Approaching' : 'Below'} Standards
                </span>
                <span>100 (Exceeds)</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="justification">Justification (required)</Label>
          <Textarea
            id="justification"
            placeholder="Explain why you're adjusting the grade..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!justification.trim() || isSaving}>
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Save Override
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
