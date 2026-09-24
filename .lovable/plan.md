# Unit 2 Statistics — Lessons area, Drive as source of truth

## Decisions needed before build (stated assumptions)
1. **Drive access.** No Google Drive API key exists in this project. Assumption: use the Google Drive connector (managed login, read-only on the shared folder) instead of a raw key. If you prefer a plain API key, add it as `GOOGLE_DRIVE_API_KEY` in Secrets and the sync function uses that instead. Nothing else changes.
2. **One database.** Preview and Live share the same database. The new tables are additive (no existing data touched), but creating them does make them exist for Live too. The Lessons pages only appear to users once Gregory publishes.
3. **Scored exit tickets.** "worksheet_results" does not exist here; scored papers land in `paper_scan_results` (item_marks per student). The gate reads those by lesson code + class, plus manual tallies.
4. The 23 Sept import (A/B question) stays paused until you answer it separately.

## Routes
- `/lessons` → `/lessons/statistics/unit-2` (rail + upcoming lesson)
- `/lessons/statistics/unit-2/:lessonId` — five tabs: Teach · Who does what · Worksheet · Exit tickets · Solutions (teacher only)
- Nav entry "Lessons" in the teacher sidebar. Student accounts are redirected away from all of it.

## Tables (new, additive; teacher-scoped by RLS, real names only)
- `units` — slug, course, title, drive_folder_id, manifest_generated_at, gate_rule, lesson_timing (json), last_synced_at
- `lessons` — unit_id, lesson_key (sub-folder id), order, label, course_day, type, title, standards[], aim, do_now, mini_lesson (json), exit_ticket_questions (json), check_totals (json), strip_excludes[], everyone_all_items, date_proposed, date_confirmed, gate_rule, gate_status_p2/p7/p8 + gate_evidence_p2/p7/p8, gate_edited_at, gates_lesson_key (for reteach), manifest (raw json)
- `lesson_files` — lesson_id, role (worksheet, exit_tickets, solutions, quiz, lesson_deck, who_does_what_P2…, who_does_what_deck_P2…), format (pdf/docx/pptx), relative_path, drive_file_id (null = "Not in Drive yet"), mime_type, modified_time
- `placements` — unit_id, period, student_name, email, set_number, why, flag, flag_resolved_at, source
- `gate_overrides` — lesson_id, period, status (OPEN/RETEACH/SKIP), note, created_by, created_at (log)
- `exit_ticket_tallies` — lesson_id, period, question, correct, half, wrong, blank, created_by

## How Drive sync resolves paths
`drive-sync` function (button + every 30 min):
1. List the folder recursively (`'<id>' in parents`, follow sub-folders) and build `relative/path → {fileId, mimeType, modifiedTime}`.
2. Download `Unit02_Manifest.json` from the map; parse.
3. For each lesson, look up every `files.*` path in the map — never a stored ID. Missing path → row kept with no file ID → page shows "Not in Drive yet: <path>".
4. Upsert units/lessons/lesson_files/placements. Site edits (confirmed date, gate status) are kept unless the manifest's `generated` time is newer than the edit.

## Pages
- **Rail:** 14 manifest entries; Upcoming first (next un-taught highlighted), Done collapsed; reteach rows indented under the day they gate with "Reteach — run only if gate says so"; per-period gate chips (green OPEN/CLEAR, amber PENDING/TARGETED EXAMPLE, red RETEACH); grey proposed date with unconfirmed dot; next day greyed "after reteach" when a period is RETEACH.
- **Header:** label, day, title, standards, aim, editable date + Confirm, gate panel with rule, chip + evidence per period, override (OPEN/RETEACH/SKIP + note, logged), "Print the day" for the selected period.
- **Teach:** timing bar, deck preview (Drive preview iframe), Open .pptx, Present, 10-minute talk timer that turns red at 10:00.
- **Who does what:** period 2/7/8 selector, student deck and teacher list side by side, live placements table (amber rows for flags), the four roster flags at the top with Resolve buttons. No set numbers on the student deck panel label.
- **Worksheet:** worksheet PDF (Day 28 adds quiz, Day 34 the test), Print (duplex), .docx, four set lines with check totals, strip-exclude note.
- **Exit tickets:** PDF + Print, questions as text, "Score this exit ticket" → existing scan flow with lesson id pre-filled, manual tally form (correct/half/wrong/blank → % of attempted).
- **Solutions:** PDF, teacher login only.

## Gate logic
OPEN when the previous ticket has no question under 40% and at most one under 60%, from scanned item marks + tallies (% correct of attempted, blanks excluded). No scored ticket → PENDING with "gate not yet checked". Manifest seeds R0 (P7 RETEACH, P2 TARGETED EXAMPLE, P8 CLEAR) and R1 (all PENDING).

## Placement updates
Existing rules applied per scored ticket (4/4 with reasoning → 4; all right no reasoning → 3; one skill broken → 2; blank or 2+ broken → 1; no paper → 2; M never moves down; Scholar online score never places). Day 23 re-baselines. Sets fixed as specified; diagnostic/test days = all items.

## Verification
Run sync, then screenshot Day 25 Teach tab and Who does what for Period 7, signed in as Gregory. No publishing, no deletions, no content regenerated.
