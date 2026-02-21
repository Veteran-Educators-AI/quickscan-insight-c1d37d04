import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { recentAssignments, classPeriods } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Brain, LogOut, Sparkles, Check, CheckCheck, Eye, Pencil,
  ThumbsUp, AlertTriangle,
} from "lucide-react";

interface RubricScore {
  criterion: string;
  score: number;
  maxPoints: number;
}

interface StudentGrade {
  id: string;
  studentName: string;
  totalScore: number;
  maxScore: number;
  rubricScores: RubricScore[];
  aiFeedback: string;
  status: "ai-suggested" | "approved" | "adjusted";
  teacherNote: string;
}

const rubricCriteria = [
  { criterion: "Thesis Statement", maxPoints: 20 },
  { criterion: "Evidence & Support", maxPoints: 25 },
  { criterion: "Organization", maxPoints: 20 },
  { criterion: "Grammar & Mechanics", maxPoints: 15 },
  { criterion: "Creativity & Voice", maxPoints: 20 },
];

const maxTotal = rubricCriteria.reduce((s, c) => s + c.maxPoints, 0);

function generateMockGrades(count: number): StudentGrade[] {
  return Array.from({ length: count }, (_, i) => {
    const scores = rubricCriteria.map((c) => ({
      criterion: c.criterion,
      score: Math.round(c.maxPoints * (0.55 + Math.random() * 0.4)),
      maxPoints: c.maxPoints,
    }));
    const total = scores.reduce((s, sc) => s + sc.score, 0);
    return {
      id: crypto.randomUUID(),
      studentName: `Student ${i + 1}`,
      totalScore: total,
      maxScore: maxTotal,
      rubricScores: scores,
      aiFeedback: `The student demonstrates ${total / maxTotal > 0.8 ? "strong" : total / maxTotal > 0.65 ? "adequate" : "developing"} understanding of the material. ${total / maxTotal > 0.8 ? "Well-structured argument with clear evidence." : "Consider strengthening thesis support and organization."}`,
      status: "ai-suggested",
      teacherNote: "",
    };
  });
}

