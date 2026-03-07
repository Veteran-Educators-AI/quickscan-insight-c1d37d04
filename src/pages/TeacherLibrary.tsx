import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import pptxgen from 'pptxgenjs';
import jsPDF from 'jspdf';
import {
  Search,
  FileText,
  BookOpen,
  GraduationCap,
  Star,
  StarOff,
  MoreVertical,
  Download,
  Trash2,
  Copy,
  ExternalLink,
  Calendar,
  Grid3X3,
  List,
  FolderOpen,
  Filter,
  Clock,
  Eye,
  Presentation,
  FileSpreadsheet,
  Send,
} from 'lucide-react';
import { AssignWorksheetDialog } from '@/components/reports/AssignWorksheetDialog';

// Types
interface SavedWorksheet {
  id: string;
  title: string;
  teacher_name: string | null;
  questions: any[];
  topics: any[];
  settings: any;
  is_shared?: boolean;
  share_code?: string | null;
  due_date?: string | null;
  class_id?: string | null;
  is_assigned?: boolean;
  created_at: string;
  updated_at: string;
}

interface LessonSlide {
  title: string;
  content: string[];
  speakerNotes: string;
  slideType: 'title' | 'objective' | 'instruction' | 'example' | 'practice' | 'summary';
}

interface SavedLessonPlan {
  id: string;
  title: string;
  standard: string;
  topic_name: string;
  subject: string | null;
  objective: string;
  duration: string;
  slides: LessonSlide[];
  recommended_worksheets: { topicName: string; standard: string; difficulty: string }[];
  class_id: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

interface GradedWorkSample {
  id: string;
  student_name: string;
  topic_name: string;
  grade: number;
  regents_score: number | null;
  grade_justification: string | null;
  nys_standard: string | null;
  created_at: string;
  image_url?: string;
}

type ViewMode = 'grid' | 'list';
type ContentTab = 'worksheets' | 'lessons' | 'graded';

export default function TeacherLibrary() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState<ContentTab>('worksheets');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [classes, setClasses] = useState<{id: string; name: string}[]>([]);

  // Data
  const [worksheets, setWorksheets] = useState<SavedWorksheet[]>([]);
  const [lessonPlans, setLessonPlans] = useState<SavedLessonPlan[]>([]);
  const [gradedWork, setGradedWork] = useState<GradedWorkSample[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: ContentTab; id: string } | null>(null);

  // Load data
  useEffect(() => {
    if (user) {
      loadAllContent();
      supabase.from('classes').select('id, name').eq('teacher_id', user.id).order('name').then(({ data }) => {
        if (data) setClasses(data);
      });
    }
  }, [user]);

  const loadAllContent = async () => {
    setIsLoading(true);
    await Promise.all([
      loadWorksheets(),
      loadLessonPlans(),
      loadGradedWork(),
    ]);
    setIsLoading(false);
  };

