import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  BookOpen, 
  Download, 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronUp,
  ArrowUpDown,
  Edit2,
  Trash2,
  Loader2,
  Save,
  X,
  Send,
  Sparkles,
  FileText,
  Info,
  Rocket,
  Users,
  BarChart3
} from 'lucide-react';
import { PushAssignmentDialog } from './PushAssignmentDialog';
import { PushStudentPracticeDialog } from './PushStudentPracticeDialog';
import { StudentReportDialog } from './StudentReportDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';
import { toast } from 'sonner';
import nycologicLogo from '@/assets/nycologic-logo.png';
import { GEOMETRY_TOPICS, ALGEBRA1_TOPICS, ALGEBRA2_TOPICS } from '@/data/nysTopics';

// Build a lookup map of topics by subject
const buildTopicLookupBySubject = () => {
  const lookup: Record<string, { standard: string; name: string; keywords: string[] }[]> = {
    geometry: [],
    algebra1: [],
    algebra2: [],
    all: []
  };
  
  // Geometry topics
  for (const category of GEOMETRY_TOPICS) {
    for (const topic of category.topics) {
      const keywords = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const entry = { standard: topic.standard, name: topic.name, keywords };
      lookup.geometry.push(entry);
      lookup.all.push(entry);
    }
  }
  
  // Algebra 1 topics
  for (const category of ALGEBRA1_TOPICS) {
    for (const topic of category.topics) {
      const keywords = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const entry = { standard: topic.standard, name: topic.name, keywords };
      lookup.algebra1.push(entry);
      lookup.all.push(entry);
    }
  }
  
  // Algebra 2 topics
  for (const category of ALGEBRA2_TOPICS) {
    for (const topic of category.topics) {
      const keywords = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const entry = { standard: topic.standard, name: topic.name, keywords };
      lookup.algebra2.push(entry);
      lookup.all.push(entry);
    }
  }
  
  return lookup;
};

const TOPIC_LOOKUP_BY_SUBJECT = buildTopicLookupBySubject();

// Determine subject from class name
const getSubjectFromClassName = (className: string | undefined): string => {
  if (!className) return 'all';
  const lower = className.toLowerCase();
  
  if (lower.includes('geometry') || lower.includes('geo')) return 'geometry';
  if (lower.includes('algebra 2') || lower.includes('algebra ii') || lower.includes('alg 2') || lower.includes('alg2')) return 'algebra2';
  if (lower.includes('algebra 1') || lower.includes('algebra i') || lower.includes('alg 1') || lower.includes('alg1') || lower.includes('algebra')) return 'algebra1';
  
  return 'all';
};

// Helper function to extract clean standard code from verbose text
const extractStandardCode = (text: string | null): string | null => {
  if (!text) return null;
  
  // Match patterns like G.GMD.B.4, A.REI.B.3, F.IF.C.7, 7.G.B.6, CCSS.MATH.CONTENT.7.G.B.6
  const patterns = [
    /\b[A-Z]\.[A-Z]{1,3}\.[A-Z]\.\d+\b/g,
    /\b[A-Z]-[A-Z]{2,3}\.[A-Z]\.\d+\b/g,
    /\b\d\.[A-Z]{1,3}\.[A-Z]\.\d+\b/g,
    /\bCCSS\.MATH\.CONTENT\.\d\.[A-Z]+\.[A-Z]\.\d+\b/gi,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].replace('CCSS.MATH.CONTENT.', '').toUpperCase();
    }
  }
  
  // If text is already short and looks like a standard, return it
  if (text.length <= 15 && /^[A-Z0-9.-]+$/i.test(text.trim())) {
    return text.trim().toUpperCase();
  }
  
  return null;
};