const BatchGrading = () => {
  const { teacherName, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailStudent, setDetailStudent] = useState<StudentGrade | null>(null);
  const [editingScore, setEditingScore] = useState<{ id: string; criterion: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const assignment = recentAssignments.find((a) => a.id === selectedAssignment);
  const classPeriod = assignment ? classPeriods.find((c) => c.period === assignment.classPeriod) : null;

  const handleLoadGrades = (assignmentId: string) => {
    setSelectedAssignment(assignmentId);
    const a = recentAssignments.find((x) => x.id === assignmentId);
    if (a) {
      const cp = classPeriods.find((c) => c.period === a.classPeriod);
      setGrades(generateMockGrades(cp?.studentCount ?? 10));
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === grades.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(grades.map((g) => g.id)));
    }
  };

  const approveSelected = () => {
    setGrades((prev) =>
      prev.map((g) => (selectedIds.has(g.id) ? { ...g, status: "approved" as const } : g))
    );
    toast({ title: `${selectedIds.size} grade(s) approved` });
    setSelectedIds(new Set());
  };

  const approveAll = () => {
    setGrades((prev) => prev.map((g) => ({ ...g, status: "approved" as const })));
    toast({ title: "All grades approved" });
    setSelectedIds(new Set());
  };

  const updateScore = (studentId: string, criterion: string, newScore: number) => {
    setGrades((prev) =>
      prev.map((g) => {
        if (g.id !== studentId) return g;
        const updated = g.rubricScores.map((rs) =>
          rs.criterion === criterion ? { ...rs, score: Math.min(Math.max(0, newScore), rs.maxPoints) } : rs
        );
        return {
          ...g,
          rubricScores: updated,
          totalScore: updated.reduce((s, rs) => s + rs.score, 0),
          status: "adjusted" as const,
        };
      })
    );
    setEditingScore(null);
  };

  const updateTeacherNote = (studentId: string, note: string) => {
    setGrades((prev) =>
      prev.map((g) => (g.id === studentId ? { ...g, teacherNote: note } : g))
    );
  };

  const approvedCount = grades.filter((g) => g.status !== "ai-suggested").length;
  const avgScore = grades.length
    ? Math.round(grades.reduce((s, g) => s + (g.totalScore / g.maxScore) * 100, 0) / grades.length)
    : 0;

  const handlePublish = () => {
    const unapproved = grades.filter((g) => g.status === "ai-suggested");
    if (unapproved.length > 0) {
      toast({ title: "Review required", description: `${unapproved.length} grade(s) still need approval.`, variant: "destructive" });
      return;
    }
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
      toast({ title: "Grades published", description: `${grades.length} grades published for ${assignment?.title}.` });
      navigate("/dashboard");
    }, 2000);
  };

  const gradeColor = (pct: number) =>
    pct >= 80 ? "text-accent" : pct >= 65 ? "text-primary" : "text-destructive";

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-accent/10 text-accent border-accent/20 gap-1"><Check className="h-3 w-3" />Approved</Badge>;
      case "adjusted":
        return <Badge className="bg-primary/10 text-primary border-primary/20 gap-1"><Pencil className="h-3 w-3" />Adjusted</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Suggested</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              NYCLogic AI
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm text-muted-foreground">{teacherName}</span>
            <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" className="gap-1.5 mb-6 -ml-2" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>

          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Batch Grading</h1>
              <p className="text-sm text-muted-foreground">Review AI-suggested grades, adjust scores, and publish.</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Assignment Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Assignment</CardTitle>
                <CardDescription>Load AI-generated grades for an assignment.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Assignment</Label>
                  <Select value={selectedAssignment} onValueChange={handleLoadGrades}>
                    <SelectTrigger><SelectValue placeholder="Choose an assignment…" /></SelectTrigger>
                    <SelectContent>
                      {recentAssignments.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.title} — Period {a.classPeriod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Grades Table */}
            {grades.length > 0 && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Students", value: grades.length },
                    { label: "Avg Score", value: `${avgScore}%` },
                    { label: "Approved", value: `${approvedCount}/${grades.length}` },
                    { label: "Max Points", value: maxTotal },
                  ].map((s) => (
                    <Card key={s.label}>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Approval progress */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Review progress</span>
                      <span className="font-medium">{Math.round((approvedCount / grades.length) * 100)}%</span>
                    </div>
                    <Progress value={(approvedCount / grades.length) * 100} />
                  </CardContent>
                </Card>

                {/* Bulk actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {selectedIds.size === grades.length ? "Deselect All" : "Select All"}
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button size="sm" className="gap-1.5" onClick={approveSelected}>
                      <ThumbsUp className="h-3.5 w-3.5" /> Approve Selected ({selectedIds.size})
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={approveAll}>
                    <CheckCheck className="h-3.5 w-3.5" /> Approve All
                  </Button>
                </div>

                {/* Table */}
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectedIds.size === grades.length && grades.length > 0}
                                onCheckedChange={toggleAll}
                              />
                            </TableHead>
                            <TableHead>Student</TableHead>
                            {rubricCriteria.map((c) => (
                              <TableHead key={c.criterion} className="text-center text-xs whitespace-nowrap">
                                {c.criterion}
                                <span className="block text-muted-foreground font-normal">/{c.maxPoints}</span>
                              </TableHead>
                            ))}
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grades.map((g) => {
                            const pct = Math.round((g.totalScore / g.maxScore) * 100);
                            return (
                              <TableRow key={g.id} className={selectedIds.has(g.id) ? "bg-muted/50" : ""}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(g.id)}
                                    onCheckedChange={() => toggleSelect(g.id)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium text-sm whitespace-nowrap">{g.studentName}</TableCell>
                                {g.rubricScores.map((rs) => (
                                  <TableCell key={rs.criterion} className="text-center">
                                    {editingScore?.id === g.id && editingScore?.criterion === rs.criterion ? (
                                      <Input
                                        type="number"
                                        min={0}
                                        max={rs.maxPoints}
                                        defaultValue={rs.score}
                                        className="h-7 w-14 text-center text-xs mx-auto"
                                        autoFocus
                                        onBlur={(e) => updateScore(g.id, rs.criterion, parseInt(e.target.value) || 0)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") updateScore(g.id, rs.criterion, parseInt((e.target as HTMLInputElement).value) || 0);
                                          if (e.key === "Escape") setEditingScore(null);
                                        }}
                                      />
                                    ) : (
                                      <button
                                        className="text-sm hover:bg-muted rounded px-2 py-0.5 transition-colors"
                                        onClick={() => setEditingScore({ id: g.id, criterion: rs.criterion })}
                                        title="Click to edit"
                                      >
                                        {rs.score}
                                      </button>
                                    )}
                                  </TableCell>
                                ))}
                                <TableCell className={`text-center font-bold text-sm ${gradeColor(pct)}`}>
                                  {g.totalScore}
                                  <span className="block text-xs font-normal text-muted-foreground">{pct}%</span>
                                </TableCell>
                                <TableCell className="text-center">{statusBadge(g.status)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailStudent(g)}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Publish */}
                <Card>
                  <CardContent className="p-6">
                    {approvedCount < grades.length && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                        <p>{grades.length - approvedCount} grade(s) still need review before publishing.</p>
                      </div>
                    )}
                    {isPublishing && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
                        <div className="flex items-center gap-3 text-sm text-primary">
                          <Sparkles className="h-4 w-4 animate-pulse" />
                          <span>Publishing grades…</span>
                        </div>
                        <Progress value={70} className="mt-2" />
                      </motion.div>
                    )}
                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => navigate("/dashboard")}>Cancel</Button>
                      <Button className="gap-1.5" onClick={handlePublish} disabled={isPublishing}>
                        <CheckCheck className="h-4 w-4" />
                        {isPublishing ? "Publishing…" : "Publish Grades"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </motion.div>
      </main>

      {/* Student Detail Dialog */}
      <Dialog open={!!detailStudent} onOpenChange={() => setDetailStudent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailStudent?.studentName}</DialogTitle>
            <DialogDescription>
              AI-generated grade breakdown and feedback
            </DialogDescription>
          </DialogHeader>
          {detailStudent && (
            <div className="space-y-4">
              {/* Rubric breakdown */}
              <div className="space-y-2">
                {detailStudent.rubricScores.map((rs) => {
                  const pct = Math.round((rs.score / rs.maxPoints) * 100);
                  return (
                    <div key={rs.criterion} className="flex items-center justify-between text-sm">
                      <span>{rs.criterion}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="w-24 h-2" />
                        <span className={`font-medium w-16 text-right ${gradeColor(pct)}`}>
                          {rs.score}/{rs.maxPoints}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span className={gradeColor(Math.round((detailStudent.totalScore / detailStudent.maxScore) * 100))}>
                    {detailStudent.totalScore}/{detailStudent.maxScore} ({Math.round((detailStudent.totalScore / detailStudent.maxScore) * 100)}%)
                  </span>
                </div>
              </div>

              {/* AI Feedback */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">AI Feedback</Label>
                <p className="text-sm bg-muted/50 rounded-lg p-3">{detailStudent.aiFeedback}</p>
              </div>

              {/* Teacher Note */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Teacher Note (optional)</Label>
                <Textarea
                  placeholder="Add a personal note for this student…"
                  value={detailStudent.teacherNote}
                  onChange={(e) => {
                    const note = e.target.value;
                    setDetailStudent((prev) => prev ? { ...prev, teacherNote: note } : null);
                    updateTeacherNote(detailStudent.id, note);
                  }}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (detailStudent) {
                  setGrades((prev) =>
                    prev.map((g) => (g.id === detailStudent.id ? { ...g, status: "approved" as const } : g))
                  );
                  toast({ title: `${detailStudent.studentName}'s grade approved` });
                }
                setDetailStudent(null);
              }}
              className="gap-1.5"
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Approve & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchGrading;
