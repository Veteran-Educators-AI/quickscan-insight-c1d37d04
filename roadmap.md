# Roadmap

## Job 1 — close remaining real-name leaks (FERPA)
- [ ] Mask `studentName` at source in `useMasteryData.ts` and `useBatchAnalysis.ts`; keep raw name under a separate field for scan matching / DB writes / emails / DOE export
- [ ] Fix `MasteryHeatMap.tsx:317`, `AdaptiveWorksheetGenerator.tsx` (4 sites incl. printed Name line), `PrintStudentErrorReport.tsx`, `Scan.tsx` fallback PDF + image filenames
- [ ] `BatchRemediationEmailDialog.tsx` — mask roster/results lists, leave email body raw
- [ ] Minor fallbacks: `BatchQueue.tsx` continuation label + override dialog, `BatchReport.tsx` toasts/failure names
- [ ] Gate DOE CSV + auto-fill behind `revealRealNames` with an explanatory toast
- [ ] Leave `Gradebook.tsx:475`-476 sort key and everything in the (c) exempt list untouched

## Job 2 — product tagline "Differentiation, built into every sheet."
- [ ] Login page hero line under the wordmark
- [ ] App header/sidebar small line under the wordmark
- [ ] Dashboard subheading under the page title
