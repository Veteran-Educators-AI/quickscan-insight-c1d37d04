import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Upload, Copy, Check, Trash2, Users, Printer, Eye, EyeOff, Pencil, QrCode, BookOpen, ExternalLink, FileText, Database, MinusCircle, Rocket } from 'lucide-react';
import { useStudentDataCoverage } from '@/hooks/useStudentDataCoverage';
import { StudentOnlyQRCode } from '@/components/print/StudentOnlyQRCode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PrintWorksheetDialog } from '@/components/print/PrintWorksheetDialog';
import { useStudentNames } from '@/lib/StudentNameContext';
import { getStudentPseudonym, getAvailablePseudonyms, setCustomPseudonym } from '@/lib/studentPseudonyms';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Gradebook } from '@/components/reports/Gradebook';
import { BehaviorPointDeductionDialog } from '@/components/behavior/BehaviorPointDeductionDialog';
import { EditStudentDialog } from '@/components/classes/EditStudentDialog';
import { SyncRosterToScholarButton } from '@/components/classes/SyncRosterToScholarButton';
import { PushAssignmentDialog } from '@/components/reports/PushAssignmentDialog';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
  email: string | null;
  custom_pseudonym: string | null;
}

interface ClassData {
  id: string;
  name: string;
  join_code: string;
  school_year: string | null;
  class_period: string | null;
}

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getDisplayName, getDisplayEmail, getDisplayStudentNumber, revealRealNames, toggleRevealNames, remainingSeconds } = useStudentNames();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ firstName: '', lastName: '', studentId: '', email: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [behaviorDeductionOpen, setBehaviorDeductionOpen] = useState(false);
  const [pushAssignmentOpen, setPushAssignmentOpen] = useState(false);
  
  const availablePseudonyms = getAvailablePseudonyms();
  const { coverage, totalAssignments, totalDataPoints, isLoading: coverageLoading } = useStudentDataCoverage(id);

  useEffect(() => {
    if (id) fetchClassData();
  }, [id]);

  async function fetchClassData() {
    try {
      const { data: cls, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();

      if (classError) throw classError;
      setClassData(cls);

      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', id)
        .order('last_name', { ascending: true });

      if (studentsError) throw studentsError;
      
      // Load custom pseudonyms into cache
      (studentsData || []).forEach(student => {
        if (student.custom_pseudonym) {
          setCustomPseudonym(student.id, student.custom_pseudonym);
        }
      });
      
      setStudents(studentsData || []);
      setSelectedStudents(new Set()); // Clear selection after refresh
    } catch (error) {
      console.error('Error fetching class:', error);
      toast({
        title: 'Error',
        description: 'Failed to load class data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const copyJoinCode = async () => {
    if (!classData || !classData.join_code) return;
    await navigator.clipboard.writeText(classData.join_code);
    setCopiedCode(true);
    toast({ title: 'Copied!', description: 'Join code copied to clipboard' });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleUpdatePseudonym = async (studentId: string, newPseudonym: string | null) => {
    // Handle reset option
    const actualPseudonym = newPseudonym === '__reset__' ? null : newPseudonym;
    
    try {
      const { error } = await supabase
        .from('students')
        .update({ custom_pseudonym: actualPseudonym })
        .eq('id', studentId);

      if (error) throw error;

      // Update local cache
      setCustomPseudonym(studentId, actualPseudonym);
      
      // Update local state
      setStudents(prev => prev.map(s => 
        s.id === studentId ? { ...s, custom_pseudonym: actualPseudonym } : s
      ));
      
      toast({ title: 'Pseudonym updated!' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update pseudonym',
        variant: 'destructive',
      });
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setIsAdding(true);
    try {
      const { error } = await supabase.from('students').insert({
        class_id: id,
        first_name: newStudent.firstName,
        last_name: newStudent.lastName,
        student_id: newStudent.studentId || null,
        email: newStudent.email || null,
      });

      if (error) throw error;

      toast({ title: 'Student added!' });
      setNewStudent({ firstName: '', lastName: '', studentId: '', email: '' });
      setAddStudentOpen(false);
      fetchClassData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add student',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Helper to detect if a string is an email
  const isEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  // Normalize header names to detect column mapping
  const normalizeHeader = (header: string): string => {
    const h = header.toLowerCase().trim().replace(/[_\-\s]+/g, '');
    if (h === 'firstname' || h === 'first' || h === 'fname') return 'first_name';
    if (h === 'lastname' || h === 'last' || h === 'lname' || h === 'surname') return 'last_name';
    if (h === 'studentid' || h === 'id' || h === 'sid') return 'student_id';
    if (h === 'email' || h === 'emailaddress' || h === 'mail') return 'email';
    if (h === 'name' || h === 'fullname') return 'full_name';
    return h;
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headerLine = lines[0];
        const headerParts = headerLine.split(',').map(p => p.trim().replace(/"/g, ''));
        
        // Detect if first row is header by checking for common header names
        const normalizedHeaders = headerParts.map(normalizeHeader);
        const hasHeader = normalizedHeaders.some(h => 
          ['first_name', 'last_name', 'student_id', 'email', 'full_name'].includes(h)
        );

        // Build column mapping from headers
        let columnMap: { [key: string]: number } = {};
        if (hasHeader) {
          normalizedHeaders.forEach((h, i) => {
            columnMap[h] = i;
          });
        } else {
          // Default positional mapping: first_name, last_name, student_id, email
          columnMap = { first_name: 0, last_name: 1, student_id: 2, email: 3 };
        }

        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Track skipped students for detailed logging
        const skippedStudents: { line: number; reason: string; data: string }[] = [];

        const studentsToAdd = dataLines.map((line, lineIndex) => {
          const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
          
          // Extract values based on column mapping
          let firstName = '';
          let lastName = '';
          let studentIdValue: string | null = null;
          let emailValue: string | null = null;

          // Handle full_name column (split into first/last)
          if (columnMap.full_name !== undefined) {
            const fullName = parts[columnMap.full_name] || '';
            const nameParts = fullName.split(/\s+/);
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          } else {
            firstName = columnMap.first_name !== undefined ? (parts[columnMap.first_name] || '') : '';
            lastName = columnMap.last_name !== undefined ? (parts[columnMap.last_name] || '') : '';
          }

          // Get student_id and email from mapped columns
          const mappedStudentId = columnMap.student_id !== undefined ? (parts[columnMap.student_id] || '') : '';
          const mappedEmail = columnMap.email !== undefined ? (parts[columnMap.email] || '') : '';

          // Auto-classify: if mapped student_id looks like email, swap them
          if (isEmail(mappedStudentId) && !isEmail(mappedEmail)) {
            emailValue = mappedStudentId || null;
            studentIdValue = mappedEmail || null;
          } else {
            studentIdValue = mappedStudentId || null;
            emailValue = mappedEmail || null;
          }

          // Also scan all columns for emails if we haven't found one
          if (!emailValue) {
            for (const part of parts) {
              if (isEmail(part)) {
                emailValue = part;
                break;
              }
            }
          }

          const student = {
            class_id: id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            student_id: studentIdValue && !isEmail(studentIdValue) ? studentIdValue : null,
            email: emailValue,
            _lineNumber: lineIndex + (hasHeader ? 2 : 1), // Track line number for error reporting
            _rawData: line,
          };

          return student;
        });

        // Separate valid and invalid students with detailed logging
        const validStudents: typeof studentsToAdd = [];
        
        for (const student of studentsToAdd) {
          const lineNum = student._lineNumber;
          const rawData = student._rawData;
          
          if (!student.first_name && !student.last_name) {
            skippedStudents.push({
              line: lineNum,
              reason: 'Missing both first and last name',
              data: rawData,
            });
          } else if (!student.first_name) {
            // Allow students with only last name - use "Unknown" as first name
            validStudents.push({
              ...student,
              first_name: 'Unknown',
            });
          } else if (!student.last_name) {
            // Allow students with only first name - use "Unknown" as last name
            validStudents.push({
              ...student,
              last_name: 'Unknown',
            });
          } else {
            validStudents.push(student);
          }
        }

        // Clean up internal tracking properties before insert
        const cleanedStudents = validStudents.map(({ _lineNumber, _rawData, ...rest }) => rest);

        if (cleanedStudents.length === 0) {
          toast({
            title: 'Invalid CSV',
            description: 'No valid student data found. Expected columns: first_name, last_name, student_id, email (in any order)',
            variant: 'destructive',
          });
          return;
        }

        const { error } = await supabase.from('students').insert(cleanedStudents);
        if (error) throw error;

        // Show detailed import results
        if (skippedStudents.length > 0) {
          console.warn('Skipped students during CSV import:', skippedStudents);
          toast({
            title: 'Students imported with warnings',
            description: `Added ${cleanedStudents.length} students. Skipped ${skippedStudents.length} rows (missing names). Check console for details.`,
            duration: 8000,
          });
        } else {
          toast({
            title: 'Students imported!',
            description: `Added ${cleanedStudents.length} students`,
          });
        }
        fetchClassData();
      } catch (error: any) {
        console.error('CSV Import Error:', error);
        toast({
          title: 'Import failed',
          description: error.message || 'Failed to import CSV',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      toast({ title: 'Student removed' });
      fetchClassData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete student',
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = async () => {
    try {
      const idsToDelete = Array.from(selectedStudents);
      const { error } = await supabase
        .from('students')
        .delete()
        .in('id', idsToDelete);
      
      if (error) throw error;
      
      toast({ 
        title: 'Students removed', 
        description: `Deleted ${idsToDelete.length} student(s)` 
      });
      setBulkDeleteOpen(false);
      fetchClassData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete students',
        variant: 'destructive',
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  };

  const toggleSelectStudent = (studentId: string) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </AppLayout>
    );
  }

  if (!classData) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Class not found</p>
          <Button variant="outline" onClick={() => navigate('/classes')} className="mt-4">
            Back to Classes
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/classes')} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Classes
        </Button>

        {/* Class Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{classData.name}</CardTitle>
                <CardDescription>{classData.school_year || 'No year set'}</CardDescription>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Button variant="outline" onClick={copyJoinCode}>
                  {copiedCode ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Join Code: {classData.join_code || 'None'}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    const studentUrl = `${window.location.origin}/student/login`;
                    navigator.clipboard.writeText(studentUrl);
                    toast({ title: 'Copied!', description: 'Student portal URL copied to clipboard' });
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Copy Student Portal Link
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPushAssignmentOpen(true)}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
                >
                  <Rocket className="h-3 w-3 mr-1" />
                  Push Assignment
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs for Students and Gradebook */}
        <Tabs defaultValue="students" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="students" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Students ({students.length})
            </TabsTrigger>
            <TabsTrigger value="gradebook" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Gradebook
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students">
            {/* Data Coverage Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Users className="h-4 w-4" />
                  <span>Students</span>
                </div>
                <p className="text-2xl font-bold">{students.length}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <FileText className="h-4 w-4" />
                  <span>Total Submissions</span>
                </div>
                <p className="text-2xl font-bold">{coverageLoading ? '...' : totalAssignments}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Database className="h-4 w-4" />
                  <span>Data Points</span>
                </div>
                <p className="text-2xl font-bold">{coverageLoading ? '...' : totalDataPoints}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <span className="text-xs">📧</span>
                  <span>With Email</span>
                </div>
                <p className="text-2xl font-bold">{students.filter(s => s.email).length}</p>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Students ({students.length})
                    </CardTitle>
                    <CardDescription>Manage your class roster</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                {selectedStudents.size > 0 && (
                  <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedStudents.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedStudents.size} Student(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {selectedStudents.size} student(s) and all their assessment data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete All Selected
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                />
                <PrintWorksheetDialog 
                  classId={id!} 
                  students={students}
                  trigger={
                    <Button variant="outline">
                      <Printer className="h-4 w-4 mr-2" />
                      Print Worksheets
                    </Button>
                  }
                />
                <Button 
                  variant="outline" 
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setBehaviorDeductionOpen(true)}
                >
                  <MinusCircle className="h-4 w-4 mr-2" />
                  Deduct Points
                </Button>
                <SyncRosterToScholarButton
                  classId={id!}
                  className={classData.name}
                  students={students}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
                <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Student
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Student</DialogTitle>
                      <DialogDescription>Add a new student to this class</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddStudent} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input
                            id="firstName"
                            value={newStudent.firstName}
                            onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name *</Label>
                          <Input
                            id="lastName"
                            value={newStudent.lastName}
                            onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="studentId">Student ID</Label>
                        <Input
                          id="studentId"
                          value={newStudent.studentId}
                          onChange={(e) => setNewStudent({ ...newStudent, studentId: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newStudent.email}
                          onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                        />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddStudentOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isAdding}>
                          {isAdding ? 'Adding...' : 'Add Student'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No students yet</p>
                <p className="text-sm">Add students manually or import from CSV</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedStudents.size === students.length && students.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all students"
                      />
                    </TableHead>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="w-16 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <QrCode className="h-3.5 w-3.5" />
                        <span className="text-xs">QR</span>
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <span>Name</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleRevealNames}
                          className="h-7 px-2 gap-1 text-xs"
                        >
                          {revealRealNames ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              <span>Hide</span>
                              {remainingSeconds !== null && (
                                <span className="text-muted-foreground">({Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, '0')})</span>
                              )}
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              <span>Show Real</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="text-xs">Submissions</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Database className="h-3.5 w-3.5" />
                        <span className="text-xs">Data Points</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student, index) => {
                    const displayName = getDisplayName(student.id, student.first_name, student.last_name);
                    const currentPseudonym = getStudentPseudonym(student.id);
                    return (
                    <TableRow key={student.id} className={selectedStudents.has(student.id) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedStudents.has(student.id)}
                          onCheckedChange={() => toggleSelectStudent(student.id)}
                          aria-label={`Select ${displayName}`}
                        />
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">
                        {index + 1}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <StudentOnlyQRCode studentId={student.id} size={36} />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{displayName}</span>
                          {!revealRealNames && (
                            <Select
                              value={currentPseudonym}
                              onValueChange={(value) => handleUpdatePseudonym(student.id, value)}
                            >
                              <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent hover:bg-muted [&>svg]:hidden">
                                <Pencil className="h-3 w-3 mx-auto text-muted-foreground" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                {student.custom_pseudonym && (
                                  <SelectItem value="__reset__" className="text-xs text-muted-foreground">
                                    ↩ Reset to Default
                                  </SelectItem>
                                )}
                                {availablePseudonyms.map((p) => (
                                  <SelectItem key={p} value={p} className="text-sm">
                                    {p}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {getDisplayStudentNumber(student.student_id)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {student.email ? getDisplayEmail(student.id, student.email) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {coverageLoading ? (
                          <span className="text-muted-foreground">...</span>
                        ) : (
                          <span className={`font-medium ${(coverage.get(student.id)?.assignmentsSubmitted || 0) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                            {coverage.get(student.id)?.assignmentsSubmitted || 0}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {coverageLoading ? (
                          <span className="text-muted-foreground">...</span>
                        ) : (
                          <span className={`font-medium ${(coverage.get(student.id)?.totalDataPoints || 0) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                            {coverage.get(student.id)?.totalDataPoints || 0}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <EditStudentDialog
                            student={student}
                            classId={id!}
                            className={classData.name}
                            onUpdate={fetchClassData}
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Student?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove {displayName} and all their assessment data. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteStudent(student.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    )}
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="gradebook">
        <Gradebook classId={id} />
      </TabsContent>
    </Tabs>

        {/* Behavior Point Deduction Dialog */}
        <BehaviorPointDeductionDialog
          open={behaviorDeductionOpen}
          onOpenChange={setBehaviorDeductionOpen}
          preselectedClassId={id}
        />

        {/* Push Assignment Dialog */}
        <PushAssignmentDialog
          open={pushAssignmentOpen}
          onOpenChange={setPushAssignmentOpen}
          defaultClassId={id}
        />
      </div>
    </AppLayout>
  );
}