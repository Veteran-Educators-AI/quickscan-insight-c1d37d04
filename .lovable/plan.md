# Lessons area: Drive-only files and real-name placements

## Build
- Replace the lesson rail/detail-first layout with one card per manifest lesson, preserving manifest order within Upcoming and Past sections.
- Show each card's day label, date, title, aim, and OPEN / RETEACH / PENDING status for every period.
- Put direct Drive controls on each card for period lesson decks, the combined worksheet/exit-ticket PDF, period who-does-what PPTX and PDF, period teacher cards, and solutions.
- Keep PDF files embedded inline when opened; keep PPTX files download-only.
- Retain a lesson route for focused viewing and direct links, but make the unit route the complete day-card overview.

## File-source and privacy rules
- Lessons will only use files synchronized from `Unit02_Manifest.json` into lesson file records; no lesson-area generation or placeholder deck fallback.
- Remove every Lessons-area reference to the obsolete separate who-does-what deck role and remove “Unclaimed paper” fallbacks from the lesson-pack name resolver.
- The on-site placement table will use manifest placement names exactly. Missing names render only `— name needed —`.
- The placement table will show set, item numbers, and check total, grouped by set; no code-name substitution.

## Verification
- Confirm build health and inspect the live preview at desktop width.
- Verify the Day 24 card route and capture a Lessons-page screenshot.
- Open Period 2 Who does what, verify its Drive PDF and manifest real-name table, and capture a second screenshot.
- If Day 24 files or authenticated preview access are unavailable, report the exact blocker without generating substitute content.

## Technical details
- Scope lesson-area changes to `Lessons.tsx`; dashboard daily bundles remain independent.
- Continue supporting old v1 manifests only by linking their recorded Drive files; never generate replacements.
- Do not publish to Live.