// Helper function to extract clean topic name by matching against known standards for a subject
const extractTopicName = (text: string, standardText?: string | null, subject: string = 'all'): string => {
  if (!text) return 'Unknown Topic';
  
  const lowerText = text.toLowerCase();
  const topicLookup = TOPIC_LOOKUP_BY_SUBJECT[subject] || TOPIC_LOOKUP_BY_SUBJECT.all;
  
  // First, try to find a standard code and match it to a known topic
  const standardCode = extractStandardCode(standardText || text);
  if (standardCode) {
    const matchedTopic = topicLookup.find(t => t.standard === standardCode);
    if (matchedTopic) {
      return matchedTopic.name;
    }
    // Try all subjects if not found in specific subject
    if (subject !== 'all') {
      const allMatch = TOPIC_LOOKUP_BY_SUBJECT.all.find(t => t.standard === standardCode);
      if (allMatch) return allMatch.name;
    }
  }
  
  // Try to match keywords from the text against known topics
  let bestMatch: { name: string; score: number } | null = null;
  
  for (const topic of topicLookup) {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (lowerText.includes(keyword)) {
        score += keyword.length; // Longer keyword matches are worth more
      }
    }
    // Also check if the topic name appears in the text
    if (lowerText.includes(topic.name.toLowerCase())) {
      score += 100; // Strong boost for exact topic name match
    }
    
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name: topic.name, score };
    }
  }
  
  if (bestMatch && bestMatch.score >= 5) {
    return bestMatch.name;
  }
  
  // If it's a short, clean topic name already, return as-is
  if (text.length <= 40 && !text.includes('**') && !lowerText.includes('the student') && !lowerText.includes('based on')) {
    return text;
  }
  
  // Try to extract topic from markdown-style bold text like **Topic Name**
  const boldMatch = text.match(/\*\*([^*]{3,40})\*\*/);
  if (boldMatch) {
    const extracted = boldMatch[1].trim();
    // If extracted text looks like a topic (not a standard code or sentence)
    if (!/^[A-Z]\.[A-Z]+\.[A-Z]\.\d+$/.test(extracted) && !extracted.includes(' is ') && !extracted.includes(' the ')) {
      return extracted;
    }
  }
  
  // Fallback: return a truncated version
  const cleaned = text.replace(/\*\*/g, '').replace(/^(The student|Based on|This).{0,20}/i, '').trim();
  return cleaned.length > 35 ? cleaned.substring(0, 32) + '...' : cleaned || 'Topic';
  return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
};
const COLUMN_INFO = {
  student: {
    title: 'Student',
    description: 'The name of the student who completed the assessment. Click to view their full performance report.',
  },
  topic: {
    title: 'Topic',
    description: 'The mathematical topic or concept being assessed (e.g., Linear Equations, Quadratic Functions).',
  },
  source: {
    title: 'Source',
    description: 'Shows whether the result came from scanned worksheet grading or a Scholar completion.',
  },
  grade: {
    title: 'Grade (%)',
    description: 'The percentage score (0-100%) indicating overall performance. Green ≥80%, Yellow ≥60%, Red <60%.',
  },
  regents: {
    title: 'Regents Score',
    description: 'NY Regents-style rubric score (0-6 scale). Based on official NYS scoring criteria for extended response questions.',
  },
  standard: {
    title: 'NYS Standard',
    description: 'The New York State learning standard code (e.g., A-REI.B.4) that this assessment aligns to.',
  },
  date: {
    title: 'Date',
    description: 'When the student work was scanned and analyzed by the AI grading system.',
  },
  actions: {
    title: 'Actions',
    description: 'Edit grade details, adjust scores, or delete the entry if needed.',
  },
};

interface GradeEntry {
  id: string;
  student_id: string;
  topic_name: string;
  grade: number;
  grade_justification: string | null;
  raw_score_earned: number | null;
  raw_score_possible: number | null;
  regents_score: number | null;
  regents_justification: string | null;
  nys_standard: string | null;
  created_at: string;
  student?: {
    first_name: string;
    last_name: string;
    class_id: string;
    class?: {
      name: string;
    };
  };
}

interface GradebookProps {
  classId?: string;
}

type SortField = 'student' | 'topic' | 'grade' | 'regents' | 'date';
type SortDirection = 'asc' | 'desc';
type GradeSource = 'scan' | 'scholar';
type SourceFilter = 'all' | GradeSource;

const getGradeSource = (grade: Pick<GradeEntry, 'grade_justification'>): GradeSource => {
  const justification = grade.grade_justification?.toLowerCase() ?? '';
  return justification.includes('scholar') ? 'scholar' : 'scan';
};

