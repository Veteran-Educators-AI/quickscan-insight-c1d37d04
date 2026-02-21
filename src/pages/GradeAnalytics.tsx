import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { classPeriods, recentAssignments } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  ArrowLeft, Brain, LogOut, BarChart3, TrendingUp, Users,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// Mock data generators
const assignmentNames = ["Essay #1", "Quiz #3", "Poetry Analysis", "Vocab Quiz #5", "Character Study", "Persuasive Essay"];

function generateStudentPerformance(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const base = 60 + Math.random() * 25;
    return {
      name: `Student ${i + 1}`,
      assignments: assignmentNames.map((a, j) => ({
        assignment: a,
        score: Math.round(Math.max(40, Math.min(100, base + (Math.random() - 0.4) * 20 + j * 1.5))),
      })),
    };
  });
}

function generateDistribution() {
  return [
    { range: "90-100", count: Math.floor(3 + Math.random() * 6), fill: "hsl(var(--accent))" },
    { range: "80-89", count: Math.floor(5 + Math.random() * 8), fill: "hsl(var(--primary))" },
    { range: "70-79", count: Math.floor(4 + Math.random() * 7), fill: "hsl(var(--primary) / 0.7)" },
    { range: "60-69", count: Math.floor(2 + Math.random() * 5), fill: "hsl(var(--warning))" },
    { range: "Below 60", count: Math.floor(1 + Math.random() * 3), fill: "hsl(var(--destructive))" },
  ];
}

function generateRubricAvg() {
  return [
    { criterion: "Thesis", avg: 70 + Math.round(Math.random() * 20), full: 100 },
    { criterion: "Evidence", avg: 65 + Math.round(Math.random() * 20), full: 100 },
    { criterion: "Organization", avg: 68 + Math.round(Math.random() * 20), full: 100 },
    { criterion: "Grammar", avg: 72 + Math.round(Math.random() * 18), full: 100 },
    { criterion: "Voice", avg: 60 + Math.round(Math.random() * 25), full: 100 },
  ];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

const GradeAnalytics = () => {
  const { teacherName, logout } = useAuth();
  const navigate = useNavigate();

  const [selectedPeriod, setSelectedPeriod] = useState(String(classPeriods[0].period));
  const [selectedAssignment, setSelectedAssignment] = useState("");

  const classPeriod = classPeriods.find((c) => String(c.period) === selectedPeriod);
  const studentCount = classPeriod?.studentCount ?? 20;

  const [students] = useState(() => generateStudentPerformance(studentCount));
  const [distribution] = useState(generateDistribution);
  const [rubricAvg] = useState(generateRubricAvg);

  // Build line chart data: assignments on x-axis, one line per student (show top/bottom/avg)
  const trendData = assignmentNames.map((name) => {
    const scores = students.map((s) => s.assignments.find((a) => a.assignment === name)?.score ?? 0);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    return { assignment: name, avg, max, min };
  });

  // Per-student bar chart (top 15 for readability)
  const studentAvgs = students
    .map((s) => ({
      name: s.name,
      avg: Math.round(s.assignments.reduce((sum, a) => sum + a.score, 0) / s.assignments.length),
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 15);

  const barColor = (avg: number) =>
    avg >= 80 ? "hsl(var(--accent))" : avg >= 65 ? "hsl(var(--primary))" : "hsl(var(--destructive))";

  // Pie chart for pass/fail
  const passCount = students.filter(
    (s) => s.assignments.reduce((sum, a) => sum + a.score, 0) / s.assignments.length >= 65
  ).length;
  const pieData = [
    { name: "Passing (≥65%)", value: passCount },
    { name: "At Risk (<65%)", value: students.length - passCount },
  ];

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
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Grade Analytics</h1>
              <p className="text-sm text-muted-foreground">Track performance trends and identify areas for improvement.</p>
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Class Period</Label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {classPeriods.map((cp) => (
                        <SelectItem key={cp.period} value={String(cp.period)}>
                          {cp.name} — {cp.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Assignment (optional)</Label>
                  <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                    <SelectTrigger><SelectValue placeholder="All assignments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All assignments</SelectItem>
                      {recentAssignments.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Students", value: students.length, icon: Users, color: "text-primary" },
              { label: "Class Avg", value: `${Math.round(studentAvgs.reduce((s, st) => s + st.avg, 0) / studentAvgs.length)}%`, icon: TrendingUp, color: "text-accent" },
              { label: "Highest", value: `${studentAvgs[0]?.avg ?? 0}%`, icon: TrendingUp, color: "text-accent" },
              { label: "At Risk", value: students.length - passCount, icon: BarChart3, color: "text-destructive" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center ${s.color}`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Tabs */}
          <Tabs defaultValue="trends" className="space-y-6">
            <TabsList className="grid grid-cols-4 w-full max-w-md">
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
              <TabsTrigger value="students">Students</TabsTrigger>
              <TabsTrigger value="rubric">Rubric</TabsTrigger>
            </TabsList>

            {/* Performance Trends */}
            <TabsContent value="trends">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Performance Over Time</CardTitle>
                  <CardDescription>Class average, high, and low scores across assignments.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="assignment" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis domain={[30, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: 12,
                          }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="max" stroke="hsl(var(--accent))" name="Highest" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" name="Average" strokeWidth={2.5} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="min" stroke="hsl(var(--destructive))" name="Lowest" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Grade Distribution */}
            <TabsContent value="distribution">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Grade Distribution</CardTitle>
                    <CardDescription>Number of students in each grade range.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={distribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Students">
                            {distribution.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pass / At Risk</CardTitle>
                    <CardDescription>Students above or below 65% threshold.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={4}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            <Cell fill="hsl(var(--accent))" />
                            <Cell fill="hsl(var(--destructive))" />
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Per-Student Performance */}
            <TabsContent value="students">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Student Averages (Top 15)</CardTitle>
                  <CardDescription>Average score across all assignments, ranked highest to lowest.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={studentAvgs} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={75} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: 12,
                          }}
                          formatter={(value: number) => [`${value}%`, "Average"]}
                        />
                        <Bar dataKey="avg" radius={[0, 6, 6, 0]} name="Average">
                          {studentAvgs.map((s, i) => (
                            <Cell key={i} fill={barColor(s.avg)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rubric Criteria Analysis */}
            <TabsContent value="rubric">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Rubric Criteria Averages</CardTitle>
                    <CardDescription>Identify weak areas across the class.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rubricAvg} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="criterion" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: 12,
                            }}
                            formatter={(value: number) => [`${value}%`, "Class Avg"]}
                          />
                          <Bar dataKey="avg" radius={[6, 6, 0, 0]} name="Class Average">
                            {rubricAvg.map((r, i) => (
                              <Cell key={i} fill={barColor(r.avg)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Rubric Radar</CardTitle>
                    <CardDescription>Class strengths and weaknesses at a glance.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={rubricAvg} cx="50%" cy="50%" outerRadius="75%">
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                          <Radar
                            name="Class Avg"
                            dataKey="avg"
                            stroke="hsl(var(--primary))"
                            fill="hsl(var(--primary) / 0.2)"
                            strokeWidth={2}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: 12,
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

export default GradeAnalytics;
