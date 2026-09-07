import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronUp,
  Quote,
  Target,
  X,
  Lightbulb,
  FileSpreadsheet,
  Loader2,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PrintRemediationQuestionsDialog } from '@/components/print/PrintRemediationQuestionsDialog';
import { useStudentNames } from '@/lib/StudentNameContext';

interface ClassMisconceptionSummaryProps {
  classId?: string;
}

interface GradeWithStudent {
  id: string;
  topic_name: string;
  grade: number;
  grade_justification: string | null;
  nys_standard: string | null;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface ExtractedMisconception {
  title: string;
  category: string;
  specificError: string; // What exactly the student did wrong - with evidence
  evidenceQuote: string; // Direct quote or citation from student work
  expectedAction: string; // What they should have done instead - specific correction
  whyItMatters: string; // Why this error caused point deduction
  severity: 'high' | 'medium' | 'low';
  studentName: string;
  studentId: string;
  topic: string;
  grade: number;
  date: string;
  standard?: string | null;
}

interface GroupedMisconception {
  category: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  studentCount: number;
  instances: ExtractedMisconception[];
  commonTopics: string[];
  suggestedRemedies: string[];
}

// Identify misconception category
const identifyMisconceptionCategory = (text: string): { category: string; title: string } => {
  const textLower = text.toLowerCase();
  
  if (/sign|negative|positive|minus|plus/.test(textLower)) {
    return { category: 'Sign Errors', title: 'Incorrect handling of positive/negative signs' };
  }
  if (/order.*operation|pemdas|bedmas/.test(textLower)) {
    return { category: 'Order of Operations', title: 'PEMDAS/order of operations confusion' };
  }
  if (/fraction|numerator|denominator|divide.*fraction/.test(textLower)) {
    return { category: 'Fraction Operations', title: 'Misunderstanding fraction operations' };
  }
  if (/decimal|place.*value|point/.test(textLower)) {
    return { category: 'Decimal Operations', title: 'Decimal place value errors' };
  }
  if (/variable|substitute|expression|algebraic/.test(textLower)) {
    return { category: 'Algebraic Expressions', title: 'Variable and expression errors' };
  }
  if (/equation|solve|isolate|both.*side/.test(textLower)) {
    return { category: 'Equation Solving', title: 'Equation solving procedural errors' };
  }
  if (/graph|coordinate|plot|slope|intercept/.test(textLower)) {
    return { category: 'Graphing', title: 'Graphing and coordinate errors' };
  }
  if (/exponent|power|base|squared|cubed/.test(textLower)) {
    return { category: 'Exponents', title: 'Exponent rule misconceptions' };
  }
  if (/area|perimeter|volume|surface/.test(textLower)) {
    return { category: 'Measurement', title: 'Area/perimeter/volume calculation errors' };
  }
  if (/angle|triangle|polygon|parallel|perpendicular/.test(textLower)) {
    return { category: 'Geometry Concepts', title: 'Geometric relationship misunderstandings' };
  }
  if (/proportion|ratio|percent|rate/.test(textLower)) {
    return { category: 'Ratios & Proportions', title: 'Ratio and proportion errors' };
  }
  if (/calculation|arithmetic|compute|multiply|divide|add|subtract/.test(textLower)) {
    return { category: 'Calculation Error', title: 'Arithmetic or calculation mistakes' };
  }
  if (/formula|apply|use.*wrong|incorrect.*formula/.test(textLower)) {
    return { category: 'Formula Application', title: 'Incorrect formula usage' };
  }
  if (/unit|convert|measurement/.test(textLower)) {
    return { category: 'Unit Conversion', title: 'Unit conversion errors' };
  }
  if (/incomplete|missing.*work|show.*work|justify/.test(textLower)) {
    return { category: 'Incomplete Work', title: 'Missing work or justification' };
  }
  if (/setup|translate|word.*problem|interpret/.test(textLower)) {
    return { category: 'Problem Setup', title: 'Incorrect problem interpretation' };
  }
  if (/concept|understand|misunderstand|confus/.test(textLower)) {
    return { category: 'Conceptual Understanding', title: 'Fundamental concept misunderstanding' };
  }
  
  return { category: 'Other Errors', title: 'Mathematical error' };
};

// Get remedies for category with topic context
const getRemediesForCategory = (category: string, topics: string[] = []): string[] => {
  const topicContext = topics.length > 0 ? topics[0].replace(/\*\*/g, '').trim() : category;
  
  const remedies: Record<string, string[]> = {
    'Sign Errors': [
      `Targeted practice problems on signed number operations within ${topicContext}`,
      'Number line visualization exercises with positive/negative values',
      'Real-world context problems (temperature, elevation, debt/credit)',
    ],
    'Order of Operations': [
      `Targeted practice problems on PEMDAS application in ${topicContext}`,
      'Step-by-step expression evaluation with grouping symbols',
      'Error analysis: find and fix order-of-operations mistakes',
    ],
    'Fraction Operations': [
      `Targeted practice problems on fraction computation in ${topicContext}`,
      'Visual fraction model exercises with area/bar models',
      'Common denominator and reciprocal operation drills',
    ],
    'Decimal Operations': [
      `Targeted practice problems on decimal place value in ${topicContext}`,
      'Money-based computation problems',
      'Decimal-fraction conversion exercises',
    ],
    'Algebraic Expressions': [
      `Targeted practice problems on expression manipulation in ${topicContext}`,
      'Like terms identification and combining drills',
      'Variable substitution and evaluation exercises',
    ],
    'Equation Solving': [
      `Targeted practice problems on solving equations in ${topicContext}`,
      'Balance method step-by-step walkthroughs',
      'Solution verification and checking exercises',
    ],
    'Graphing': [
      `Targeted practice problems on graphing and coordinates in ${topicContext}`,
      'Slope calculation from multiple representations',
      'Point plotting and line interpretation exercises',
    ],
    'Exponents': [
      `Targeted practice problems on exponent rules in ${topicContext}`,
      'Pattern recognition with powers and bases',
      'Exponent law application drills',
    ],
    'Measurement': [
      `Targeted practice problems on measurement formulas in ${topicContext}`,
      'Formula selection decision exercises',
      'Real-world measurement applications with units',
    ],
    'Geometry Concepts': [
      `Targeted practice problems on geometric relationships in ${topicContext}`,
      'Angle relationship identification exercises',
      'Property application and proof practice',
    ],
    'Ratios & Proportions': [
      `Targeted practice problems on ratios and proportions in ${topicContext}`,
      'Cross-multiplication and proportion setup drills',
      'Real-world rate and ratio applications',
    ],
    'Calculation Error': [
      `Targeted practice problems on arithmetic accuracy in ${topicContext}`,
      'Mental math strategy development',
      'Self-checking and estimation techniques',
    ],
    'Formula Application': [
      `Targeted practice problems on formula usage in ${topicContext}`,
      'When-to-use formula decision trees',
      'Formula derivation and understanding exercises',
    ],
    'Unit Conversion': [
      `Targeted practice problems on unit conversion in ${topicContext}`,
      'Dimensional analysis step-by-step practice',
      'Unit relationship mapping exercises',
    ],
    'Incomplete Work': [
      `Targeted practice problems requiring full justification in ${topicContext}`,
      'Structured solution template exercises',
      'Work verification checklist practice',
    ],
    'Problem Setup': [
      `Targeted practice problems on problem translation in ${topicContext}`,
      'Key information identification exercises',
      'Diagram and model creation practice',
    ],
    'Conceptual Understanding': [
      `Targeted practice problems on concept application in ${topicContext}`,
      'Explain-your-reasoning exercises',
      'Multiple representation tasks',
    ],
    'Other Errors': [
      `Targeted practice problems on ${topicContext}`,
      'One-on-one review and error analysis',
      'Focused skill-building exercises',
    ],
  };
  
  return remedies[category] || remedies['Other Errors'];
};

// Extract structured misconception with DISTINCT specific error vs expected correction
const extractMisconceptionFromJustification = (
  justification: string,
  studentName: string,
  studentId: string,
  topic: string,
  grade: number,
  date: string,
  standard?: string | null
): ExtractedMisconception | null => {
  if (!justification || justification.length < 20) return null;
  
  // Clean the justification
  const cleaned = justification.replace(/\*\*/g, '').replace(/\*\s*/g, '').trim();
  
  // Check if there's an error indicator
  const hasError = /error|mistake|incorrect|wrong|missing|forgot|failed|did not|didn't|omitted|lost|deducted|issue|problem|misconception|confused/i.test(cleaned);
  if (!hasError) return null;
  
  const { category, title } = identifyMisconceptionCategory(cleaned);
  
  // Extract specific evidence from student work
  let evidenceQuote = '';
  let specificError = '';
  let expectedAction = '';
  let whyItMatters = '';
  
  // Look for direct quotes or specific values the student wrote
  const quotePatterns = [
    /"([^"]{5,150})"/,
    /'([^']{5,150})'/,
    /student (?:wrote|answered|calculated|got|gave)\s*[:"]?\s*["']?([^"'\n.]{5,100})["']?/i,
    /(?:their|the) (?:answer|response|calculation|result)\s*(?:was|is|reads?|showed?)?\s*[:"]?\s*["']?([^"'\n.]{5,100})["']?/i,
    /(?:obtained|calculated|arrived at|got)\s+["']?([0-9][^"'\n.]{0,50})["']?/i,
  ];
  
  for (const pattern of quotePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      evidenceQuote = match[1].trim();
      break;
    }
  }
  
  // Extract specific error patterns - what EXACTLY went wrong
  const errorExtractionPatterns = [
    // Pattern: "X instead of Y"
    {
      pattern: /(?:wrote|calculated|got|used|applied)\s+["']?([^"'\n,]{3,60})["']?\s+(?:instead of|rather than|but should (?:have )?(?:been|used))\s+["']?([^"'\n,]{3,60})["']?/i,
      extract: (m: RegExpMatchArray) => ({
        error: `Wrote "${m[1].trim()}" when the calculation should yield a different result`,
        expected: `The correct approach would produce "${m[2].trim()}"`,
        why: `This error resulted in an incorrect final answer`
      })
    },
    // Pattern: forgot/failed/omitted to X
    {
      pattern: /(?:forgot|failed|neglected|omitted|did not|didn't)\s+(?:to\s+)?(.{10,80}?)(?:\.|,|which|resulting|causing|$)/i,
      extract: (m: RegExpMatchArray) => ({
        error: `Failed to ${m[1].trim().toLowerCase()}`,
        expected: `Must ${m[1].trim().toLowerCase()} to complete the problem correctly`,
        why: `Omitting this step leads to an incomplete or incorrect solution`
      })
    },
    // Pattern: incorrectly X
    {
      pattern: /(?:incorrectly|wrongly)\s+(.{10,80}?)(?:\.|,|when|instead|$)/i,
      extract: (m: RegExpMatchArray) => ({
        error: `Incorrectly ${m[1].trim().toLowerCase()}`,
        expected: `This operation must be performed correctly following standard procedure`,
        why: `This procedural error propagates through the solution`
      })
    },
    // Pattern: made a X error
    {
      pattern: /made (?:a|an)\s+(.{5,40}?)\s*error/i,
      extract: (m: RegExpMatchArray) => ({
        error: `Made a ${m[1].trim().toLowerCase()} error in the work`,
        expected: `Careful attention to ${m[1].trim().toLowerCase()} is required`,
        why: `This type of error affects the accuracy of the final answer`
      })
    },
    // Pattern: confused X with Y
    {
      pattern: /(?:confused|mixed up)\s+(.{5,40}?)\s+(?:with|and)\s+(.{5,40}?)(?:\.|,|$)/i,
      extract: (m: RegExpMatchArray) => ({
        error: `Confused ${m[1].trim()} with ${m[2].trim()}`,
        expected: `${m[1].trim()} and ${m[2].trim()} are distinct concepts that must be applied differently`,
        why: `This conceptual confusion led to applying the wrong approach`
      })
    },
  ];
  
  for (const { pattern, extract } of errorExtractionPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const extracted = extract(match);
      specificError = extracted.error;
      expectedAction = extracted.expected;
      whyItMatters = extracted.why;
      break;
    }
  }
  
  // If no specific pattern matched, build from category-based templates
  if (!specificError) {
    // Extract any numbers mentioned
    const numberPattern = /(\d+(?:\.\d+)?|\-?\d+(?:\/\d+)?)/g;
    const numbers = cleaned.match(numberPattern);
    
    // Category-specific error templates with distinct error vs expected
    const categoryTemplates: Record<string, { error: string; expected: string; why: string }> = {
      'Sign Errors': { 
        error: 'Applied incorrect sign (positive/negative) during calculation',
        expected: 'Track signs through each operation: negative × negative = positive, negative × positive = negative',
        why: 'Sign errors flip the answer to wrong direction/value'
      },
      'Order of Operations': { 
        error: 'Performed operations in incorrect sequence',
        expected: 'Follow PEMDAS strictly: Parentheses → Exponents → Multiplication/Division (L→R) → Addition/Subtraction (L→R)',
        why: 'Wrong order produces entirely different result'
      },
      'Fraction Operations': { 
        error: 'Applied incorrect procedure for fraction operation',
        expected: 'For add/subtract: find common denominator first. For multiply: multiply across. For divide: multiply by reciprocal',
        why: 'Each fraction operation has specific required steps'
      },
      'Calculation Error': { 
        error: numbers ? `Calculation yielded ${numbers[0]} but arithmetic check shows different value` : 'Made an arithmetic error in computation',
        expected: 'Double-check arithmetic by working backwards or using estimation',
        why: 'Calculation errors invalidate otherwise correct procedure'
      },
      'Algebraic Expressions': { 
        error: 'Made an error manipulating the algebraic expression',
        expected: 'Combine only like terms; apply distributive property completely',
        why: 'Expression errors carry through to final answer'
      },
      'Equation Solving': { 
        error: 'Made procedural error while isolating the variable',
        expected: 'Apply inverse operations to both sides equally; work systematically',
        why: 'Equation solving errors produce incorrect solution value'
      },
      'Graphing': { 
        error: 'Error in graphing or interpreting coordinate data',
        expected: 'Slope = rise/run = (y₂-y₁)/(x₂-x₁); y-intercept is where x=0',
        why: 'Graphing errors misrepresent the relationship'
      },
      'Incomplete Work': { 
        error: 'Did not show complete work or justify the answer',
        expected: 'Show all steps clearly; write final answer with units if applicable',
        why: 'Without shown work, partial credit cannot be awarded'
      },
    };
    
    const template = categoryTemplates[category] || {
      error: 'Made a mathematical error in solving this problem',
      expected: 'Review the problem-solving steps and verify each calculation',
      why: 'This error resulted in point deduction'
    };
    
    specificError = template.error;
    expectedAction = template.expected;
    whyItMatters = template.why;
  }
  
  // If we found a quote but no specific error description uses it, incorporate it
  if (evidenceQuote && !specificError.includes(evidenceQuote)) {
    specificError = `${specificError}. Student wrote: "${evidenceQuote}"`;
  }
  
  // Determine severity based on grade and keywords
  let severity: 'high' | 'medium' | 'low' = 'medium';
  if (/fundamental|basic|completely|entirely|major|critical|no.*understanding|zero|failed|serious/i.test(cleaned) || grade < 50) {
    severity = 'high';
  } else if (/minor|small|slight|almost|nearly|rounding|notation|careless/i.test(cleaned) || grade >= 80) {
    severity = 'low';
  }
  
  return {
    title,
    category,
    specificError,
    evidenceQuote,
    expectedAction,
    whyItMatters,
    severity,
    studentName,
    studentId,
    topic,
    grade,
    date,
    standard,
  };
};

