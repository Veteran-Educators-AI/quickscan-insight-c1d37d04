import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { classPeriods } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Brain, LogOut, Save, FileText
} from "lucide-react";

interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
}

const CreateAssignment = () => {
  const { teacherName, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classPeriod, setClassPeriod] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([
    { id: crypto.randomUUID(), name: "", description: "", maxPoints: 10 },
  ]);

  const totalPoints = criteria.reduce((sum, c) => sum + (c.maxPoints || 0), 0);

  const addCriterion = () => {
    setCriteria((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", description: "", maxPoints: 10 },
    ]);
  };

  const removeCriterion = (id: string) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCriterion = (id: string, field: keyof RubricCriterion, value: string | number) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !classPeriod || !dueDate) {
      toast({ title: "Missing fields", description: "Please fill in title, class period, and due date.", variant: "destructive" });
      return;
    }
    if (criteria.some((c) => !c.name)) {
      toast({ title: "Incomplete rubric", description: "Every rubric criterion needs a name.", variant: "destructive" });
      return;
    }
    // Mock save
    toast({ title: "Assignment created", description: `"${title}" saved with ${criteria.length} rubric criteria (${totalPoints} pts).` });
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
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
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Back link */}
          <Button variant="ghost" size="sm" className="gap-1.5 mb-6 -ml-2" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>

          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Create Assignment</h1>
              <p className="text-sm text-muted-foreground">Define the assignment details and rubric criteria for AI grading.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Assignment Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assignment Details</CardTitle>
                <CardDescription>Basic information about the assignment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" placeholder="e.g. Persuasive Essay Draft" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea id="description" placeholder="Describe what students should submit…" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class Period</Label>
                    <Select value={classPeriod} onValueChange={setClassPeriod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {classPeriods.map((cp) => (
                          <SelectItem key={cp.period} value={String(cp.period)}>
                            {cp.name} — {cp.subject}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rubric Builder */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Rubric Builder</CardTitle>
                    <CardDescription>Define the criteria used for AI-assisted grading.</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-sm font-semibold">
                    {totalPoints} pts total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <AnimatePresence initial={false}>
                  {criteria.map((criterion, index) => (
                    <motion.div
                      key={criterion.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {index > 0 && <Separator className="mb-4" />}
                      <div className="flex gap-3">
                        <div className="pt-2 text-muted-foreground hidden sm:block">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Criterion {index + 1}
                            </span>
                            {criteria.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => removeCriterion(criterion.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <div className="grid sm:grid-cols-[1fr_100px] gap-3">
                            <div className="space-y-2">
                              <Input
                                placeholder="Criterion name (e.g. Thesis Statement)"
                                value={criterion.name}
                                onChange={(e) => updateCriterion(criterion.id, "name", e.target.value)}
                              />
                              <Textarea
                                placeholder="Describe what you're looking for…"
                                value={criterion.description}
                                onChange={(e) => updateCriterion(criterion.id, "description", e.target.value)}
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Max Points</Label>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={criterion.maxPoints}
                                onChange={(e) => updateCriterion(criterion.id, "maxPoints", parseInt(e.target.value) || 0)}
                                className="text-center"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <Button type="button" variant="outline" className="w-full gap-1.5 mt-2" onClick={addCriterion}>
                  <Plus className="h-4 w-4" /> Add Criterion
                </Button>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" className="gap-1.5">
                <Save className="h-4 w-4" /> Create Assignment
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
};

export default CreateAssignment;
