// =============================================================================
// BUILD LESSON PACKS
// =============================================================================
// Builds (or rebuilds) the next-day lesson pack for every active class of one
// teacher, straight from the paper/practice results actually received.
// A class with no results gets a calendar-only pack — no invented numbers.
// Called with the teacher's own session (or a service key) and writes into
// lesson_packs, which is what the home page's "Tomorrow's lessons" band reads.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildAssignmentDigests, digestForGenerator, CALL_LABEL, type ScanRow } from "./lib/resultsDigest.ts";
import { verifyItems } from "./lib/verifyMath.ts";
import { buildGrouping } from "./lib/grouping.ts";
import { isoDate, nextSchoolDay, positionFor } from "./lib/pacingCalendars.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANIMALS = [
  "Brave Bear", "Swift Falcon", "Wise Owl", "Gentle Deer", "Clever Fox",
  "Bold Eagle", "Quiet Mouse", "Strong Tiger", "Happy Dolphin", "Quick Rabbit",
  "Curious Cat", "Loyal Dog", "Bright Parrot", "Calm Turtle", "Agile Monkey",
  "Mighty Lion", "Graceful Swan", "Playful Otter", "Patient Panda", "Fearless Hawk",
  "Keen Koala", "Noble Horse", "Spirited Wolf", "Cheerful Penguin", "Steady Elephant",
  "Nimble Squirrel", "Proud Peacock", "Silent Panther", "Friendly Seal", "Daring Jaguar",
  "Clever Crow", "Gentle Giraffe", "Swift Cheetah", "Wise Whale", "Brave Buffalo",
  "Happy Hedgehog", "Calm Crane", "Bold Bobcat", "Kind Kangaroo", "Lively Lemur",
  "Merry Meerkat", "Noble Narwhal", "Perky Puffin", "Quick Quail", "Radiant Raven",
  "Serene Stork", "Trusty Toucan", "Unique Unicorn", "Vibrant Vulture", "Witty Weasel",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/** Pack drafts never carry a real name: code name if Scholar gave one, else an animal. */
function pseudonymiser(pseudonyms: Map<string, string | null>) {
  const used = new Set<string>();
  const cache = new Map<string, string>();
  return (studentId: string): string => {
    if (cache.has(studentId)) return cache.get(studentId)!;
    const custom = pseudonyms.get(studentId);
    let name = custom || ANIMALS[hashCode(studentId) % ANIMALS.length];
    let suffix = 1;
    while (used.has(name)) {
      suffix += 1;
      name = `${custom || ANIMALS[hashCode(studentId) % ANIMALS.length]} ${suffix}`;
    }
    used.add(name);
    cache.set(studentId, name);
    return name;
  };
}

function whatThisFixes(digest: any): string {
  const reteach = digest.items.filter((i: any) => i.call === "reteach");
  const shaky = digest.items.filter((i: any) => i.call === "shaky");
  const topTag = digest.tags[0];
  if (reteach.length > 0) {
    return `Repairs item${reteach.length === 1 ? "" : "s"} ${reteach
      .map((i: any) => `${i.itemNumber} (${i.percentCorrect}%)`)
      .join(", ")} from ${digest.worksheetTitle}${
      topTag ? ` — ${topTag.tag} hit ${topTag.studentCount} student${topTag.studentCount === 1 ? "" : "s"}` : ""
    }.`;
  }
  if (shaky.length > 0) {
    return `No item fell below 40%; tightens the shaky ones — item${shaky.length === 1 ? "" : "s"} ${shaky
      .map((i: any) => `${i.itemNumber} (${i.percentCorrect}%)`)
      .join(", ")} from ${digest.worksheetTitle}.`;
  }
  const first = digest.items[0];
  return first
    ? `${digest.worksheetTitle}: every item ${CALL_LABEL[first.call as keyof typeof CALL_LABEL].toLowerCase()} — the pack moves the class on.`
    : `Built from ${digest.worksheetTitle}.`;
}

