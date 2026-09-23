# Roadmap

## Job 1 — close remaining real-name leaks (FERPA) — done
- [x] Masked `studentName` at source in `useMasteryData.ts` (`realName` kept) and `useBatchAnalysis.ts` (`studentRealName` kept)
- [x] Downstream sites (heat map, grouping, group PDF, grading report, galleries, comparison, print error report, Scan PDF + filenames) inherit the masked name
- [x] `AdaptiveWorksheetGenerator` — 4 sites incl. printed Name line
- [x] `BatchRemediationEmailDialog` — roster/results lists masked, email body left raw
- [x] Write/outbound paths routed to the raw name (grade_history, remediation push, Classroom push, missing-work matching, grader payloads)
- [x] DOE CSV + auto-fill gated behind `revealRealNames`
- [x] `Gradebook.tsx` sort key and the (c) exempt list untouched

## Job 2 — tagline "Differentiation, built into every sheet." — done
- [x] Login hero line under the wordmark
- [x] App header line under the wordmark (md and up)
- [x] Dashboard subheading under the page title

## Job 3 — "Tomorrow's lessons" band on the home page — done
- [x] `lesson_packs` table (pack per class per day, status, distribution record)
- [x] Pacing position from `src/data/pacingCalendars.ts` (anchors: ALG2P9 day 7, STATS7/8 day 17 on 2026-09-23)
- [x] Band above everything on the dashboard, one card per class, downloads on the card
- [x] Distribute: print pack in one tab, practice pushed to Scholar, board deck downloaded, all recorded
- [x] Honest states: no results -> calendar lesson only; generating; distributed today
- [x] Yesterday strip; "Save to tomorrow's card" on the draft screen

## Job 4 — Hillcrest house-format daily bundle — in progress
- [x] Add verbatim `public/hillcrest-print.css` and Hillcrest print/deck helper modules
- [x] Route all seven daily artifacts through the Hillcrest format
- [x] Put all seven current-day bundle downloads front and centre on the home page
- [x] Add format coverage proof to lesson plans, decks, and speaker notes
- [x] Preserve privacy, verification, no-guessing, no-delete, and no-publish rules