const getGradeSourceLabel = (source: GradeSource) =>
  source === 'scholar' ? 'Scholar' : 'Scanned';

export function Gradebook({ classId }: GradebookProps) {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filters from URL params
  const initialTopic = searchParams.get('topic') || 'all';
  const initialSearch = searchParams.get('search') || '';
  
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [topicFilter, setTopicFilter] = useState<string>(initialTopic);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isExpanded, setIsExpanded] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncingToScholar, setIsSyncingToScholar] = useState(false);
  const [pushAssignmentOpen, setPushAssignmentOpen] = useState(false);
  const [showStudentAverages, setShowStudentAverages] = useState(true);
  const [pushAssignmentTopic, setPushAssignmentTopic] = useState('');
  
  // Scroll to gradebook and expand when URL params change
  useEffect(() => {
    const topic = searchParams.get('topic');
    const search = searchParams.get('search');
    
    if (topic || search) {
      setIsExpanded(true);
      if (topic && topic !== 'all') {
        setTopicFilter(topic);
      }
      if (search) {
        setSearchTerm(search);
      }
      
      // Scroll to gradebook
      setTimeout(() => {
        const gradebook = document.getElementById('gradebook-section');
        if (gradebook) {
          gradebook.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [searchParams]);
  
  // Edit state
  const [editingEntry, setEditingEntry] = useState<GradeEntry | null>(null);
  const [editGrade, setEditGrade] = useState(0);
  const [editRegentsScore, setEditRegentsScore] = useState<number | null>(null);
  const [editJustification, setEditJustification] = useState('');
  const [editTopicName, setEditTopicName] = useState('');
  const [editNysStandard, setEditNysStandard] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Student report dialog state
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Per-student push practice state
  const [pushPracticeStudent, setPushPracticeStudent] = useState<{
    studentId: string;
    studentName: string;
    topicName?: string;
    standard?: string;
    classId?: string;
  } | null>(null);

  // Fetch grade history with class names
  const { data: grades, isLoading, refetch } = useQuery({
    queryKey: ['gradebook', user?.id, classId],
    queryFn: async () => {
      let query = supabase
        .from('grade_history')
        .select(`
          *,
          student:students(
            first_name, 
            last_name, 
            class_id,
            class:classes(name)
          )
        `)
        .eq('teacher_id', user!.id)
        .order('created_at', { ascending: false });

      if (classId) {
        // Filter by class via student relationship
        const { data: classStudents } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', classId);
        
        if (classStudents && classStudents.length > 0) {
          const studentIds = classStudents.map(s => s.id);
          query = query.in('student_id', studentIds);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as GradeEntry[];
    },
    enabled: !!user,
  });

  // Helper to get subject for a grade entry based on class name
  const getSubjectForGrade = (grade: GradeEntry): string => {
    const className = grade.student?.class?.name;
    return getSubjectFromClassName(className);
  };

  // Get unique topics for filter, grouped by standard
  const topicsGroupedByStandard = useMemo(() => {
    if (!grades) return { ungrouped: [], byStandard: {} as Record<string, { topic: string; standard: string }[]> };
    
    const topicMap = new Map<string, string>();
    grades.forEach(g => {
      if (!topicMap.has(g.topic_name)) {
        topicMap.set(g.topic_name, g.nys_standard || '');
      }
    });
    
    const byStandard: Record<string, { topic: string; standard: string }[]> = {};
    const ungrouped: { topic: string; standard: string }[] = [];
    
    topicMap.forEach((standard, topic) => {
      const entry = { topic, standard };
      if (standard) {
        // Extract the standard prefix (e.g., "G.CO" from "G.CO.A.1")
        const parts = standard.split('.');
        const prefix = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : standard;
        if (!byStandard[prefix]) {
          byStandard[prefix] = [];
        }
        byStandard[prefix].push(entry);
      } else {
        ungrouped.push(entry);
      }
    });
    
    // Sort topics within each group
    Object.keys(byStandard).forEach(key => {
      byStandard[key].sort((a, b) => a.topic.localeCompare(b.topic));
    });
    ungrouped.sort((a, b) => a.topic.localeCompare(b.topic));
    
    return { ungrouped, byStandard };
  }, [grades]);

  // Get sorted standard prefixes for display
  const sortedStandardPrefixes = useMemo(() => {
    return Object.keys(topicsGroupedByStandard.byStandard).sort();
  }, [topicsGroupedByStandard]);

  // Filter and sort grades
  const filteredGrades = useMemo(() => {
    if (!grades) return [];

    let filtered = [...grades];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(g => {
        const studentName = g.student
          ? getDisplayName(g.student_id, g.student.first_name, g.student.last_name).toLowerCase()
          : '';
        return (
          studentName.includes(term) ||
          g.topic_name.toLowerCase().includes(term) ||
          g.nys_standard?.toLowerCase().includes(term)
        );
      });
    }

    // Topic filter - match exact topic_name or if the topic filter text is contained in topic_name
    if (topicFilter !== 'all') {
      const filterLower = topicFilter.toLowerCase();
      filtered = filtered.filter(g => {
        const topicLower = g.topic_name.toLowerCase();
        const standardLower = (g.nys_standard || '').toLowerCase();
        return (
          g.topic_name === topicFilter ||
          topicLower.includes(filterLower) ||
          standardLower.includes(filterLower)
        );
      });
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter((grade) => getGradeSource(grade) === sourceFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'student': {
          const nameA = a.student ? `${a.student.last_name} ${a.student.first_name}` : '';
          const nameB = b.student ? `${b.student.last_name} ${b.student.first_name}` : '';
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case 'topic':
          comparison = a.topic_name.localeCompare(b.topic_name);
          break;
        case 'grade':
          comparison = a.grade - b.grade;
          break;
        case 'regents':
          comparison = (a.regents_score || 0) - (b.regents_score || 0);
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [grades, searchTerm, topicFilter, sourceFilter, sortField, sortDirection, getDisplayName]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('grade_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Grade entry deleted');
      refetch();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete grade entry');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (entry: GradeEntry) => {
    setEditingEntry(entry);
    setEditGrade(entry.grade);
    setEditRegentsScore(entry.regents_score);
    setEditJustification(entry.grade_justification || '');
    setEditTopicName(entry.topic_name);
    setEditNysStandard(entry.nys_standard || '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('grade_history')
        .update({
          grade: editGrade,
          regents_score: editRegentsScore,
          grade_justification: editJustification || null,
          topic_name: editTopicName,
          nys_standard: editNysStandard || null,
        })
        .eq('id', editingEntry.id);

      if (error) throw error;
      toast.success('Grade entry updated');
      setEditingEntry(null);
      refetch();
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Failed to update grade entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (!filteredGrades.length) return;

    const headers = ['Student', 'Topic', 'Source', 'Grade', 'Regents Score', 'Standard', 'Date', 'Justification'];
    const rows = filteredGrades.map(g => [
      g.student ? getDisplayName(g.student_id, g.student.first_name, g.student.last_name) : 'Unknown',
      g.topic_name,
      getGradeSourceLabel(getGradeSource(g)),
      g.grade,
      g.regents_score || '',
      g.nys_standard || '',
      format(new Date(g.created_at), 'yyyy-MM-dd HH:mm'),
      g.grade_justification || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Gradebook exported!');
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 80) return 'text-green-600 dark:text-green-400';
    if (grade >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getRegentsColor = (score: number) => {
    if (score >= 5) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    if (score >= 3) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1" />
      : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  // Summary stats
  const stats = useMemo(() => {
    if (!filteredGrades.length) return null;

    const summarizeEntries = (entries: GradeEntry[]) => {
      const regentsEntries = entries.filter((entry) => entry.regents_score !== null);
      return {
        total: entries.length,
        avgGrade: entries.length
          ? entries.reduce((sum, entry) => sum + entry.grade, 0) / entries.length
          : 0,
        avgRegents: regentsEntries.length
          ? regentsEntries.reduce((sum, entry) => sum + (entry.regents_score || 0), 0) / regentsEntries.length
          : 0,
      };
    };

    const scanEntries = filteredGrades.filter((grade) => getGradeSource(grade) === 'scan');
    const scholarEntries = filteredGrades.filter((grade) => getGradeSource(grade) === 'scholar');

    return {
      total: filteredGrades.length,
      uniqueStudents: new Set(filteredGrades.map(g => g.student_id)).size,
      uniqueTopics: new Set(filteredGrades.map(g => g.topic_name)).size,
      scan: summarizeEntries(scanEntries),
      scholar: summarizeEntries(scholarEntries),
    };
  }, [filteredGrades]);

  // Per-student averages split by source
  const studentAverages = useMemo(() => {
    if (!filteredGrades.length) return [];

    const studentMap = new Map<string, {
      studentId: string;
      name: string;
      className: string;
      scanGrades: number[];
      scholarGrades: number[];
      scanRegentsScores: number[];
      scholarRegentsScores: number[];
      topicCount: number;
      lastDate: string;
    }>();

    filteredGrades.forEach((grade) => {
      const source = getGradeSource(grade);
      const existing = studentMap.get(grade.student_id);

      if (existing) {
        if (source === 'scholar') {
          existing.scholarGrades.push(grade.grade);
          if (grade.regents_score !== null) existing.scholarRegentsScores.push(grade.regents_score);
        } else {
          existing.scanGrades.push(grade.grade);
          if (grade.regents_score !== null) existing.scanRegentsScores.push(grade.regents_score);
        }
        if (grade.created_at > existing.lastDate) existing.lastDate = grade.created_at;
        return;
      }

      const name = grade.student
        ? getDisplayName(grade.student_id, grade.student.first_name, grade.student.last_name)
        : 'Unknown';

      studentMap.set(grade.student_id, {
        studentId: grade.student_id,
        name,
        className: grade.student?.class?.name || '',
        scanGrades: source === 'scan' ? [grade.grade] : [],
        scholarGrades: source === 'scholar' ? [grade.grade] : [],
        scanRegentsScores: source === 'scan' && grade.regents_score !== null ? [grade.regents_score] : [],
        scholarRegentsScores: source === 'scholar' && grade.regents_score !== null ? [grade.regents_score] : [],
        topicCount: 0,
        lastDate: grade.created_at,
      });
    });

    const studentTopics = new Map<string, Set<string>>();
    filteredGrades.forEach((grade) => {
      if (!studentTopics.has(grade.student_id)) studentTopics.set(grade.student_id, new Set());
      studentTopics.get(grade.student_id)!.add(grade.topic_name);
    });

    const averageOrNull = (values: number[]) =>
      values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

    const regentsAverageOrNull = (values: number[]) =>
      values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : null;

    return Array.from(studentMap.values())
      .map((student) => ({
        ...student,
        topicCount: studentTopics.get(student.studentId)?.size || 0,
        scanAverage: averageOrNull(student.scanGrades),
        scholarAverage: averageOrNull(student.scholarGrades),
        scanAverageRegents: regentsAverageOrNull(student.scanRegentsScores),
        scholarAverageRegents: regentsAverageOrNull(student.scholarRegentsScores),
        scanCount: student.scanGrades.length,
        scholarCount: student.scholarGrades.length,
        totalEntries: student.scanGrades.length + student.scholarGrades.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredGrades, getDisplayName]);

  

  // Sync grades to NYCLogic Scholar AI
  const handleSyncToScholar = async () => {
    if (!filteredGrades.length) {
      toast.error('No grades to sync');
      return;
    }

    setIsSyncingToScholar(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-grades-to-scholar', {
        body: { class_id: classId, sync_all: !classId },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(
          `Synced ${data.synced_grades || 0} grades for ${data.synced_students || 0} students to NYCLogic Scholar AI!`,
          { 
            description: 'Students can now view their grades and earn rewards in the Scholar app.',
            duration: 5000,
          }
        );
      } else {
        throw new Error(data?.error || 'Failed to sync grades');
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync grades to Scholar app', {
        description: err instanceof Error ? err.message : 'Please check your connection settings',
      });
    } finally {
      setIsSyncingToScholar(false);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card id="gradebook-section">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Gradebook</CardTitle>
                {grades && (
                  <Badge variant="secondary">{grades.length} entries</Badge>
                )}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            <CardDescription>
              View and manage saved grade history with Scholar and scanned results separated.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Filters and Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search students, topics, standards..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={topicFilter} onValueChange={setTopicFilter}>
                <SelectTrigger className="w-[280px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by topic" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <SelectItem value="all">All Topics</SelectItem>
                  
                  {/* Topics grouped by NYS Standard */}
                  {sortedStandardPrefixes.map(prefix => (
                    <div key={prefix}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-primary bg-muted/50 sticky top-0">
                        {prefix} Standards
                      </div>
                      {topicsGroupedByStandard.byStandard[prefix].map(({ topic, standard }) => (
                        <SelectItem key={topic} value={topic} className="pl-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono shrink-0">
                              {standard}
                            </Badge>
                            <span className="truncate">{topic}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                  
                  {/* Ungrouped topics (no standard) */}
                  {topicsGroupedByStandard.ungrouped.length > 0 && (
                    <div>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                        Other Topics
                      </div>
                      {topicsGroupedByStandard.ungrouped.map(({ topic }) => (
                        <SelectItem key={topic} value={topic} className="pl-4">
                          {topic}
                        </SelectItem>
                      ))}
                    </div>
                  )}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="scan">Scanned Only</SelectItem>
                  <SelectItem value="scholar">Scholar Only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportCSV} disabled={!filteredGrades.length}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                onClick={handleSyncToScholar} 
                disabled={!filteredGrades.length || isSyncingToScholar}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
              >
                {isSyncingToScholar ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <img src={nycologicLogo} alt="" className="h-4 w-4 mr-2" />
                )}
                Sync to Scholar
              </Button>
              <Button 
                variant="outline"
                onClick={() => setPushAssignmentOpen(true)}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
              >
                <Rocket className="h-4 w-4 mr-2" />
                Push Assignment
              </Button>
            </div>

            {/* Scholar Sync Info */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  Share grades with NYCLogic Scholar AI
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Students can view their grades, track progress, and earn XP & coins for their work
                </p>
              </div>
              <Send className="h-4 w-4 text-purple-500 dark:text-purple-400 flex-shrink-0" />
            </div>

            {/* Summary Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Entries</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{stats.uniqueStudents}</p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{stats.uniqueTopics}</p>
                  <p className="text-xs text-muted-foreground">Topics</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className={`text-2xl font-bold ${stats.scan.total ? getGradeColor(stats.scan.avgGrade) : 'text-muted-foreground'}`}>
                    {stats.scan.total ? `${Math.round(stats.scan.avgGrade)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Scanned Avg</p>
                  <p className="text-[11px] text-muted-foreground">{stats.scan.total} entries</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className={`text-2xl font-bold ${stats.scholar.total ? getGradeColor(stats.scholar.avgGrade) : 'text-muted-foreground'}`}>
                    {stats.scholar.total ? `${Math.round(stats.scholar.avgGrade)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Scholar Avg</p>
                  <p className="text-[11px] text-muted-foreground">{stats.scholar.total} entries</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">
                    {stats.scan.avgRegents ? `${stats.scan.avgRegents.toFixed(1)}/6` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Scanned Regents</p>
                  <p className="text-[11px] text-muted-foreground">Scholar kept separate</p>
                </div>
              </div>
            )}

            {/* Per-Student Results by Source */}
            {studentAverages.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowStudentAverages(!showStudentAverages)}
                  className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors w-full"
                >
                  <Users className="h-4 w-4 text-primary" />
                  Student Results by Source
                  <Badge variant="secondary" className="ml-1">{studentAverages.length}</Badge>
                  {showStudentAverages ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                </button>
                {showStudentAverages && (
                  <div className="max-h-[600px] overflow-auto border rounded-lg">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead className="text-center">Scanned Avg</TableHead>
                          <TableHead className="text-center">Scholar Avg</TableHead>
                          <TableHead className="text-center">Scanned</TableHead>
                          <TableHead className="text-center">Scholar</TableHead>
                          <TableHead className="text-center">Topics</TableHead>
                          <TableHead>Last Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentAverages.map((student) => (
                          <TableRow
                            key={student.studentId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedStudentForReport({ id: student.studentId, name: student.name })}
                          >
                            <TableCell className="font-medium">{student.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{student.className}</TableCell>
                            <TableCell className="text-center">
                              {student.scanAverage !== null ? (
                                <div className="space-y-1">
                                  <div className={`font-bold text-lg ${getGradeColor(student.scanAverage)}`}>
                                    {student.scanAverage}%
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {student.scanAverageRegents ? `${student.scanAverageRegents}/6 regents` : '—'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {student.scholarAverage !== null ? (
                                <div className="space-y-1">
                                  <div className={`font-bold text-lg ${getGradeColor(student.scholarAverage)}`}>
                                    {student.scholarAverage}%
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {student.scholarAverageRegents ? `${student.scholarAverageRegents}/6 regents` : '—'}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{student.scanCount}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{student.scholarCount}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{student.topicCount}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(student.lastDate), 'MMM d, yyyy')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {/* Grades Table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredGrades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No grade entries found</p>
                <p className="text-sm">Save student work analysis to see entries here</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('student')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Student <Info className="h-3 w-3 text-muted-foreground" /> <SortIcon field="student" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.student.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.student.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('topic')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Topic <Info className="h-3 w-3 text-muted-foreground" /> <SortIcon field="topic" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.topic.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.topic.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Source <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.source.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.source.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 text-center"
                        onClick={() => handleSort('grade')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center gap-1">
                                Grade <Info className="h-3 w-3 text-muted-foreground" /> <SortIcon field="grade" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.grade.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.grade.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 text-center"
                        onClick={() => handleSort('regents')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center gap-1">
                                Regents <Info className="h-3 w-3 text-muted-foreground" /> <SortIcon field="regents" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.regents.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.regents.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Standard <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.standard.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.standard.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('date')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Date <Info className="h-3 w-3 text-muted-foreground" /> <SortIcon field="date" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.date.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.date.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="w-[80px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1">
                                Actions <Info className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[250px]">
                              <p className="font-semibold">{COLUMN_INFO.actions.title}</p>
                              <p className="text-xs text-muted-foreground">{COLUMN_INFO.actions.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGrades.map((grade) => (
                      <TableRow key={grade.id}>
                        <TableCell className="font-medium">
                          {grade.student ? (
                            <button
                              className="flex items-center gap-1 hover:text-primary hover:underline cursor-pointer text-left"
                              onClick={() => setSelectedStudentForReport({
                                id: grade.student_id,
                                name: getDisplayName(
                                  grade.student_id,
                                  grade.student.first_name,
                                  grade.student.last_name
                                )
                              })}
                            >
                              <FileText className="h-3 w-3 opacity-50" />
                              {getDisplayName(
                                grade.student_id, 
                                grade.student.first_name, 
                                grade.student.last_name
                              )}
                            </button>
                          ) : (
                            'Unknown Student'
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {(() => {
                            const subject = getSubjectForGrade(grade);
                            const topicName = extractTopicName(grade.topic_name, grade.nys_standard, subject);
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate cursor-help font-medium">
                                      {topicName}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[350px]">
                                    <p className="text-xs font-medium mb-1">{topicName}</p>
                                    {grade.student?.class?.name && (
                                      <p className="text-xs text-primary mb-1">Class: {grade.student.class.name}</p>
                                    )}
                                    {grade.topic_name !== topicName && (
                                      <p className="text-xs text-muted-foreground">{grade.topic_name}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getGradeSource(grade) === 'scholar' ? 'secondary' : 'outline'}>
                            {getGradeSourceLabel(getGradeSource(grade))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${getGradeColor(grade.grade)}`}>
                            {grade.grade}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {grade.regents_score !== null ? (
                            <Badge className={getRegentsColor(grade.regents_score)}>
                              {grade.regents_score}/6
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const standardCode = extractStandardCode(grade.nys_standard);
                            if (standardCode) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs font-mono cursor-help">
                                        {standardCode}
                                      </Badge>
                                    </TooltipTrigger>
                                    {grade.nys_standard && grade.nys_standard.length > standardCode.length && (
                                      <TooltipContent side="top" className="max-w-[350px]">
                                        <p className="text-xs">{grade.nys_standard}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                            return <span className="text-muted-foreground">-</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(grade.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-primary hover:text-primary"
                                    onClick={() => {
                                      const studentName = grade.student
                                        ? getDisplayName(grade.student_id, grade.student.first_name, grade.student.last_name)
                                        : 'Student';
                                      setPushPracticeStudent({
                                        studentId: grade.student_id,
                                        studentName,
                                        topicName: grade.topic_name,
                                        standard: grade.nys_standard || undefined,
                                        classId: grade.student?.class_id,
                                      });
                                    }}
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send practice to this student</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(grade)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  disabled={deletingId === grade.id}
                                >
                                  {deletingId === grade.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Grade Entry?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this grade entry from the gradebook. 
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(grade.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Edit Grade Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Grade Entry
            </DialogTitle>
            <DialogDescription>
              {editingEntry?.student && (
                <span>
                  Editing grade for{' '}
                  <strong>
                    {getDisplayName(
                      editingEntry.student_id,
                      editingEntry.student.first_name,
                      editingEntry.student.last_name
                    )}
                  </strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Topic Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-topic">Topic Name</Label>
              <Input
                id="edit-topic"
                value={editTopicName}
                onChange={(e) => setEditTopicName(e.target.value)}
                placeholder="Enter topic name"
              />
            </div>

            {/* NYS Standard */}
            <div className="space-y-2">
              <Label htmlFor="edit-standard">NYS Standard (optional)</Label>
              <Input
                id="edit-standard"
                value={editNysStandard}
                onChange={(e) => setEditNysStandard(e.target.value)}
                placeholder="e.g., A.REI.4"
              />
            </div>

            {/* Grade */}
            <div className="space-y-2">
              <Label>Grade: <span className={`font-bold ${getGradeColor(editGrade)}`}>{editGrade}%</span></Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[editGrade]}
                  onValueChange={([value]) => setEditGrade(value)}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={editGrade}
                  onChange={(e) => setEditGrade(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-20"
                  min={0}
                  max={100}
                />
              </div>
            </div>

            {/* Regents Score */}
            <div className="space-y-2">
              <Label>Regents Score (optional)</Label>
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((score) => (
                  <Button
                    key={score}
                    type="button"
                    variant={editRegentsScore === score ? 'default' : 'outline'}
                    size="sm"
                    className="w-9 h-9"
                    onClick={() => setEditRegentsScore(score)}
                  >
                    {score}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditRegentsScore(null)}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Justification */}
            <div className="space-y-2">
              <Label htmlFor="edit-justification">Justification / Notes</Label>
              <Textarea
                id="edit-justification"
                value={editJustification}
                onChange={(e) => setEditJustification(e.target.value)}
                placeholder="Explain the grade or any adjustments made..."
                rows={3}
              />
            </div>

            {/* Original Values Reference */}
            {editingEntry && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground mb-1">Original Values:</p>
                <div className="flex flex-wrap gap-3">
                  <span>Grade: <strong>{editingEntry.grade}%</strong></span>
                  {editingEntry.regents_score !== null && (
                    <span>Regents: <strong>{editingEntry.regents_score}/6</strong></span>
                  )}
                  <span>Date: <strong>{format(new Date(editingEntry.created_at), 'MMM d, yyyy')}</strong></span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !editTopicName.trim()}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Report Dialog */}
      <StudentReportDialog
        open={!!selectedStudentForReport}
        onOpenChange={(open) => !open && setSelectedStudentForReport(null)}
        studentId={selectedStudentForReport?.id || ''}
        studentName={selectedStudentForReport?.name || ''}
      />

      {/* Push Assignment Dialog */}
      <PushAssignmentDialog
        open={pushAssignmentOpen}
        onOpenChange={setPushAssignmentOpen}
        defaultClassId={classId}
      />

      {/* Per-Student Push Practice Dialog */}
      {pushPracticeStudent && (
        <PushStudentPracticeDialog
          open={!!pushPracticeStudent}
          onOpenChange={(open) => !open && setPushPracticeStudent(null)}
          studentId={pushPracticeStudent.studentId}
          studentName={pushPracticeStudent.studentName}
          classId={pushPracticeStudent.classId || classId}
          preselectedTopic={pushPracticeStudent.topicName}
          preselectedStandard={pushPracticeStudent.standard}
        />
      )}
    </Collapsible>
  );
}