export function ClassMisconceptionSummary({ classId }: ClassMisconceptionSummaryProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isGeneratingWorksheet, setIsGeneratingWorksheet] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [worksheetQuestions, setWorksheetQuestions] = useState<any[]>([]);
  const [showWorksheetDialog, setShowWorksheetDialog] = useState(false);

  // Fetch grade history with student info for the class
  const { data: gradeData, isLoading } = useQuery({
    queryKey: ['class-misconceptions', classId, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('grade_history')
        .select(`
          id,
          topic_name,
          grade,
          grade_justification,
          nys_standard,
          created_at,
          student:students!inner(id, first_name, last_name, class_id)
        `)
        .eq('teacher_id', user!.id)
        .not('grade_justification', 'is', null)
        .order('created_at', { ascending: false });
      
      if (classId) {
        query = query.eq('student.class_id', classId);
      }
      
      const { data, error } = await query.limit(500);
      
      if (error) throw error;
      return data as unknown as GradeWithStudent[];
    },
    enabled: !!user,
  });

  // Extract and group misconceptions
  const groupedMisconceptions = useMemo(() => {
    if (!gradeData) return [];
    
    const allMisconceptions: ExtractedMisconception[] = [];
    
    gradeData.forEach(entry => {
      if (entry.grade_justification && entry.student) {
        const misconception = extractMisconceptionFromJustification(
          entry.grade_justification,
          getDisplayName(entry.student.id, entry.student.first_name, entry.student.last_name),
          entry.student.id,
          entry.topic_name,
          entry.grade,
          entry.created_at,
          entry.nys_standard
        );
        
        if (misconception) {
          allMisconceptions.push(misconception);
        }
      }
    });
    
    // Group by category
    const categoryMap = new Map<string, ExtractedMisconception[]>();
    allMisconceptions.forEach(m => {
      const existing = categoryMap.get(m.category) || [];
      existing.push(m);
      categoryMap.set(m.category, existing);
    });
    
    // Convert to grouped format
    const grouped: GroupedMisconception[] = [];
    categoryMap.forEach((instances, category) => {
      // Count unique students
      const uniqueStudents = new Set(instances.map(i => i.studentId));
      
      // Get unique topics
      const uniqueTopics = [...new Set(instances.map(i => i.topic))];
      
      // Determine overall severity (most common)
      const severityCounts = { high: 0, medium: 0, low: 0 };
      instances.forEach(i => severityCounts[i.severity]++);
      const severity = severityCounts.high >= severityCounts.medium && severityCounts.high >= severityCounts.low
        ? 'high'
        : severityCounts.medium >= severityCounts.low
          ? 'medium'
          : 'low';
      
    grouped.push({
        category,
        title: instances[0].title,
        severity,
        studentCount: uniqueStudents.size,
        instances,
        commonTopics: uniqueTopics.slice(0, 3),
        suggestedRemedies: getRemediesForCategory(category, uniqueTopics),
      });
    });
    
    // Sort by student count (most common first)
    return grouped.sort((a, b) => b.studentCount - a.studentCount);
  }, [gradeData]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleGenerateGroupWorksheet = async (group: GroupedMisconception) => {
    setIsGeneratingWorksheet(true);
    setSelectedCategory(group.category);
    
    try {
      const topics = group.commonTopics.map(t => {
        const instance = group.instances.find(i => i.topic === t);
        const cleanTopicName = t.replace(/\*\*/g, '').replace(/\*/g, '').trim();
        return {
          topicName: cleanTopicName,
          standard: instance?.standard || 'N/A',
          subject: 'Mathematics',
          category: group.category,
        };
      });
      
      if (topics.length === 0) {
        topics.push({
          topicName: group.category,
          standard: 'N/A',
          subject: 'Mathematics',
          category: group.category,
        });
      }
      
      const response = await supabase.functions.invoke('generate-worksheet-questions', {
        body: {
          topics,
          questionCount: 8,
          difficultyLevels: group.severity === 'high' ? ['easy', 'medium'] : ['medium', 'hard'],
          includeHints: true,
          includeAnswerKey: true,
          worksheetMode: 'practice',
        },
      });
      
      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate worksheet');
      }
      
      const questions = response.data?.questions || [];
      if (questions.length > 0) {
        setWorksheetQuestions(questions);
        setShowWorksheetDialog(true);
        toast.success(`Generated ${questions.length} questions targeting ${group.category}`);
      } else {
        throw new Error('No questions generated - please try again');
      }
    } catch (error: any) {
      toast.error(`Failed to generate worksheet: ${error.message}`);
    } finally {
      setIsGeneratingWorksheet(false);
      setSelectedCategory(null);
    }
  };

  const totalMisconceptions = groupedMisconceptions.reduce((sum, g) => sum + g.instances.length, 0);
  const totalStudentsAffected = new Set(
    groupedMisconceptions.flatMap(g => g.instances.map(i => i.studentId))
  ).size;

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Class Misconception Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Class Misconception Summary
              </CardTitle>
              <CardDescription className="mt-1">
                Common errors for targeted group instruction
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Users className="h-3 w-3 mr-1" />
                {totalStudentsAffected} students
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {totalMisconceptions} issues
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {groupedMisconceptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium text-sm">No misconceptions identified</p>
              <p className="text-xs">Scan student work to identify errors</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[700px]">
              <div className="space-y-3">
                {groupedMisconceptions.map((group) => (
                  <Collapsible
                    key={group.category}
                    open={expandedCategories.has(group.category)}
                    onOpenChange={() => toggleCategory(group.category)}
                  >
                    <div className={cn(
                      "rounded-lg border overflow-hidden",
                      group.severity === 'high' && 'border-l-4 border-l-destructive',
                      group.severity === 'medium' && 'border-l-4 border-l-yellow-500',
                      group.severity === 'low' && 'border-l-4 border-l-green-500'
                    )}>
                      <CollapsibleTrigger className="w-full">
                        <div className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={cn(
                              "h-4 w-4",
                              group.severity === 'high' && 'text-destructive',
                              group.severity === 'medium' && 'text-yellow-600',
                              group.severity === 'low' && 'text-green-600'
                            )} />
                            <div className="text-left">
                              <p className="font-medium text-sm">{group.category}</p>
                              <p className="text-xs text-muted-foreground">{group.studentCount} students affected</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline"
                              className={cn(
                                'text-xs capitalize',
                                group.severity === 'high' && 'border-destructive text-destructive',
                                group.severity === 'medium' && 'border-yellow-500 text-yellow-600',
                                group.severity === 'low' && 'border-green-500 text-green-600'
                              )}
                            >
                              {group.severity}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 gap-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateGroupWorksheet(group);
                              }}
                              disabled={isGeneratingWorksheet}
                            >
                              {isGeneratingWorksheet && selectedCategory === group.category ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="h-3 w-3" />
                              )}
                              Worksheet
                            </Button>
                            {expandedCategories.has(group.category) ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      
                        <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">
                          {/* Suggested Remediation - Clear bounded section with scroll */}
                          <div className="pt-3">
                            <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 p-3">
                              <div className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                                <Lightbulb className="h-4 w-4" />
                                Recommended Remediation Strategies
                              </div>
                              <ScrollArea className="max-h-40">
                                <ul className="space-y-1.5 ml-1 pr-3">
                                  {group.suggestedRemedies.map((remedy, idx) => (
                                    <li key={idx} className="text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
                                      <span className="text-green-600 dark:text-green-500 mt-0.5">•</span>
                                      <span>{remedy}</span>
                                    </li>
                                  ))}
                                </ul>
                              </ScrollArea>
                              <p className="text-xs text-green-600 dark:text-green-500 mt-2 italic border-t border-green-200 dark:border-green-800 pt-2">
                                These practice sets will be suggested to push to the Scholar App for student completion.
                              </p>
                            </div>
                          </div>
                          
                          {/* Common Topics */}
                          {group.commonTopics.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">Topics:</span>
                              {group.commonTopics.map((topic, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs font-normal">
                                  {topic.length > 30 ? topic.substring(0, 30) + '...' : topic}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          <Separator />
                          
                          {/* Student Evidence - Cleaner Cards */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Evidence ({group.instances.length} instances):
                            </p>
                            
                            {group.instances.slice(0, 8).map((instance, idx) => (
                              <div 
                                key={idx} 
                                className="rounded-md border bg-background p-2.5 space-y-2"
                              >
                                {/* Header Row */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{instance.studentName}</span>
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        'text-xs h-5',
                                        instance.grade < 60 && 'border-destructive/50 text-destructive',
                                        instance.grade >= 60 && instance.grade < 80 && 'border-yellow-400 text-yellow-600',
                                        instance.grade >= 80 && 'border-green-400 text-green-600'
                                      )}
                                    >
                                      Score: {instance.grade}%
                                    </Badge>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(instance.date), 'MMM d')}
                                  </span>
                                </div>
                                
                                {/* Error Analysis - Two Distinct Sections with full text display */}
                                <div className="space-y-2">
                                  {/* What Went Wrong - Red Section */}
                                  <div className="rounded-md border-2 border-destructive/40 bg-destructive/5 p-3">
                                    <div className="flex items-start gap-2">
                                      <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                      <div className="space-y-1.5 flex-1">
                                        <p className="text-xs font-semibold text-destructive">What the Student Did Wrong</p>
                                        <p className="text-sm text-destructive/90 leading-relaxed break-words whitespace-normal">
                                          {instance.specificError}
                                        </p>
                                        {instance.whyItMatters && (
                                          <p className="text-xs text-destructive/70 italic mt-1 border-t border-destructive/20 pt-1">
                                            Impact: {instance.whyItMatters}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Corrective Action - Green Section */}
                                  <div className="rounded-md border-2 border-green-500/40 bg-green-50 dark:bg-green-950/30 p-3">
                                    <div className="flex items-start gap-2">
                                      <Target className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                      <div className="space-y-1.5 flex-1">
                                        <p className="text-xs font-semibold text-green-700 dark:text-green-400">What Was Expected</p>
                                        <p className="text-sm text-green-700/90 dark:text-green-300/90 leading-relaxed break-words whitespace-normal">
                                          {instance.expectedAction}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {group.instances.length > 8 && (
                              <p className="text-xs text-muted-foreground text-center py-1">
                                + {group.instances.length - 8} more instances
                              </p>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      
      {/* Worksheet Dialog */}
      {showWorksheetDialog && worksheetQuestions.length > 0 && (
        <PrintRemediationQuestionsDialog
          open={showWorksheetDialog}
          onOpenChange={setShowWorksheetDialog}
          questions={worksheetQuestions}
          studentName="Class Group"
          topicName={selectedCategory || 'Remediation'}
        />
      )}
    </>
  );
}
