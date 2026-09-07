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
