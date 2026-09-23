# Plan: Hillcrest house-format daily bundle

## Goal
Make every next-day lesson artifact use the Hillcrest print/deck format exactly, and keep the full daily bundle visible on the home page with one-click downloads.

## What will change
- Add the fixed print stylesheet at `public/hillcrest-print.css`, copied verbatim from the workspace skill.
- Add reusable Hillcrest builders:
  - `src/lib/hillcrestPrint.ts` for the printable HTML components.
  - `src/lib/hillcrestPdf.ts` for hidden-iframe browser printing, not jsPDF/html2canvas.
  - `src/lib/hillcrestDeck.ts` for the shared PowerPoint helpers and palette.
- Rewrite the daily artifact exporters so the seven files come from the Hillcrest modules:
  1. four-side worksheet
  2. Form A/Form B exit tickets
  3. answer key and grading table
  4. Who Does Which teacher copy plus board version
  5. lesson plan
  6. lesson slides PowerPoint
  7. Who Does Which board deck PowerPoint
- Update the home-page Tomorrow’s lessons cards so the date/topic remain visible and each of the seven files has its own direct download button.

## Rules to preserve
- Student-facing documents will not reveal difficulty, placement, scores, or reasons.
- The board version will show names, item numbers, and check totals only; no set numbers or reasons.
- Unmatched papers will stay unmatched for teacher confirmation; no fuzzy identity linking.
- Numeric answers and check totals must be verified before files are offered.
- No publishing to Live.
- No data deletion.

## Technical details
- Printable PDFs will be generated as complete HTML documents using the fixed stylesheet and opened through the browser print flow.
- Existing next-day lesson draft data will be adapted into the Hillcrest artifact structures rather than creating a parallel lesson format.
- The deck helpers will use pptxgenjs with a custom 13.333 × 7.5 layout, instance-based `ShapeType`, and safe text runs for subscripts/empty strings.
- Existing stored packs may need regeneration to fully include the new four-set/check-total structures; the UI will block or show a clear unavailable state if verification data is incomplete.

## Verification
- Check the build log after edits.
- Verify the home-page download controls are present.
- Spot-check generated print/deck output paths for the Hillcrest structure and protected student-facing wording.
