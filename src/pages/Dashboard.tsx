import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  ClipboardList, 
  Camera, 
  TrendingUp, 
  AlertTriangle,
  ChevronRight,
  Presentation,
  Plus,
  BarChart3,
  GraduationCap,
  School,
  MessageSquare,
  Clock,
  FileText,
  Trash2,
  Lightbulb,
  CheckCircle2,
  Circle,
  Sparkles
} from 'lucide-react';
import { RemediationCompletionsBadge } from '@/components/dashboard/RemediationCompletionsBadge';
import { PendingScholarDataBadge } from '@/components/dashboard/PendingScholarDataBadge';
import { VerificationStatsWidget } from '@/components/reports/VerificationStatsWidget';
import { StudentsNeedingHelpWidget } from '@/components/reports/StudentsNeedingHelpWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAuth } from '@/lib/auth';
import { LessonPlanGenerator } from '@/components/questions/LessonPlanGenerator';
import { LessonTopicSelector, type PresentationTheme } from '@/components/questions/LessonTopicSelector';
import { format } from 'date-fns';

interface RecentLessonPlan {
  id: string;
  title: string;
  topic_name: string;
  standard: string;
  subject: string | null;
  created_at: string;
}

const teacherTips = [
  "Start each class by reviewing common misconceptions from the last assessment.",
  "Use student work samples to spark discussion about different problem-solving approaches.",
  "Celebrate progress, not just perfection—growth mindset matters!",
  "Quick exit tickets can reveal gaps before they become bigger issues.",
  "Pair struggling students with peer tutors for collaborative learning.",
  "Visual representations help students connect abstract concepts to real understanding.",
  "Give students time to struggle productively before offering hints.",
  "Regular low-stakes assessments reduce test anxiety and improve retention.",
  "Ask 'How do you know?' to deepen mathematical reasoning.",
  "Mistakes are learning opportunities—normalize productive failure."
];

