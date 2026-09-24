import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RefreshCw, Download, Presentation, Printer, Timer, AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

const db = supabase as any;

type Unit = any; type Lesson = any; type LessonFile = any;

const preview = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
const download = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`;

function chipClass(status?: string) {
  const s = (status || 'PENDING').toUpperCase();
  if (s === 'OPEN' || s === 'CLEAR') return 'bg-emerald-600 text-white border-transparent';
  if (s === 'RETEACH') return 'bg-destructive text-destructive-foreground border-transparent';
  if (s === 'SKIP') return 'bg-muted text-muted-foreground';
  return 'bg-amber-500 text-white border-transparent';
}

function classCodeFor(unit: Unit, period: string) {
  const n = period.replace(/\D/g, '');
  return /stat/i.test(unit.course) ? `STATS${n}` : `ALG2P${n}`;
}

/** Per-question % correct among those who attempted — blanks excluded. */
export function gateFromStats(stats: Record<string, { correct: number; attempted: number }>) {
  const qs = Object.entries(stats).filter(([, v]) => v.attempted > 0);
  if (!qs.length) return null;
  const pcts = qs.map(([q, v]) => ({ q, pct: Math.round((v.correct / v.attempted) * 100) }));
  const under40 = pcts.filter((p) => p.pct < 40).length;
  const under60 = pcts.filter((p) => p.pct < 60).length;
  return {
    status: under40 === 0 && under60 <= 1 ? 'OPEN' : 'RETEACH',
    evidence: pcts.map((p) => `${p.q} ${p.pct}%`).join(', '),
  };
}

function useUnitData(courseSlug?: string, unitSlug?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lessons-unit', courseSlug, unitSlug, user?.id],
    enabled: !!user && !!courseSlug && !!unitSlug,
    queryFn: async () => {
      const { data: unit } = await db.from('units').select('*').eq('course_slug', courseSlug).eq('unit_slug', unitSlug).maybeSingle();
      if (!unit) return { unit: null, lessons: [], files: [], placements: [], overrides: [], tallies: [], scans: [], flagsResolved: [], classes: [] };
      const { data: lessons } = await db.from('lessons').select('*').eq('unit_id', unit.id).order('sort_order');
      const ids = (lessons || []).map((l: Lesson) => l.id);
      const [files, placements, overrides, tallies, flags, classes] = await Promise.all([
        ids.length ? db.from('lesson_files').select('*').in('lesson_id', ids) : { data: [] },
        db.from('placements').select('*').eq('unit_id', unit.id).order('student_name'),
        ids.length ? db.from('gate_overrides').select('*').in('lesson_id', ids).order('created_at', { ascending: false }) : { data: [] },
        ids.length ? db.from('exit_ticket_tallies').select('*').in('lesson_id', ids) : { data: [] },
        db.from('roster_flag_resolutions').select('*').eq('unit_id', unit.id),
        db.from('classes').select('id, join_code').eq('teacher_id', unit.teacher_id),
      ]);
      const codes = (lessons || []).map((l: Lesson) => l.manifest?.exit_ticket_code || l.lesson_key);
      const { data: scans } = codes.length
        ? await db.from('paper_scan_results').select('ticket_code, class_id, item_marks').in('ticket_code', codes)
        : { data: [] };
      return { unit, lessons: lessons || [], files: files.data || [], placements: placements.data || [], overrides: overrides.data || [], tallies: tallies.data || [], scans: scans || [], flagsResolved: flags.data || [], classes: classes.data || [] };
    },
  });
}

export default function Lessons() {
  const { courseSlug, unitSlug, lessonId } = useParams();
  const { userRole } = useAuth() as any;
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useUnitData(courseSlug, unitSlug);
  const [syncing, setSyncing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [period, setPeriod] = useState<string>('');

  const unit = data?.unit;
  const periods: string[] = unit?.periods?.length ? unit.periods : ['P2', 'P7', 'P8'];
  const activePeriod = period || periods[0];

  // Gate per lesson per period: override > scored tickets/tallies > manifest seed
  const gates = useMemo(() => {
    const out: Record<string, Record<string, { status: string; evidence: string; source: string }>> = {};
    if (!data?.unit) return out;
    const lessons: Lesson[] = data.lessons;
    lessons.forEach((l, idx) => {
      out[l.id] = {};
      const prev = [...lessons.slice(0, idx)].reverse().find((p) => p.type !== 'reteach');
      for (const p of periods) {
        const ov = data.overrides.find((o: any) => o.lesson_id === l.id && o.period === p);
        if (ov) { out[l.id][p] = { status: ov.status, evidence: ov.note || 'Teacher override', source: 'override' }; continue; }
        let computed = null as ReturnType<typeof gateFromStats>;
        if (prev) {
          const code = prev.manifest?.exit_ticket_code || prev.lesson_key;
          const cls = data.classes.find((c: any) => c.join_code === classCodeFor(data.unit, p));
          const stats: Record<string, { correct: number; attempted: number }> = {};
          data.scans.filter((s: any) => s.ticket_code === code && s.class_id === cls?.id).forEach((s: any) => {
            const marks = Array.isArray(s.item_marks) ? s.item_marks[0] || {} : s.item_marks || {};
            Object.entries(marks).forEach(([q, m]) => {
              stats[q] ||= { correct: 0, attempted: 0 };
              if (m === null || m === undefined) return;
              stats[q].attempted++;
              if (Number(m) === 1) stats[q].correct++;
            });
          });
          data.tallies.filter((t: any) => t.lesson_id === prev.id && t.period === p).forEach((t: any) => {
            stats[t.question] ||= { correct: 0, attempted: 0 };
            stats[t.question].attempted += t.correct + t.half + t.wrong;
            stats[t.question].correct += t.correct;
          });
          computed = gateFromStats(stats);
        }
        if (computed && l.type === 'reteach') computed = { status: computed.status === 'OPEN' ? 'CLEAR' : 'RETEACH', evidence: computed.evidence };
        out[l.id][p] = computed
          ? { ...computed, source: 'scored' }
          : { status: l.gate_status?.[p] || 'PENDING', evidence: l.gate_evidence?.[p] || 'Gate not yet checked', source: 'seed' };
      }
    });
    return out;
  }, [data, periods.join(',')]);

  if (userRole === 'student') return <Navigate to="/student/dashboard" replace />;

  const sync = async () => {
    setSyncing(true);
    const { data: res, error } = await supabase.functions.invoke('drive-sync', { body: { unit_id: unit?.id } });
    setSyncing(false);
    const r = res?.reports?.[0];
    if (error || !r) toast({ title: 'Sync failed', description: error?.message || 'No response', variant: 'destructive' });
    else toast({ title: r.status === 'ok' ? 'Synced from Drive' : 'Drive checked', description: r.status === 'ok' ? `${r.lessons} lessons · ${r.files_resolved} files found · ${r.files_missing} not in Drive yet` : r.message });
    qc.invalidateQueries({ queryKey: ['lessons-unit'] });
  };

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground">Loading lessons…</div></AppLayout>;
  if (!unit) return <AppLayout><div className="p-8">This unit has not been set up yet.</div></AppLayout>;

  const lessons: Lesson[] = data!.lessons;
  const today = new Date().toISOString().slice(0, 10);
  const isDone = (l: Lesson) => !!l.taught_at || (!!(l.date_confirmed || l.date_proposed) && (l.date_confirmed || l.date_proposed) < today);
  const upcoming = lessons.filter((l) => !isDone(l));
  const done = lessons.filter(isDone);
  const next = upcoming.find((l) => l.type !== 'reteach') || upcoming[0];
  const selected = lessons.find((l) => l.lesson_key === lessonId || l.id === lessonId) || next;
  const base = `/lessons/${courseSlug}/${unitSlug}`;

  const retechingFor = (l: Lesson, idx: number) => {
    // next day greyed "after reteach" when the reteach before it is RETEACH for the active period
    const prev = lessons[lessons.indexOf(l) - 1];
    return prev?.type === 'reteach' && gates[prev.id]?.[activePeriod]?.status === 'RETEACH';
  };

  const Row = ({ l, i }: { l: Lesson; i: number }) => (
    <button
      onClick={() => navigate(`${base}/${encodeURIComponent(l.lesson_key)}`)}
      className={cn('w-full text-left rounded-md border p-2 mb-1.5 transition-colors',
        l.type === 'reteach' && 'ml-4 w-[calc(100%-1rem)] border-dashed',
        selected?.id === l.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
        next?.id === l.id && 'ring-2 ring-primary/40',
        l.type === 'reteach' && gates[l.id]?.[activePeriod]?.status === 'RETEACH' && 'bg-destructive/10',
        retechingFor(l, i) && 'opacity-50')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{l.label}{l.course_day ? '' : ''}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {!l.date_confirmed && <span title="unconfirmed" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
          {l.date_confirmed || l.date_proposed || '—'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground truncate">{l.course_day ? `Day ${l.course_day} · ` : ''}{l.title}</div>
      {l.type === 'reteach' && <Badge variant="outline" className="mt-1 text-[10px]">Reteach — run only if gate says so</Badge>}
      {retechingFor(l, i) && <div className="text-[10px] text-destructive mt-0.5">after reteach ({activePeriod})</div>}
      <div className="flex gap-1 mt-1">
        {periods.map((p) => <Badge key={p} className={cn('text-[10px] px-1.5 py-0', chipClass(gates[l.id]?.[p]?.status))}>{p} {gates[l.id]?.[p]?.status}</Badge>)}
      </div>
    </button>
  );

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Lessons · {unit.course}</div>
            <h1 className="text-2xl font-bold">{unit.title}</h1>
            <div className="text-xs text-muted-foreground">
              {unit.last_synced_at ? `Last Drive sync ${new Date(unit.last_synced_at).toLocaleString()}` : 'Never synced'}
              {unit.last_sync_report?.message ? ` · ${unit.last_sync_report.message}` : ''}
            </div>
          </div>
          <Button onClick={sync} disabled={syncing}><RefreshCw className={cn('h-4 w-4 mr-2', syncing && 'animate-spin')} />Sync from Drive</Button>
        </div>

        {lessons.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Not in Drive yet: {unit.manifest_name}</p>
            <p className="text-sm text-muted-foreground mt-1">Lessons appear here as soon as the manifest lands in the Drive folder. The folder is checked every 30 minutes, or press Sync from Drive.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <aside>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Upcoming</div>
              {upcoming.map((l, i) => <Row key={l.id} l={l} i={i} />)}
              {done.length > 0 && (
                <>
                  <button className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground mt-3 mb-2" onClick={() => setShowDone(!showDone)}>
                    {showDone ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Done ({done.length})
                  </button>
                  {showDone && done.map((l, i) => <Row key={l.id} l={l} i={i} />)}
                </>
              )}
            </aside>
            {selected && (
              <LessonView
                unit={unit} lesson={selected} data={data} periods={periods} period={activePeriod} setPeriod={setPeriod}
                gate={gates[selected.id] || {}} onChanged={() => qc.invalidateQueries({ queryKey: ['lessons-unit'] })}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function FileFrame({ file, expected, height = 560 }: { file?: LessonFile; expected: string; height?: number }) {
  if (!file?.drive_file_id) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Not in Drive yet: <code>{file?.relative_path || expected}</code></div>;
  }
  return (
    <div className="space-y-2">
      <iframe title={file.relative_path} src={preview(file.drive_file_id)} className="w-full rounded-md border bg-background" style={{ height }} allow="autoplay" />
      <a className="text-xs text-muted-foreground underline" href={download(file.drive_file_id)} target="_blank" rel="noreferrer">Download {file.relative_path.split('/').pop()}</a>
    </div>
  );
}

function FileButton({ file, label, icon: Icon = Download }: { file?: LessonFile; label: string; icon?: any }) {
  if (!file?.drive_file_id) return <Button variant="outline" size="sm" disabled title={file ? `Not in Drive yet: ${file.relative_path}` : 'Not in Drive yet'}>{label} — not in Drive yet</Button>;
  return <Button variant="outline" size="sm" asChild><a href={download(file.drive_file_id)} target="_blank" rel="noreferrer"><Icon className="h-4 w-4 mr-1" />{label}</a></Button>;
}

function TalkTimer() {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const t = useRef<number>();
  useEffect(() => { if (start) { t.current = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t.current); } }, [start]);
  const secs = start ? Math.floor((now - start) / 1000) : 0;
  const over = secs >= 600;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0'); const ss = String(secs % 60).padStart(2, '0');
  return (
    <Button variant={over ? 'destructive' : 'secondary'} size="sm" onClick={() => setStart(start ? null : Date.now())}>
      <Timer className="h-4 w-4 mr-1" />{start ? `Talk ${mm}:${ss}${over ? ' — stop talking' : ''}` : 'Start 10-min talk timer'}
    </Button>
  );
}

function LessonView({ unit, lesson, data, periods, period, setPeriod, gate, onChanged }: any) {
  const { user } = useAuth();
  const { toast } = useToast();
  const files: LessonFile[] = data.files.filter((f: LessonFile) => f.lesson_id === lesson.id);
  const f = (role: string, format: string) => files.find((x) => x.role === role && x.format === format);
  const [date, setDate] = useState(lesson.date_confirmed || lesson.date_proposed || '');
  useEffect(() => setDate(lesson.date_confirmed || lesson.date_proposed || ''), [lesson.id]);
  const [ovStatus, setOvStatus] = useState<Record<string, string>>({});
  const [ovNote, setOvNote] = useState<Record<string, string>>({});
  const n = period.replace(/\D/g, '');
  const sets: Record<string, number[]> = unit.sets || {};
  const timing: any[] = unit.lesson_timing || [];
  const placements = data.placements.filter((p: any) => p.period === period);

  const confirmDate = async () => {
    await db.from('lessons').update({ date_confirmed: date || null, date_edited_at: new Date().toISOString() }).eq('id', lesson.id);
    toast({ title: 'Date confirmed', description: date }); onChanged();
  };
  const override = async (p: string) => {
    const status = ovStatus[p]; if (!status) return;
    await db.from('gate_overrides').insert({ lesson_id: lesson.id, teacher_id: user!.id, period: p, status, note: ovNote[p] || null });
    await db.from('lessons').update({ gate_status: { ...(lesson.gate_status || {}), [p]: status }, gate_edited_at: new Date().toISOString() }).eq('id', lesson.id);
    toast({ title: `${p} set to ${status}`, description: 'Logged.' }); onChanged();
  };
  const printDay = () => {
    const size = placements.length || 0;
    const plan = [
      { file: f('worksheet', 'pdf'), label: `Worksheet ×${size} (duplex)` },
      { file: f('exit_tickets', 'pdf'), label: `Exit tickets ×${Math.ceil(size / 2)} pages (single-sided)` },
      { file: f(`who_does_what_P${n}`, 'pdf'), label: 'Who-does-what teacher list ×1 (single-sided)' },
    ];
    const missing = plan.filter((p) => !p.file?.drive_file_id);
    plan.forEach((p) => p.file?.drive_file_id && window.open(preview(p.file.drive_file_id), '_blank'));
    toast({ title: `Print the day — Period ${n}`, description: plan.map((p) => `${p.file?.drive_file_id ? '✓' : '✗ not in Drive yet:'} ${p.label}`).join(' · ') + (missing.length ? '' : ' — print each tab in this order.') });
  };

  const flags = [
    ...placements.filter((p: any) => p.flag).map((p: any) => ({ key: `${p.period}:${p.student_name}`, text: `${p.student_name} — ${p.flag}` })),
  ].filter((fl) => !data.flagsResolved.some((r: any) => r.flag_key === fl.key));
  const resolveFlag = async (key: string) => {
    await db.from('roster_flag_resolutions').insert({ unit_id: unit.id, teacher_id: user!.id, flag_key: key });
    onChanged();
  };

  const [tally, setTally] = useState<Record<string, { correct: number; half: number; wrong: number; blank: number }>>({});
  const questions: any[] = lesson.exit_ticket_questions || [];
  const saveTally = async () => {
    const rows = Object.entries(tally).map(([question, v]) => ({ lesson_id: lesson.id, teacher_id: user!.id, period, question, ...v }));
    if (!rows.length) return;
    await db.from('exit_ticket_tallies').insert(rows);
    toast({ title: 'Tally saved', description: 'It now feeds the next lesson\'s gate.' }); onChanged(); setTally({});
  };

  return (
    <section className="space-y-4 min-w-0">
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{lesson.label}{lesson.course_day ? ` · Course day ${lesson.course_day}` : ''} · {lesson.type}</div>
            <h2 className="text-xl font-bold">{lesson.title}</h2>
            {lesson.standards?.length > 0 && <div className="text-xs text-muted-foreground">{lesson.standards.join(' · ')}</div>}
            {lesson.aim && <p className="text-sm mt-1"><b>Aim:</b> {lesson.aim}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button size="sm" variant={lesson.date_confirmed ? 'outline' : 'default'} onClick={confirmDate}>{lesson.date_confirmed ? 'Update date' : 'Confirm date'}</Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{lesson.gate_rule || unit.gate_rule}</div>
        <div className="grid gap-2 md:grid-cols-3">
          {periods.map((p: string) => (
            <div key={p} className="rounded border p-2 space-y-1">
              <div className="flex items-center justify-between">
                <Badge className={chipClass(gate[p]?.status)}>{p} {gate[p]?.status}</Badge>
                <span className="text-[10px] text-muted-foreground">{gate[p]?.source === 'scored' ? 'from scored tickets' : gate[p]?.source === 'override' ? 'teacher override' : 'manifest seed'}</span>
              </div>
              <div className="text-xs">{gate[p]?.evidence}</div>
              {gate[p]?.status === 'PENDING' && <div className="text-[10px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />gate not yet checked</div>}
              <div className="flex gap-1">
                <select className="text-xs border rounded px-1 bg-background" value={ovStatus[p] || ''} onChange={(e) => setOvStatus({ ...ovStatus, [p]: e.target.value })}>
                  <option value="">Override…</option><option>OPEN</option><option>RETEACH</option><option>SKIP</option>
                </select>
                <Input className="h-7 text-xs" placeholder="note" value={ovNote[p] || ''} onChange={(e) => setOvNote({ ...ovNote, [p]: e.target.value })} />
                <Button size="sm" className="h-7" variant="outline" onClick={() => override(p)} disabled={!ovStatus[p]}>Save</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">Period</span>
          {periods.map((p: string) => <Button key={p} size="sm" variant={p === period ? 'default' : 'outline'} onClick={() => setPeriod(p)}>{p.replace('P', '')}</Button>)}
          <Button size="sm" variant="secondary" onClick={printDay}><Printer className="h-4 w-4 mr-1" />Print the day</Button>
        </div>
      </div>

      <Tabs defaultValue="teach">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="teach">Teach (PowerPoint)</TabsTrigger>
          <TabsTrigger value="who">Who does what (PowerPoint)</TabsTrigger>
          <TabsTrigger value="worksheet">Worksheet</TabsTrigger>
          <TabsTrigger value="exit">Exit tickets</TabsTrigger>
          <TabsTrigger value="solutions">Solutions (teacher only)</TabsTrigger>
        </TabsList>

        <TabsContent value="teach" className="space-y-3">
          <div className="flex w-full overflow-hidden rounded-md border text-xs">
            {timing.map((t, i) => <div key={i} className="px-2 py-1.5 border-r last:border-r-0 bg-muted/40" style={{ flex: t.minutes }}>{t.label} · {t.minutes}</div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <FileButton file={f('lesson_deck', 'pptx')} label="Open in PowerPoint (.pptx)" />
            {f('lesson_deck', 'pdf')?.drive_file_id
              ? <Button size="sm" asChild><a href={preview(f('lesson_deck', 'pdf')!.drive_file_id)} target="_blank" rel="noreferrer"><Presentation className="h-4 w-4 mr-1" />Present</a></Button>
              : <Button size="sm" disabled>Present</Button>}
            <TalkTimer />
          </div>
          <FileFrame file={f('lesson_deck', 'pdf')} expected="files.lesson_deck.pdf" height={620} />
        </TabsContent>

        <TabsContent value="who" className="space-y-3">
          {flags.length > 0 && (
            <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
              {flags.map((fl) => (
                <div key={fl.key} className="flex items-center justify-between text-sm">
                  <span>⚑ {fl.text}</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => resolveFlag(fl.key)}>Resolve</Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 xl:grid-cols-2">
            <div><div className="text-sm font-medium mb-1">Board deck — Period {n}</div><FileFrame file={f(`who_does_what_deck_P${n}`, 'pdf')} expected={`files.who_does_what_deck_P${n}.pdf`} height={420} /><div className="mt-1"><FileButton file={f(`who_does_what_deck_P${n}`, 'pptx')} label=".pptx" /></div></div>
            <div><div className="text-sm font-medium mb-1">Teacher list — Period {n}</div><FileFrame file={f(`who_does_what_P${n}`, 'pdf')} expected={`files.who_does_what_P${n}.pdf`} height={420} /></div>
          </div>
          <table className="w-full text-sm border rounded-md">
            <thead className="bg-muted/50"><tr><th className="text-left p-2">Student</th><th className="p-2">Set</th><th className="p-2">Items</th><th className="p-2">Check total</th><th className="text-left p-2">Why</th><th className="text-left p-2">⚑</th></tr></thead>
            <tbody>
              {placements.length === 0 && <tr><td colSpan={6} className="p-3 text-muted-foreground">No placements for Period {n} yet — they come from the manifest.</td></tr>}
              {placements.map((p: any) => {
                const items = lesson.everyone_all_items ? 'all' : (sets[String(p.set_number)] || []).join(', ');
                const total = lesson.check_totals?.[String(p.set_number)] ?? lesson.check_totals?.[`Set ${p.set_number}`];
                return (
                  <tr key={p.id} className={cn('border-t', p.flag && 'bg-amber-50 dark:bg-amber-950/30')}>
                    <td className="p-2">{p.student_name}</td><td className="p-2 text-center">{p.set_number ?? '—'}</td>
                    <td className="p-2 text-center">{items || '—'}</td><td className="p-2 text-center">{lesson.everyone_all_items ? '—' : total ?? '—'}</td>
                    <td className="p-2">{p.why}</td><td className="p-2">{p.flag}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="worksheet" className="space-y-3">
          <div className="flex gap-2">
            {f('worksheet', 'pdf')?.drive_file_id ? <Button size="sm" asChild><a href={preview(f('worksheet', 'pdf')!.drive_file_id)} target="_blank" rel="noreferrer"><Printer className="h-4 w-4 mr-1" />Print (duplex)</a></Button> : <Button size="sm" disabled>Print (duplex)</Button>}
            <FileButton file={f('worksheet', 'docx')} label=".docx" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {lesson.everyone_all_items ? <div className="rounded border p-2">Everyone works all items today.</div> :
              Object.entries(sets).map(([s, items]) => <div key={s} className="rounded border p-2">Set {s}: items {(items as number[]).join(', ')} · check total <b>{lesson.check_totals?.[s] ?? lesson.check_totals?.[`Set ${s}`] ?? '—'}</b></div>)}
          </div>
          {lesson.strip_excludes?.length > 0 && <p className="text-xs text-muted-foreground">Items {lesson.strip_excludes.join(', ')} have no strip number.</p>}
          <FileFrame file={f('worksheet', 'pdf')} expected="files.worksheet.pdf" />
          {f('quiz', 'pdf') && <><div className="text-sm font-medium">Quiz</div><FileFrame file={f('quiz', 'pdf')} expected="files.quiz.pdf" /></>}
        </TabsContent>

        <TabsContent value="exit" className="space-y-3">
          {f('exit_tickets', 'pdf')?.drive_file_id ? <Button size="sm" asChild><a href={preview(f('exit_tickets', 'pdf')!.drive_file_id)} target="_blank" rel="noreferrer"><Printer className="h-4 w-4 mr-1" />Print (single-sided)</a></Button> : null}
          <FileFrame file={f('exit_tickets', 'pdf')} expected="files.exit_tickets.pdf" height={460} />
          {questions.length > 0 && <ol className="list-decimal pl-6 text-sm space-y-1">{questions.map((q, i) => <li key={i}>{typeof q === 'string' ? q : q.text || q.prompt || JSON.stringify(q)}</li>)}</ol>}
          <div className="rounded-md border p-3 flex items-center justify-between">
            <div className="text-sm">Score this exit ticket — scanned results attach to this lesson and set the next lesson's gate.</div>
            <Button size="sm" asChild><Link to={`/scan?lesson=${encodeURIComponent(lesson.manifest?.exit_ticket_code || lesson.lesson_key)}`}><ExternalLink className="h-4 w-4 mr-1" />Score this exit ticket</Link></Button>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium text-sm">Exit-ticket tally — Period {n}</div>
            {(questions.length ? questions : ['Q1', 'Q2', 'Q3']).map((q: any, i: number) => {
              const key = `Q${i + 1}`; const v = tally[key] || { correct: 0, half: 0, wrong: 0, blank: 0 };
              const att = v.correct + v.half + v.wrong;
              return (
                <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-8 font-semibold">{key}</span>
                  {(['correct', 'half', 'wrong', 'blank'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1 text-xs">{k}<Input type="number" min={0} className="h-7 w-16" value={v[k]} onChange={(e) => setTally({ ...tally, [key]: { ...v, [k]: Math.max(0, Number(e.target.value) || 0) } })} /></label>
                  ))}
                  <span className="text-xs text-muted-foreground">{att ? `${Math.round((v.correct / att) * 100)}% of attempted` : 'no attempts'}</span>
                </div>
              );
            })}
            <Button size="sm" onClick={saveTally} disabled={!Object.keys(tally).length}>Save tally</Button>
          </div>
        </TabsContent>

        <TabsContent value="solutions">
          <FileFrame file={f('solutions', 'pdf')} expected="files.solutions.pdf" />
        </TabsContent>
      </Tabs>
    </section>
  );
}
