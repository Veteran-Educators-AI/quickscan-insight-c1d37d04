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


## Job 6 — Day 7 bundle around a pre-printed worksheet (Wed 23 Sep)
- [ ] Read all four skills (print-format, format-coverage, tip-alignment, lesson-content)
- [ ] Build Day 7 Algebra II P5/P9 bundle around the printed "Worksheet 7" (10 items, repair R1-R3, sets of 6)
- [ ] Verify all 10 item answers, 4 check totals, exit-ticket Form A/B answers independently
- [ ] Match student names to roster exactly (no fuzzy match; surface unmatched)
- [ ] Lesson plan with four-rules section, TIP alignment, computed 17-slide count
- [ ] 17-slide deck: four-rules, vocabulary, minute badges, standards footers, TIP reference
- [ ] Who Does Which: teacher copy + board deck (one slide per group per period, no set numbers)
- [ ] Exit tickets Form A/B, answer key, all through hillcrest helpers
- [ ] Put today's bundle front and centre on the home page
- [ ] No publish to Live, no data deletion

## Job 5 — TIP alignment proof layer — done
- [x] Replace lesson-plan format coverage with TIP alignment tables and source note
- [x] Change deck teacher-reference slides to TIP alignment
- [x] Restore deck standards footers, minute badges, and key vocabulary slide
- [x] Regenerate slide counts and period slide ranges from the deck structure
- [x] Keep no-publish and no-delete constraints

## Job 8 — 23 Sept exit-ticket import (BLOCKED: waiting on A/B answer — no separate Test database)
- [ ] Import P5 Day 7 + STAT P2 Day 17 (35 rows) and P9 Day 7 (14 rows) into paper_scan_results; exact-name links only, flagged rows unlinked
- [ ] Update Day 8 Who Does Which for P9 from next_set (totals 811/933/1312/1395); P5 Day 8 and STAT P2 Day 18 from earlier payload
- [ ] Report inserted/matched/unlinked counts per class

## Job 9 — Unit 2 Statistics Lessons area from Drive (plan written, awaiting approval)
