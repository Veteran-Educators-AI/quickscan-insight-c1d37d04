import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { recentAssignments, classPeriods } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Upload, Brain, LogOut, X, ImageIcon, FileUp, Sparkles, Users, AlertCircle,
} from "lucide-react";

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  studentName: string;
  status: "pending" | "uploading" | "ready";
}

const UploadSubmissions = () => {
  const { teacherName, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assignment = recentAssignments.find((a) => a.id === selectedAssignment);
  const classPeriod = assignment
    ? classPeriods.find((c) => c.period === assignment.classPeriod)
    : null;

  // Generate mock student names for the selected class
  const mockStudents = classPeriod
    ? Array.from({ length: classPeriod.studentCount }, (_, i) => `Student ${i + 1}`)
    : [];

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );

      if (imageFiles.length === 0) {
        toast({
          title: "Invalid files",
          description: "Please upload image files (JPG, PNG, etc.).",
          variant: "destructive",
        });
        return;
      }

      const newUploads: UploadedFile[] = imageFiles.map((file, i) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        studentName: mockStudents[uploadedFiles.length + i] || "",
        status: "ready" as const,
      }));

      setUploadedFiles((prev) => [...prev, ...newUploads]);

      toast({
        title: `${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""} added`,
        description: "Assign each image to a student before submitting.",
      });
    },
    [mockStudents, uploadedFiles.length, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const updateStudentName = (id: string, name: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, studentName: name } : f))
    );
  };

  const handleSubmitForGrading = () => {
    if (!selectedAssignment) {
      toast({ title: "No assignment selected", description: "Please select an assignment first.", variant: "destructive" });
      return;
    }
    if (uploadedFiles.length === 0) {
      toast({ title: "No files uploaded", description: "Upload at least one student paper.", variant: "destructive" });
      return;
    }
    const unassigned = uploadedFiles.filter((f) => !f.studentName);
    if (unassigned.length > 0) {
      toast({ title: "Unassigned papers", description: `${unassigned.length} paper(s) are not assigned to a student.`, variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    // Mock submission
    setTimeout(() => {
      setIsSubmitting(false);
      toast({
        title: "Submissions sent for AI grading",
        description: `${uploadedFiles.length} papers queued for analysis against the rubric.`,
      });
      navigate("/dashboard");
    }, 2000);
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
          <Button variant="ghost" size="sm" className="gap-1.5 mb-6 -ml-2" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>

          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Upload Submissions</h1>
              <p className="text-sm text-muted-foreground">Upload photos of student papers for AI-powered grading.</p>
            </div>
          </div>

          <div className="space-y-8">
            {/* Assignment Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Assignment</CardTitle>
                <CardDescription>Choose which assignment these submissions belong to.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Assignment</Label>
                  <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an assignment…" />
                    </SelectTrigger>
                    <SelectContent>
                      {recentAssignments.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.title} — Period {a.classPeriod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {assignment && classPeriod && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" /> {classPeriod.studentCount} students
                      </Badge>
                      <Badge variant="outline">
                        Due {new Date(assignment.dueDate).toLocaleDateString()}
                      </Badge>
                      <Badge variant="outline">
                        {assignment.submissionCount}/{assignment.totalStudents} submitted
                      </Badge>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>

            {/* Upload Area */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Upload Papers</CardTitle>
                    <CardDescription>Drag & drop or click to upload images of student work.</CardDescription>
                  </div>
                  {uploadedFiles.length > 0 && (
                    <Badge variant="secondary" className="text-sm font-semibold">
                      {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Dropzone */}
                <label
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={handleFileInput}
                  />
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <FileUp className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-medium text-sm">
                    {isDragging ? "Drop images here" : "Click to browse or drag images here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports JPG, PNG, HEIC · Multiple files allowed
                  </p>
                </label>

                {/* Uploaded Files List */}
                <AnimatePresence initial={false}>
                  {uploadedFiles.map((uf, index) => (
                    <motion.div
                      key={uf.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {index > 0 && <Separator className="mb-3" />}
                      <div className="flex gap-3 items-start">
                        {/* Thumbnail */}
                        <div className="h-16 w-16 rounded-lg overflow-hidden border bg-muted shrink-0">
                          <img
                            src={uf.preview}
                            alt={`Upload ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">{uf.file.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {(uf.file.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeFile(uf.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          {/* Student assignment */}
                          <Select
                            value={uf.studentName}
                            onValueChange={(val) => updateStudentName(uf.id, val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign to student…" />
                            </SelectTrigger>
                            <SelectContent>
                              {mockStudents.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Submit */}
            <Card>
              <CardContent className="p-6">
                {uploadedFiles.length === 0 ? (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>Upload student papers above, then assign each to a student before submitting for AI grading.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {uploadedFiles.filter((f) => f.studentName).length} of {uploadedFiles.length} assigned
                      </span>
                      <span className="font-medium">
                        {Math.round(
                          (uploadedFiles.filter((f) => f.studentName).length / uploadedFiles.length) * 100
                        )}%
                      </span>
                    </div>
                    <Progress
                      value={
                        (uploadedFiles.filter((f) => f.studentName).length / uploadedFiles.length) * 100
                      }
                    />
                  </div>
                )}

                {isSubmitting && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                    <div className="flex items-center gap-3 text-sm text-primary">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      <span>Sending papers to AI for analysis…</span>
                    </div>
                    <Progress value={65} className="mt-2" />
                  </motion.div>
                )}

                <div className="flex items-center justify-end gap-3 mt-6">
                  <Button variant="outline" onClick={() => navigate("/dashboard")}>
                    Cancel
                  </Button>
                  <Button
                    className="gap-1.5"
                    onClick={handleSubmitForGrading}
                    disabled={isSubmitting}
                  >
                    <Sparkles className="h-4 w-4" />
                    {isSubmitting ? "Submitting…" : "Submit for AI Grading"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default UploadSubmissions;
