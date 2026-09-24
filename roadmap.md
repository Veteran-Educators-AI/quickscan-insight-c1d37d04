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

## Job 8 — 23 Sept exit-ticket import — done
- [x] 49 papers imported (P5 19, P9 14, STATS2 16); exact-name links only, flagged rows unlinked
- [ ] Day 8 P9 Who Does Which (new sets, totals 516.25/4355.1/2552.35/5615.35) — BLOCKED: need Day 8 item answers to verify totals
- [ ] Statistics tickets: never print answer choices beside a blank

## Job 9 — Lessons area from Drive — built
- [x] Tables, drive-sync function (public folder, path-resolved), 30-min schedule, /lessons routes, rail, five tabs, gate, tallies, flags
- [ ] Screenshots of Day 25 — BLOCKED: Unit02_Manifest.json not in Drive yet; preview sign-in needs Gregory
- [ ] Placements auto-update from scored Unit 2 tickets (no Unit 2 tickets scored yet)
- [ ] Algebra II unit row once its Drive folder id is given