const gettingStartedSteps = [
  { id: 1, label: "Create your first class", description: "Add a class with your students' names", href: "/classes/new" },
  { id: 2, label: "Build a worksheet", description: "Generate AI-powered practice problems", href: "/questions" },
  { id: 3, label: "Scan student work", description: "Use the camera to grade papers instantly", href: "/scan" },
  { id: 4, label: "Review reports", description: "See insights on student performance", href: "/reports" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Use unified dashboard stats hook - replaces 9+ individual API calls with 1
  const { data: dashboardData, isLoading: loading } = useDashboardStats();
  
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [showLessonGenerator, setShowLessonGenerator] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<{ topicName: string; standard: string; subject: string } | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<PresentationTheme | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<RecentLessonPlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract data from unified hook with defaults
  const stats = {
    classCount: dashboardData?.class_count || 0,
    studentCount: dashboardData?.student_count || 0,
    questionCount: dashboardData?.question_count || 0,
    recentAttempts: 0, // This can be added to RPC later if needed
    unreadComments: dashboardData?.unread_comments_count || 0,
  };
  
  const recentLessons = dashboardData?.recent_lessons || [];
  const userName = dashboardData?.profile?.full_name?.split(' ')[0] || '';


  const handleTopicSelected = (topic: { topicName: string; standard: string; subject: string }, theme: PresentationTheme) => {
    setSelectedTopic(topic);
    setSelectedTheme(theme);
    setShowTopicSelector(false);
    setShowLessonGenerator(true);
  };

  const handleOpenExistingLesson = (lesson: RecentLessonPlan) => {
    setSelectedLessonId(lesson.id);
    setSelectedTopic({
      topicName: lesson.topic_name,
      standard: lesson.standard,
      subject: lesson.subject || 'Geometry'
    });
    setSelectedTheme(null);
    setShowLessonGenerator(true);
  };

  const handleDeleteLesson = async () => {
    if (!lessonToDelete || !user) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('lesson_plans')
        .delete()
        .eq('id', lessonToDelete.id);

      if (error) throw error;

      // Invalidate the dashboard stats query to refresh the lesson list
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', user.id] });
      toast.success('Lesson plan deleted');
    } catch (error) {
      console.error('Error deleting lesson plan:', error);
      toast.error('Failed to delete lesson plan');
    } finally {
      setIsDeleting(false);
      setLessonToDelete(null);
    }
  };

  const quickActions = [
    { label: 'Simple Mode', href: '/simple-mode', icon: Sparkles, color: 'bg-gradient-to-r from-violet-100 to-purple-100 text-violet-700 dark:from-violet-900 dark:to-purple-900 dark:text-violet-300' },
    { label: 'Create Class', href: '/classes/new', icon: Users, color: 'bg-primary/10 text-primary' },
    { label: 'New Assessment', href: '/questions', icon: ClipboardList, color: 'bg-accent/10 text-accent' },
    { label: 'Make a Lesson', href: null, icon: Presentation, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', onClick: () => setShowTopicSelector(true) },
    { label: 'Start Scanning', href: '/scan', icon: Camera, color: 'bg-warning/10 text-warning' },
    { label: 'View Reports', href: '/reports', icon: BarChart3, color: 'bg-success/10 text-success' },
  ];

  const statCards = [
    { label: 'Classes', value: stats.classCount, icon: School, href: '/classes' },
    { label: 'Students', value: stats.studentCount, icon: GraduationCap, href: '/classes' },
    { label: 'Questions', value: stats.questionCount, icon: ClipboardList, href: '/questions' },
    { label: 'Scans Today', value: stats.recentAttempts, icon: Camera, href: '/reports' },
  ];

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="animate-fade-in flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-foreground">
                Welcome back{userName ? `, ${userName}` : ''}!
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded border border-amber-500/30">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Differentiation, built into every sheet.
            </p>
          </div>
          
          {/* Notification Badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Pending Inbound Scholar Data Badge */}
            <PendingScholarDataBadge />
            
            {/* Remediation Completions Badge */}
            <RemediationCompletionsBadge />
            
            {/* Unread Comments Badge */}
            {stats.unreadComments > 0 && (
              <Link to="/reports">
                <Card className="border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="relative">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                        {stats.unreadComments > 9 ? '9+' : stats.unreadComments}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-foreground">
                        {stats.unreadComments} unread {stats.unreadComments === 1 ? 'comment' : 'comments'}
                      </p>
                      <p className="text-muted-foreground text-xs">from students</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </div>

        {/* Daily Teaching Tip & Getting Started */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          {/* Daily Teaching Tip */}
          <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                  <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                    Daily Teaching Tip
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {teacherTips[new Date().getDate() % teacherTips.length]}
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-amber-400 dark:text-amber-500 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>

          {/* Getting Started Steps */}
          {stats.classCount === 0 && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
                  Getting Started
                </p>
                <div className="space-y-2">
                  {gettingStartedSteps.map((step) => {
                    const isComplete = 
                      (step.id === 1 && stats.classCount > 0) ||
                      (step.id === 2 && stats.questionCount > 0);
                    
                    return (
                      <Link 
                        key={step.id} 
                        to={step.href}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors group"
                      >
                        {isComplete ? (
                          <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 animate-slide-up">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const content = (
              <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                  <div className={`p-3 rounded-xl ${action.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="font-medium text-sm">{action.label}</span>
                </CardContent>
              </Card>
            );

            if (action.onClick) {
              return (
                <div key={action.label} onClick={action.onClick}>
                  {content}
                </div>
              );
            }

            return (
              <Link key={action.href} to={action.href!}>
                {content}
              </Link>
            );
          })}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Link key={stat.label} to={stat.href}>
                <Card 
                  className="hover:shadow-md transition-all duration-200 cursor-pointer"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {loading ? '—' : stat.value}
                        </p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </div>
                      <Icon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Lesson Plans */}
          <Card className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Lesson Plans</CardTitle>
                <CardDescription>Quickly access your latest lessons</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTopicSelector(true)}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </CardHeader>
            <CardContent>
              {recentLessons.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No lesson plans yet</p>
                  <p className="text-sm">Create your first lesson plan</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => setShowTopicSelector(true)}
                  >
                    <Presentation className="h-4 w-4 mr-2" />
                    Make a Lesson
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                    >
                      <div 
                        onClick={() => handleOpenExistingLesson(lesson)}
                        className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 shrink-0">
                          <Presentation className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{lesson.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {lesson.standard} • {lesson.topic_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(lesson.created_at), 'MMM d')}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLessonToDelete(lesson);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Topic Mastery Overview */}
          <Card className="animate-slide-up" style={{ animationDelay: '150ms' }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Topic Mastery</CardTitle>
                <CardDescription>Class performance by topic</CardDescription>
              </div>
              <Link to="/reports">
                <Button variant="ghost" size="sm">
                  Details <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {stats.classCount === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No data yet</p>
                  <p className="text-sm">Create a class and add students to see mastery data</p>
                  <Link to="/classes/new" className="mt-4 inline-block">
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Class
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-muted-foreground">Mastery data will appear here</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Students Needing Help Widget */}
        <StudentsNeedingHelpWidget className="animate-slide-up" />

        {/* AI Verification Stats Widget */}
        <VerificationStatsWidget className="animate-slide-up" />

        {/* Getting Started */}
        {stats.classCount === 0 && (
          <Card className="border-primary/20 bg-primary/5 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Getting Started
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">1</span>
                  <span><strong>Create a class</strong> and add your students (manual or CSV import)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">2</span>
                  <span><strong>Add JMAP questions</strong> to your question bank with rubrics</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">3</span>
                  <span><strong>Create an assessment</strong> and generate printable packets with QR codes</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">4</span>
                  <span><strong>Scan student work</strong> to get instant diagnostics and misconception tags</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Topic Selector Dialog */}
        <LessonTopicSelector
          open={showTopicSelector}
          onOpenChange={setShowTopicSelector}
          onSelect={handleTopicSelected}
        />

        {/* Lesson Plan Generator Dialog */}
        <LessonPlanGenerator
          open={showLessonGenerator}
          onOpenChange={(open) => {
            setShowLessonGenerator(open);
            if (!open) {
              setSelectedLessonId(null);
            }
          }}
          topic={selectedTopic}
          presentationTheme={selectedTheme}
          existingLessonId={selectedLessonId}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!lessonToDelete} onOpenChange={(open) => !open && setLessonToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lesson Plan</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{lessonToDelete?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteLesson}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}