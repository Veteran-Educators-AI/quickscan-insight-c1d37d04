// drive-sync — reads a public Google Drive unit folder and its manifest,
// then upserts units / lessons / lesson_files / placements.
// File IDs are never stored as configuration: every manifest path is resolved
// against a fresh listing of the folder on each run.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Entry = { fileId: string; mimeType: string; isFolder: boolean; modifiedTime: string | null };

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  json: "application/json",
};

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** List one public folder through Drive's embedded folder view (no credentials needed for "anyone with link"). */
async function listFolder(folderId: string): Promise<{ name: string; id: string; isFolder: boolean; modified: string | null }[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`);
  if (!res.ok) throw new Error(`Drive folder ${folderId} returned ${res.status}`);
  const html = await res.text();
  const out: { name: string; id: string; isFolder: boolean; modified: string | null }[] = [];
  const re = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)<[\s\S]*?(?:flip-entry-last-modified"><div>([^<]*)<)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[2];
    out.push({ id: m[1], name: decode(m[3]).trim(), isFolder: href.includes("/folders/"), modified: m[4] ? m[4].trim() : null });
  }
  return out;
}

async function listRecursive(rootId: string): Promise<Map<string, Entry>> {
  const map = new Map<string, Entry>();
  const queue: { id: string; prefix: string; depth: number }[] = [{ id: rootId, prefix: "", depth: 0 }];
  while (queue.length) {
    const { id, prefix, depth } = queue.shift()!;
    const items = await listFolder(id);
    for (const it of items) {
      const path = prefix + it.name;
      const ext = it.name.split(".").pop()?.toLowerCase() || "";
      map.set(path, { fileId: it.id, isFolder: it.isFolder, mimeType: it.isFolder ? "folder" : (MIME[ext] || "application/octet-stream"), modifiedTime: null });
      if (it.isFolder && depth < 6) queue.push({ id: it.id, prefix: path + "/", depth: depth + 1 });
    }
  }
  return map;
}

async function downloadJson(fileId: string) {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
  if (!res.ok) throw new Error(`Manifest download returned ${res.status}`);
  return JSON.parse(await res.text());
}

const norm = (p: string) => p.replace(/^\.?\//, "").replace(/\\/g, "/").trim();
const PERIOD_KEYS = (obj: Record<string, unknown> | undefined) => Object.keys(obj || {});

async function syncUnit(admin: any, unit: any) {
  const report: Record<string, unknown> = { unit: `${unit.course_slug}/${unit.unit_slug}`, started_at: new Date().toISOString() };
  const map = await listRecursive(unit.drive_folder_id);
  report.files_listed = map.size;
  const manifestEntry = map.get(unit.manifest_name);
  if (!manifestEntry) {
    report.status = "manifest_missing";
    report.message = `Not in Drive yet: ${unit.manifest_name}`;
    await admin.from("units").update({ last_synced_at: new Date().toISOString(), last_sync_report: report }).eq("id", unit.id);
    return report;
  }
  const manifest = await downloadJson(manifestEntry.fileId);
  const generated = manifest.generated ? new Date(manifest.generated) : null;
  const periods: string[] = PERIOD_KEYS(manifest.placements).length ? PERIOD_KEYS(manifest.placements) : ["P2", "P7", "P8"];

  await admin.from("units").update({
    manifest_generated_at: generated?.toISOString() ?? null,
    gate_rule: manifest.gate_rule ?? unit.gate_rule,
    lesson_timing: manifest.lesson_timing ?? unit.lesson_timing,
    sets: manifest.sets ?? unit.sets,
    periods,
  }).eq("id", unit.id);

  const lessons: any[] = Array.isArray(manifest.lessons) ? manifest.lessons : [];
  let missing = 0, resolved = 0;
  const { data: existingRows } = await admin.from("lessons").select("*").eq("unit_id", unit.id);
  const existing = new Map((existingRows || []).map((r: any) => [r.lesson_key, r]));

  for (const L of lessons) {
    const prev: any = existing.get(L.id);
    const manifestWins = (editedAt: string | null) => !editedAt || (generated && generated > new Date(editedAt));
    const gateStatus: Record<string, string> = {};
    const gateEvidence: Record<string, string> = {};
    for (const p of periods) {
      const g = L.gate?.status?.[p] ?? L.gate?.[p];
      gateStatus[p] = typeof g === "string" ? g : g?.status ?? "PENDING";
      const ev = L.gate?.evidence?.[p] ?? g?.evidence;
      if (ev) gateEvidence[p] = String(ev);
    }
    const row: Record<string, unknown> = {
      unit_id: unit.id,
      teacher_id: unit.teacher_id,
      lesson_key: L.id,
      sort_order: L.order ?? 0,
      label: L.label ?? null,
      course_day: L.course_day ?? null,
      type: L.type ?? null,
      title: L.title ?? null,
      standards: Array.isArray(L.standards) ? L.standards : L.standards ? [String(L.standards)] : [],
      aim: L.aim ?? null,
      do_now: typeof L.do_now === "string" ? L.do_now : L.do_now ? JSON.stringify(L.do_now) : null,
      mini_lesson: L.mini_lesson ?? [],
      exit_ticket_questions: L.exit_ticket_questions ?? [],
      check_totals: L.check_totals ?? null,
      strip_excludes: L.strip_excludes ?? [],
      everyone_all_items: !!L.everyone_all_items,
      date_proposed: L.date_proposed ?? null,
      gate_rule: L.gate?.rule ?? manifest.gate_rule ?? null,
      gates_lesson_key: L.gates ?? L.gates_lesson ?? null,
      manifest: L,
    };
    if (!prev || manifestWins(prev.gate_edited_at)) { row.gate_status = gateStatus; row.gate_evidence = gateEvidence; }
    if (!prev || manifestWins(prev.date_edited_at)) { if (L.date_confirmed) row.date_confirmed = L.date_confirmed; }

    const { data: saved, error } = await admin.from("lessons").upsert(row, { onConflict: "unit_id,lesson_key" }).select("id").single();
    if (error) throw new Error(`Lesson ${L.id}: ${error.message}`);

    const files = L.files || {};
    for (const [role, formats] of Object.entries<any>(files)) {
      if (!formats || typeof formats !== "object") continue;
      for (const [format, relPath] of Object.entries<any>(formats)) {
        if (typeof relPath !== "string") continue;
        const hit = map.get(norm(relPath));
        hit ? resolved++ : missing++;
        await admin.from("lesson_files").upsert({
          lesson_id: saved.id,
          teacher_id: unit.teacher_id,
          role,
          format,
          relative_path: norm(relPath),
          drive_file_id: hit?.fileId ?? null,
          mime_type: hit?.mimeType ?? MIME[format] ?? null,
          modified_time: hit?.modifiedTime ?? null,
        }, { onConflict: "lesson_id,role,format" });
      }
    }
  }

  let placementsUpserted = 0;
  for (const p of periods) {
    for (const s of (manifest.placements?.[p] || []) as any[]) {
      if (!s?.name) continue;
      const { data: prev } = await admin.from("placements").select("id, source").eq("unit_id", unit.id).eq("period", p).eq("student_name", s.name).maybeSingle();
      // A placement moved by a scored ticket is newer than the manifest seed; keep it unless the manifest is regenerated later.
      if (prev && prev.source !== "manifest" && !generated) continue;
      await admin.from("placements").upsert({
        unit_id: unit.id, teacher_id: unit.teacher_id, period: p, student_name: s.name,
        email: s.email ?? null, set_number: s.set ?? null, why: s.why ?? null, flag: s.flag ?? null, source: "manifest",
      }, { onConflict: "unit_id,period,student_name" });
      placementsUpserted++;
    }
  }

  Object.assign(report, { status: "ok", lessons: lessons.length, files_resolved: resolved, files_missing: missing, placements: placementsUpserted, manifest_generated: manifest.generated ?? null });
  await admin.from("units").update({ last_synced_at: new Date().toISOString(), last_sync_report: report }).eq("id", unit.id);
  return report;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    let units: any[] = [];
    if (body?.scheduled) {
      const { data } = await admin.from("units").select("*");
      units = data || [];
    } else {
      const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ error: "Sign in required" }, 401);
      let q = admin.from("units").select("*").eq("teacher_id", u.user.id);
      if (body?.unit_id) q = q.eq("id", body.unit_id);
      const { data } = await q;
      units = data || [];
    }
    const reports = [];
    for (const unit of units) {
      try { reports.push(await syncUnit(admin, unit)); }
      catch (e) {
        const r = { unit: unit.unit_slug, status: "error", message: String((e as Error).message || e) };
        await admin.from("units").update({ last_synced_at: new Date().toISOString(), last_sync_report: r }).eq("id", unit.id);
        reports.push(r);
      }
    }
    return json({ success: true, reports });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