const mapItem = (i: any, index: number, isExit: boolean) => ({
  itemNumber: Number(i.itemNumber ?? index + 1),
  prompt: String(i.prompt || ""),
  answer: String(i.answer ?? i.answerNumeric ?? ""),
  answerNumeric: typeof i.answerNumeric === "number" ? i.answerNumeric : Number(i.answerNumeric) || null,
  verify: String(i.verify || ""),
  verifyExpected: typeof i.verifyExpected === "number" ? i.verifyExpected : Number(i.verifyExpected) || null,
  skillTag: i.skillTag || null,
  isRepair: isExit ? false : !!i.isRepair,
  errorTagIfWrong: String(i.errorTagIfWrong || ""),
  workedSolution: i.workedSolution || "",
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    let teacherId: string | null = body.teacher_id || null;

    // Prefer the caller's own session when one is supplied.
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data?.user?.id) teacherId = data.user.id;
    }
    if (!teacherId) {
      return new Response(JSON.stringify({ error: "No teacher identified" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const packDate: string = body.pack_date || isoDate(nextSchoolDay(new Date()));
    const onlyClassIds: string[] | null = Array.isArray(body.class_ids) && body.class_ids.length ? body.class_ids : null;
    const onlyWorksheetCode: string | null = body.worksheet_code || null;

    const { data: classRows, error: classError } = await admin
      .from("classes")
      .select("id, name, join_code, class_period")
      .eq("teacher_id", teacherId)
      .is("archived_at", null);
    if (classError) throw classError;

    const classes = (classRows || []).filter((c: any) => !onlyClassIds || onlyClassIds.includes(c.id));
    const report: any[] = [];

    for (const klass of classes) {
      const position = positionFor(klass.join_code, klass.name, packDate);
      const dayNumber = position.dayNumber;
      const lessonTitle = position.title || `${position.unitLabel || klass.name} — next lesson`;

      const upsert = (patch: Record<string, unknown>) =>
        admin
          .from("lesson_packs")
          .upsert(
            { teacher_id: teacherId, class_id: klass.id, pack_date: packDate, ...patch },
            { onConflict: "teacher_id,class_id,pack_date" }
          )
          .select("id, status")
          .single();

      try {
        await upsert({ status: "generating", day_number: dayNumber, lesson_title: lessonTitle, error_message: null });

        const [{ data: scanRows, error: scanError }, { data: rosterRows, error: rosterError }] = await Promise.all([
          admin
            .from("paper_scan_results")
            .select("*, students:student_id(id, first_name, last_name, email)")
            .eq("class_id", klass.id)
            .order("scanned_at", { ascending: false }),
          admin
            .from("students")
            .select("id, first_name, last_name, custom_pseudonym, archived_at")
            .eq("class_id", klass.id),
        ]);
        if (scanError) throw scanError;
        if (rosterError) throw rosterError;

        const pseudonyms = new Map<string, string | null>(
          (rosterRows || []).map((s: any) => [s.id, s.custom_pseudonym || null])
        );
        const displayName = pseudonymiser(pseudonyms);
        const getDisplayName = (studentId: string) => displayName(studentId);

        const rows = (scanRows || []) as unknown as ScanRow[];
        const digests = rows.length ? buildAssignmentDigests(rows, getDisplayName as any) : [];
        const usable = digests.filter((d) => d.items.length > 0);
        const digest = onlyWorksheetCode
          ? usable.find((d) => d.worksheetCode === onlyWorksheetCode) || usable[0]
          : usable[0];

        if (!digest) {
          await upsert({
            status: "calendar_only",
            day_number: dayNumber,
            lesson_title: lessonTitle,
            papers: 0,
            student_count: 0,
            what_this_fixes: null,
            draft: null,
            source_worksheet_code: null,
            source_worksheet_title: null,
            source_worksheet_date: null,
          });
          report.push({ class: klass.name, join_code: klass.join_code, status: "calendar_only" });
          continue;
        }

        const dateLabel = new Date(`${packDate}T12:00:00`).toDateString();
        const lessonRes = await fetch(`${url}/functions/v1/generate-next-day-lesson`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            digest: digestForGenerator(digest),
            classContext: {
              className: klass.name,
              subject: position.courseLabel || "Mathematics",
              unit: `${position.unitLabel || ""}${dayNumber ? ` — Day ${dayNumber}` : ""}`.trim(),
              standards: position.standards,
              nextLessonTitle: lessonTitle,
              nextLessonDate: dateLabel,
            },
          }),
        });
        const lessonJson = await lessonRes.json();
        if (!lessonRes.ok || lessonJson?.error) throw new Error(lessonJson?.error || `generator ${lessonRes.status}`);
        const generated = lessonJson.draft;

        // Nothing whose answer failed its own arithmetic check ever reaches a pack.
        const worksheetItems = verifyItems(
          (generated.worksheet?.items || []).map((i: any, x: number) => mapItem(i, x, false))
        ).filter((i: any) => i.verified);
        const exitItems = verifyItems(
          (generated.exitTicket?.items || []).map((i: any, x: number) => mapItem(i, x, true))
        ).filter((i: any) => i.verified);

        const roster = (rosterRows || [])
          .filter((s: any) => !s.archived_at)
          .map((s: any) => ({
            id: s.id,
            name: displayName(s.id),
            realName: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
          }));

        const draft = {
          classId: klass.id,
          className: klass.name,
          builtFrom: {
            className: klass.name,
            worksheetCode: digest.worksheetCode,
            worksheetTitle: digest.worksheetTitle,
            worksheetDate: digest.worksheetDate,
            papers: digest.papers,
            studentCount: digest.studentCount,
            generatedAt: new Date().toISOString(),
          },
          lessonPlan: {
            title: generated.lessonPlan?.title || lessonTitle,
            aim: generated.lessonPlan?.aim || "",
            objective: generated.lessonPlan?.objective || "",
            standards: generated.lessonPlan?.standards || position.standards,
            durationMinutes: Number(generated.lessonPlan?.durationMinutes) || 45,
            builtFrom: generated.lessonPlan?.builtFrom || "",
            timeline: generated.lessonPlan?.timeline || [],
            reteach: {
              summary: generated.lessonPlan?.reteach?.summary || "",
              items: generated.lessonPlan?.reteach?.items || [],
              script: generated.lessonPlan?.reteach?.script || [],
            },
            materials: generated.lessonPlan?.materials || [],
            differentiationNotes: generated.lessonPlan?.differentiationNotes || [],
            assessmentNote: generated.lessonPlan?.assessmentNote || "",
          },
          slides: (generated.slides || []).map((s: any, index: number) => ({
            slideNumber: Number(s.slideNumber ?? index + 1),
            kind: s.kind || "teaching",
            title: String(s.title || ""),
            bullets: Array.isArray(s.bullets) ? s.bullets.map((b: any) => String(b)) : [],
            speakerNotes: String(s.speakerNotes || ""),
          })),
          worksheet: {
            title: generated.worksheet?.title || lessonTitle,
            instructions: generated.worksheet?.instructions || "",
            items: worksheetItems,
          },
          exitTicket: { title: generated.exitTicket?.title || "Exit ticket", items: exitItems },
          grouping: buildGrouping(digest, worksheetItems, roster),
          nextLessonTitle: lessonTitle,
          nextLessonDate: dateLabel,
          dayNumber,
        };

        await upsert({
          status: "ready",
          day_number: dayNumber,
          lesson_title: lessonTitle,
          source_worksheet_code: digest.worksheetCode,
          source_worksheet_title: digest.worksheetTitle,
          source_worksheet_date: digest.worksheetDate ? digest.worksheetDate.slice(0, 10) : null,
          papers: digest.papers,
          student_count: digest.studentCount,
          what_this_fixes: whatThisFixes(digest),
          draft,
        });

        report.push({
          class: klass.name,
          join_code: klass.join_code,
          status: "ready",
          worksheet_code: digest.worksheetCode,
          papers: digest.papers,
          students: digest.studentCount,
          average: digest.averageScore,
          items: digest.items.map((i: any) => ({ n: i.itemNumber, pct: i.percentCorrect, call: i.call })),
          reteach: digest.items.filter((i: any) => i.call === "reteach").map((i: any) => i.itemNumber),
          worksheetItems: worksheetItems.length,
          verified: worksheetItems.filter((i: any) => i.verified).length,
          exitItems: exitItems.length,
          groups: draft.grouping.groups.map((g: any) => ({
            label: g.label,
            items: g.itemNumbers,
            checkTotal: g.checkTotal,
            students: g.students.length,
          })),
          noResultsYet: draft.grouping.noResultsYet.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not build the pack";
        await upsert({ status: "failed", day_number: dayNumber, lesson_title: lessonTitle, error_message: message });
        report.push({ class: klass.name, join_code: klass.join_code, status: "failed", error: message });
      }
    }

    return new Response(JSON.stringify({ pack_date: packDate, classes: report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("build-lesson-packs failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