  const loadWorksheets = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('worksheets')
        .select('*')
        .eq('teacher_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const parsed: SavedWorksheet[] = (data || []).map(w => ({
        id: w.id,
        title: w.title,
        teacher_name: w.teacher_name,
        questions: (w.questions as unknown as any[]) || [],
        topics: (w.topics as unknown as any[]) || [],
        settings: w.settings || {},
        is_shared: w.is_shared,
        share_code: w.share_code,
        due_date: w.due_date,
        class_id: w.class_id,
        is_assigned: w.is_assigned,
        created_at: w.created_at,
        updated_at: w.updated_at,
      }));
      setWorksheets(parsed);
    } catch (error) {
      console.error('Error loading worksheets:', error);
    }
  };

  const loadLessonPlans = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('lesson_plans')
        .select('*')
        .eq('teacher_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const parsedPlans: SavedLessonPlan[] = (data || []).map(plan => ({
        id: plan.id,
        title: plan.title,
        standard: plan.standard,
        topic_name: plan.topic_name,
        subject: plan.subject,
        objective: plan.objective,
        duration: plan.duration,
        slides: (plan.slides as unknown as LessonSlide[]) || [],
        recommended_worksheets: (plan.recommended_worksheets as unknown as { topicName: string; standard: string; difficulty: string }[]) || [],
        class_id: plan.class_id,
        is_favorite: plan.is_favorite,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      }));
      
      setLessonPlans(parsedPlans);
    } catch (error) {
      console.error('Error loading lesson plans:', error);
    }
  };

  const loadGradedWork = async () => {
    if (!user) return;
    try {
      // Get unique graded work samples grouped by topic
      const { data, error } = await supabase
        .from('grade_history')
        .select(`
          id,
          topic_name,
          grade,
          regents_score,
          grade_justification,
          nys_standard,
          created_at,
          student:students(first_name, last_name)
        `)
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const samples: GradedWorkSample[] = (data || []).map(item => ({
        id: item.id,
        student_name: item.student ? `${(item.student as any).first_name} ${(item.student as any).last_name}` : 'Unknown',
        topic_name: item.topic_name,
        grade: item.grade,
        regents_score: item.regents_score,
        grade_justification: item.grade_justification,
        nys_standard: item.nys_standard,
        created_at: item.created_at,
      }));

      setGradedWork(samples);
    } catch (error) {
      console.error('Error loading graded work:', error);
    }
  };

  // Get unique years from content
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    worksheets.forEach(w => years.add(new Date(w.created_at).getFullYear().toString()));
    lessonPlans.forEach(l => years.add(new Date(l.created_at).getFullYear().toString()));
    gradedWork.forEach(g => years.add(new Date(g.created_at).getFullYear().toString()));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [worksheets, lessonPlans, gradedWork]);

  // Filter functions
  const filterByYear = <T extends { created_at: string }>(items: T[]): T[] => {
    if (filterYear === 'all') return items;
    return items.filter(item => new Date(item.created_at).getFullYear().toString() === filterYear);
  };

  const filterByClass = <T extends { class_id?: string | null }>(items: T[]): T[] => {
    if (filterClass === 'all') return items;
    if (filterClass === 'unassigned') return items.filter(item => !item.class_id);
    return items.filter(item => item.class_id === filterClass);
  };

  const filterBySearch = <T extends { title?: string; topic_name?: string }>(items: T[]): T[] => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.title?.toLowerCase().includes(query) || 
      item.topic_name?.toLowerCase().includes(query)
    );
  };

  // Filtered content
  const filteredWorksheets = useMemo(() => {
    return filterBySearch(filterByClass(filterByYear(worksheets)));
  }, [worksheets, searchQuery, filterYear, filterClass]);

  const filteredLessonPlans = useMemo(() => {
    let filtered = filterByClass(filterByYear(lessonPlans));
    if (filterFavorites) {
      filtered = filtered.filter(l => l.is_favorite);
    }
    return filterBySearch(filtered);
  }, [lessonPlans, searchQuery, filterYear, filterClass, filterFavorites]);

  const filteredGradedWork = useMemo(() => {
    return filterBySearch(filterByYear(gradedWork));
  }, [gradedWork, searchQuery, filterYear]);

  // Actions
  const toggleFavorite = async (planId: string) => {
    const plan = lessonPlans.find(p => p.id === planId);
    if (!plan) return;

    try {
      const { error } = await supabase
        .from('lesson_plans')
        .update({ is_favorite: !plan.is_favorite })
        .eq('id', planId);

      if (error) throw error;

      setLessonPlans(prev =>
        prev.map(p => (p.id === planId ? { ...p, is_favorite: !p.is_favorite } : p))
      );
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;

    try {
      let table: 'worksheets' | 'lesson_plans' | 'grade_history';
      switch (deleteTarget.type) {
        case 'worksheets':
          table = 'worksheets';
          break;
        case 'lessons':
          table = 'lesson_plans';
          break;
        case 'graded':
          table = 'grade_history';
          break;
      }

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      // Update local state
      if (deleteTarget.type === 'worksheets') {
        setWorksheets(prev => prev.filter(w => w.id !== deleteTarget.id));
      } else if (deleteTarget.type === 'lessons') {
        setLessonPlans(prev => prev.filter(l => l.id !== deleteTarget.id));
      } else {
        setGradedWork(prev => prev.filter(g => g.id !== deleteTarget.id));
      }

      toast({ title: 'Deleted successfully' });
    } catch (error) {
      console.error('Error deleting:', error);
      toast({ title: 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const duplicateWorksheet = async (worksheet: SavedWorksheet) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('worksheets').insert({
        teacher_id: user.id,
        title: `${worksheet.title} (Copy)`,
        teacher_name: worksheet.teacher_name,
        questions: worksheet.questions,
        topics: worksheet.topics,
        settings: worksheet.settings,
      });

      if (error) throw error;

      toast({ title: 'Worksheet duplicated' });
      loadWorksheets();
    } catch (error) {
      console.error('Error duplicating:', error);
      toast({ title: 'Failed to duplicate', variant: 'destructive' });
    }
  };

  const downloadLessonAsPPT = (plan: SavedLessonPlan) => {
    const pptx = new pptxgen();
    pptx.author = 'Teacher Library';
    pptx.title = plan.title;

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(plan.title, {
      x: 0.5, y: 2, w: 9, h: 1.5,
      fontSize: 36, bold: true, align: 'center',
    });
    titleSlide.addText(`Standard: ${plan.standard}`, {
      x: 0.5, y: 3.5, w: 9, h: 0.5,
      fontSize: 18, align: 'center',
    });

    // Content slides
    plan.slides.forEach((slide) => {
      const pptSlide = pptx.addSlide();
      pptSlide.addText(slide.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.8,
        fontSize: 28, bold: true,
      });
      const bulletPoints = slide.content.map((item) => ({ text: item, options: { bullet: true } }));
      pptSlide.addText(bulletPoints, {
        x: 0.5, y: 1.5, w: 9, h: 4,
        fontSize: 18, valign: 'top',
      });
      if (slide.speakerNotes) {
        pptSlide.addNotes(slide.speakerNotes);
      }
    });

    pptx.writeFile({ fileName: `${plan.title}.pptx` });
    toast({ title: 'PowerPoint downloaded' });
  };

  const downloadWorksheetAsPDF = (worksheet: SavedWorksheet) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(worksheet.title, 20, 20);
    
    let yPos = 35;
    const questions = worksheet.questions || [];
    questions.forEach((q: any, idx: number) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(12);
      const questionText = `${idx + 1}. ${q.question || q.questionText || 'Question'}`;
      const lines = doc.splitTextToSize(questionText, 170);
      doc.text(lines, 20, yPos);
      yPos += lines.length * 7 + 10;
    });

    doc.save(`${worksheet.title}.pdf`);
    toast({ title: 'PDF downloaded' });
  };

  // Grade color helper
  const getGradeColor = (grade: number) => {
    if (grade >= 85) return 'bg-green-500';
    if (grade >= 70) return 'bg-yellow-500';
    if (grade >= 55) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Stats
  const stats = {
    worksheets: worksheets.length,
    lessons: lessonPlans.length,
    graded: gradedWork.length,
    favorites: lessonPlans.filter(l => l.is_favorite).length,
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="h-8 w-8 text-primary" />
              Teacher Library
            </h1>
            <p className="text-muted-foreground mt-1">
              Access your worksheets, lesson plans, and graded work samples year after year
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.worksheets}</p>
                <p className="text-sm text-muted-foreground">Worksheets</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200 dark:border-purple-800">
            <CardContent className="p-4 flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.lessons}</p>
                <p className="text-sm text-muted-foreground">Lesson Plans</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200 dark:border-green-800">
            <CardContent className="p-4 flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.graded}</p>
                <p className="text-sm text-muted-foreground">Graded Samples</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <Star className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{stats.favorites}</p>
                <p className="text-sm text-muted-foreground">Favorites</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={filterFavorites ? 'default' : 'outline'}
            onClick={() => setFilterFavorites(!filterFavorites)}
            className="gap-2"
          >
            <Star className={`h-4 w-4 ${filterFavorites ? 'fill-current' : ''}`} />
            Favorites
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="worksheets" className="gap-2">
              <FileText className="h-4 w-4" />
              Worksheets ({filteredWorksheets.length})
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Lesson Plans ({filteredLessonPlans.length})
            </TabsTrigger>
            <TabsTrigger value="graded" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              Graded Work ({filteredGradedWork.length})
            </TabsTrigger>
          </TabsList>

          {/* Worksheets Tab */}
          <TabsContent value="worksheets" className="mt-6">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filteredWorksheets.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold">No worksheets found</h3>
                <p className="text-muted-foreground">Create worksheets in the Questions page</p>
                <Button className="mt-4" onClick={() => navigate('/questions')}>
                  Create Worksheet
                </Button>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWorksheets.map((worksheet, index) => (
                  <motion.div
                    key={worksheet.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg truncate">{worksheet.title}</CardTitle>
                            <CardDescription className="flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              Created: {format(new Date(worksheet.created_at), 'MMM d, yyyy')}
                            </CardDescription>
                            {worksheet.due_date && (
                              <CardDescription className="flex items-center gap-1 mt-0.5 text-orange-600 dark:text-orange-400">
                                <Calendar className="h-3 w-3" />
                                Due: {format(new Date(worksheet.due_date), 'MMM d, yyyy')}
                              </CardDescription>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!worksheet.is_assigned && (
                                <DropdownMenuItem asChild>
                                  <AssignWorksheetDialog
                                    worksheetId={worksheet.id}
                                    worksheetTitle={worksheet.title}
                                    onAssigned={() => loadWorksheets()}
                                    trigger={
                                      <button className="flex items-center w-full px-2 py-1.5 text-sm">
                                        <Send className="h-4 w-4 mr-2" />
                                        Assign to Class
                                      </button>
                                    }
                                  />
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => downloadWorksheetAsPDF(worksheet)}>
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateWorksheet(worksheet)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              {worksheet.share_code && (
                                <DropdownMenuItem onClick={() => window.open(`/worksheet/${worksheet.share_code}`, '_blank')}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View Shared Link
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => setDeleteTarget({ type: 'worksheets', id: worksheet.id })}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(worksheet.topics as any[])?.slice(0, 3).map((topic, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {topic.topicName || topic.topic || 'Topic'}
                            </Badge>
                          ))}
                          {(worksheet.topics as any[])?.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(worksheet.topics as any[]).length - 3}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{(worksheet.questions as any[])?.length || 0} questions</span>
                          <div className="flex items-center gap-1">
                            {worksheet.is_assigned && (
                              <Badge variant="default" className="text-xs bg-green-600">
                                Assigned
                              </Badge>
                            )}
                            {worksheet.is_shared && (
                              <Badge variant="outline" className="text-xs">
                                Shared
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWorksheets.map((worksheet) => (
                  <Card key={worksheet.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <h3 className="font-medium">{worksheet.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {(worksheet.questions as any[])?.length || 0} questions • {format(new Date(worksheet.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => downloadWorksheetAsPDF(worksheet)}>
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => duplicateWorksheet(worksheet)}>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setDeleteTarget({ type: 'worksheets', id: worksheet.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Lesson Plans Tab */}
          <TabsContent value="lessons" className="mt-6">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filteredLessonPlans.length === 0 ? (
              <Card className="p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold">No lesson plans found</h3>
                <p className="text-muted-foreground">Generate lesson plans from the Questions page</p>
                <Button className="mt-4" onClick={() => navigate('/questions')}>
                  Create Lesson Plan
                </Button>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLessonPlans.map((plan, index) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg truncate">{plan.title}</CardTitle>
                            <CardDescription className="flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              {plan.duration} • {format(new Date(plan.created_at), 'MMM d, yyyy')}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleFavorite(plan.id)}
                            >
                              <Star className={`h-4 w-4 ${plan.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => downloadLessonAsPPT(plan)}>
                                  <Presentation className="h-4 w-4 mr-2" />
                                  Download PowerPoint
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => setDeleteTarget({ type: 'lessons', id: plan.id })}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Badge variant="outline" className="mb-2">{plan.standard}</Badge>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {plan.objective}
                        </p>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{plan.slides.length} slides</span>
                          {plan.subject && <Badge variant="secondary">{plan.subject}</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLessonPlans.map((plan) => (
                  <Card key={plan.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <BookOpen className="h-8 w-8 text-purple-500" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{plan.title}</h3>
                            {plan.is_favorite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {plan.slides.length} slides • {plan.duration} • {format(new Date(plan.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => downloadLessonAsPPT(plan)}>
                          <Presentation className="h-4 w-4 mr-1" />
                          PPT
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => toggleFavorite(plan.id)}
                        >
                          <Star className={`h-4 w-4 ${plan.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setDeleteTarget({ type: 'lessons', id: plan.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Graded Work Tab */}
          <TabsContent value="graded" className="mt-6">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filteredGradedWork.length === 0 ? (
              <Card className="p-12 text-center">
                <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold">No graded work found</h3>
                <p className="text-muted-foreground">Grade student work from the Scan page</p>
                <Button className="mt-4" onClick={() => navigate('/scan')}>
                  Go to Scan
                </Button>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredGradedWork.map((work, index) => (
                  <motion.div
                    key={work.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm truncate">{work.student_name}</CardTitle>
                            <CardDescription className="truncate">{work.topic_name}</CardDescription>
                          </div>
                          <div className={`w-12 h-12 rounded-full ${getGradeColor(work.grade)} flex items-center justify-center text-white font-bold`}>
                            {work.grade}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {format(new Date(work.created_at), 'MMM d, yyyy')}
                          </span>
                          {work.regents_score !== null && (
                            <Badge variant="outline">Regents: {work.regents_score}/4</Badge>
                          )}
                        </div>
                        {work.nys_standard && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {work.nys_standard}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGradedWork.map((work) => (
                  <Card key={work.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full ${getGradeColor(work.grade)} flex items-center justify-center text-white font-bold text-sm`}>
                          {work.grade}
                        </div>
                        <div>
                          <h3 className="font-medium">{work.student_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {work.topic_name} • {format(new Date(work.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {work.regents_score !== null && (
                          <Badge variant="outline">Regents: {work.regents_score}/4</Badge>
                        )}
                        {work.nys_standard && (
                          <Badge variant="secondary">{work.nys_standard}</Badge>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setDeleteTarget({ type: 'graded', id: work.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this item from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
