import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Copy, Check, ChevronRight, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { EditClassDialog } from '@/components/classes/EditClassDialog';
import { ArchiveClassDialog } from '@/components/classes/ArchiveClassDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';

interface ClassWithStudentCount {
  id: string;
  name: string;
  join_code: string;
  school_year: string | null;
  class_period: string | null;
  created_at: string;
  archived_at: string | null;
  student_count: number;
}

export default function Classes() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassWithStudentCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchClasses();
    }
  }, [user]);

  async function fetchClasses() {
    if (!user) return;

    try {
      // Fetch classes for this teacher
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name, join_code, school_year, class_period, created_at, archived_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (classError) throw classError;

      // Fetch student counts per class
      const classIds = (classData || []).map(c => c.id);
      let studentCounts: Record<string, number> = {};
      
      if (classIds.length > 0) {
        const { data: students, error: studentError } = await supabase
          .from('students')
          .select('class_id')
          .in('class_id', classIds);
        
        if (!studentError && students) {
          for (const s of students) {
            studentCounts[s.class_id] = (studentCounts[s.class_id] || 0) + 1;
          }
        }
      }

      const merged = (classData || []).map(c => ({
        ...c,
        student_count: studentCounts[c.id] || 0,
      }));

      setClasses(merged);
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load classes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const copyJoinCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({
      title: 'Copied!',
      description: 'Join code copied to clipboard',
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeClasses = classes.filter(c => !c.archived_at);
  const archivedClasses = classes.filter(c => c.archived_at);

  const renderClassCard = (cls: ClassWithStudentCount) => (
    <Card key={cls.id} className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <Link to={`/classes/${cls.id}`} className="hover:underline flex-1">
            {cls.name}
          </Link>
          <div className="flex items-center gap-1">
            <EditClassDialog
              classId={cls.id}
              currentName={cls.name}
              currentPeriod={cls.class_period}
              currentYear={cls.school_year}
              onUpdate={fetchClasses}
            />
            <ArchiveClassDialog
              classId={cls.id}
              className={cls.name}
              isArchived={!!cls.archived_at}
              onUpdate={fetchClasses}
            />
            <Link to={`/classes/${cls.id}`}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {cls.school_year || 'No year set'}
          {cls.class_period && (
            <Badge variant="secondary" className="text-xs">
              {cls.class_period}
            </Badge>
          )}
          {cls.archived_at && (
            <Badge variant="outline" className="text-xs text-orange-600">
              Archived
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              if (cls.join_code) copyJoinCode(cls.join_code);
            }}
          >
            {copiedCode === cls.join_code ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {cls.join_code || 'No code'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Classes</h1>
            <p className="text-muted-foreground">Manage your classes and students</p>
          </div>
          <Link to="/classes/new">
            <Button variant="hero">
              <Plus className="h-4 w-4" />
              Create Class
            </Button>
          </Link>
        </div>

        {/* Classes Tabs */}
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/3 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : classes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium text-lg mb-2">No classes yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first class to get started
              </p>
              <Link to="/classes/new">
                <Button variant="hero">
                  <Plus className="h-4 w-4" />
                  Create Class
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList>
              <TabsTrigger value="active" className="gap-2">
                <Users className="h-4 w-4" />
                Active ({activeClasses.length})
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-2">
                <Archive className="h-4 w-4" />
                Archived ({archivedClasses.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {activeClasses.length === 0 ? (
                <Card className="text-center py-8">
                  <CardContent>
                    <p className="text-muted-foreground">No active classes</p>
                    <Link to="/classes/new" className="mt-4 inline-block">
                      <Button variant="hero" size="sm">
                        <Plus className="h-4 w-4" />
                        Create Class
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeClasses.map(renderClassCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="archived">
              {archivedClasses.length === 0 ? (
                <Card className="text-center py-8">
                  <CardContent>
                    <Archive className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No archived classes</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Classes you archive will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {archivedClasses.map(renderClassCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
