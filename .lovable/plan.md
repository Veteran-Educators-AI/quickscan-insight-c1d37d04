# Real-name audit (verification only — no code changed)

Search across `src` for `first_name` / `last_name` / `firstName` / `lastName` / `studentName` / `student_name` / `student.name`: 863 hits in 108 files. Below, only hits that reach a screen, a PDF/print page, a filename, an export or an email body are classified. Pure type declarations, DB `.select()` column lists and DB writes are omitted unless noted.

## (a) Still leaking a real name — should be fixed

Root sources (fixing these two clears most of the list):

- `src/hooks/useMasteryData.ts:74`, `:198` — builds `studentName` as raw `first_name last_name`; feeds the heat map, grouping and group PDF export.
- `src/hooks/useBatchAnalysis.ts:643`, `:770`, `:790`, `:800`, `:1148` — sets batch item `studentName` to the raw roster name after matching; that field then flows into every batch export and gallery.

Downstream leaks:

- `src/components/reports/MasteryHeatMap.tsx:195`, `:200`, `:222`, `:261`, `:317` — grid labels, tooltips, and the real name handed to `StudentReportDialog`.
- `src/components/reports/DifferentiationGrouping.tsx:365`, `:425` — group cards, and the names handed to the print/export dialogs.
- `src/components/reports/ExportGroupPDFDialog.tsx:251`, `:258`, `:365`, `:474` — printed `Name:` line, width measure, page footer, on-screen list (PDF export).
- `src/lib/gradingReportExport.ts:187`, `:207`, `:589`, `:630`, `:880`–`884` — PDF summary lines, per-page headers, Word tables, and the exported image **filenames**.
- `src/pages/Scan.tsx:1103`, `:2188`–`2191` — fallback PDF roster line and downloaded image filenames.
- `src/components/print/PrintStudentErrorReport.tsx:122`, `:195` — printed error report list and "Student:" line.
- `src/components/scan/DifferentiationGroupView.tsx:624`, `:740` — group tables on the results screen.
- `src/components/scan/GradedPapersGallery.tsx:282`, `:300`, `:354` — gallery captions and alt text.
- `src/components/scan/StudentComparisonView.tsx:140`, `:182`, `:294`, `:313` — comparison labels and alt text.
- `src/components/scan/PushToClassroomDialog.tsx:211`, `:383` — grade list and sync results (names come from batch items).
- `src/components/reports/BatchRemediationEmailDialog.tsx:102`, `:276`, `:346` — teacher-facing roster list and results list (the name inside the email body itself is exempt, see (c)).
- `src/components/questions/AdaptiveWorksheetGenerator.tsx:190`, `:343`, `:561`, `:652` — status text, printed `Name:` line on the worksheet PDF, and two on-screen lists.
- `src/hooks/useAdaptiveLevels.ts` (`firstName`/`lastName` records) — source for the above.
- `src/components/reports/Gradebook.tsx:1620` and `src/components/reports/StudentProgressTracker.tsx:511`, `src/components/reports/RegentsScoreReport.tsx:473`, `:585` are already masked; the leak is only via `MasteryHeatMap:317`, which is the one unmasked caller of `StudentReportDialog`.
- `src/pages/BatchGrading.tsx:329`, `:413`, `:476` and `src/pages/UploadSubmissions.tsx:65`, `:302`, `:336` — currently mock/placeholder names ("Student 1"), so no live leak today, but the render path is unmasked and will leak once wired to real data.

Prop-only pass-throughs (no fix needed in the file itself; they inherit whatever the caller passes — masked from `BatchQueue`/`BatchReport`, leaking from the paths above): `AnalysisResults.tsx:372`, `SinglePaperView.tsx:210`, `SimpleResultsView.tsx:79`, `StudentWorkDetailDialog.tsx:232`/`301`/`593`, `MultiAnalysisBreakdownDialog.tsx:66`, `SaveAnalyticsConfirmDialog.tsx:60`, `BatchImageZoomDialog.tsx:324`/`509`, `RemediationActions.tsx:299`, `PrintRemediationQuestionsDialog.tsx:116`/`327`/`505`, `PrintRemediationDialog.tsx:247`, `ScrapPaperGenerator.tsx:89`, `AIScanPreviewDialog.tsx:181`, `PushStudentPracticeDialog.tsx:270`, `StudentReportDialog.tsx:1203`/`1248`/`1979`/`2122`/`2240`, `bandedWorksheetPdf.ts:68`/`114`/`171`, `bandedCommonSheetPdf.ts:48`/`84`/`133`.

## (b) Already correct — goes through `getDisplayName`

`Gradebook.tsx:442`/`569`/`797`/`1302`/`1310`/`1402`/`1487` (incl. CSV export), `StudentProgressTracker.tsx:153`/`266`, `RegentsScoreReport.tsx:216`/`350`, `AttendancePatternsReport.tsx:126`, `EmailResponsesReport.tsx:233`/`269`, `ScanAnalysisHistory.tsx:150`/`257`/`295`, `ScholarSyncDataDetails.tsx:267`/`568`, `ScholarSyncPreviewDialog.tsx:292`, `InboundScholarDataPanel.tsx:231`/`558`, `StudentsNeedingHelpWidget.tsx:132`/`145`, `DiagnosticGapsSummary.tsx`, `ClassMisconceptionSummary.tsx`, `LevelProgressionChart.tsx`, `GradeRecalculationDialog.tsx`, `WorksheetSubmissionsTracker.tsx`, `PushAssignmentDialog.tsx`, `MissingSubmissionsAlert.tsx`, `ContinuousQRScanner.tsx`, `BehaviorPointDeductionDialog.tsx`, `LiveSessionControls.tsx`, `PrintableWorksheet.tsx`, `PrintWorksheetDialog.tsx`, `MasteryChallengeGenerator.tsx`, `DifferentiatedWorksheetGenerator.tsx`, `GroupAssignmentDialog.tsx`, `SetAssignmentDialog.tsx`, `TeacherLibrary.tsx`, `ClassDetail.tsx:741`, `BatchQueue.tsx:194`/`577`/`603`/`1066`/`1089`/`1098`, `BatchReport.tsx:99`/`420`/`890`/`945`, `ScanClassStudentPicker.tsx:184`/`202`/`239`/`265`, `ClassStudentSelector.tsx:222`, `DiagnosticResultsRecorder.tsx:221`/`278`/`357`, `EmailQuestionDialog.tsx:296`, `RemediationCompletionsBadge.tsx`.

Minor gaps inside otherwise-correct files: `Gradebook.tsx:475`–`476` (sort key uses real surname — not rendered, ordering only), `BatchQueue.tsx:493`/`996` and `BatchReport.tsx:276`/`309`/`311`/`636` (fallback `item.studentName` in a continuation label, override dialog and failure toasts).

## (c) Deliberately exempt

- Identity entry / import / correction: `EditStudentDialog.tsx`, `CSVStudentUploader.tsx`, `RosterImageConverter.tsx`, `ClassDetail.tsx` add-student + CSV parser, `ClassNew.tsx`, `GoogleClassroomImport.tsx`, `AddUnknownStudentDialog.tsx`, `ManualLinkDialog.tsx`, `useNameCorrections.ts`, `useStudentIdentification.ts`, `HandwritingComparisonDialog.tsx`.
- Scan matching: `MultiStudentScanner.tsx:1712`/`1725`/`1972`, `SaveForLaterTab.tsx:223`/`600`/`634` (assigning a scanned paper to a person requires the real name).
- Database / outbound writes: `useSaveAnalysisResults.ts`, `useAnalyzeStudentWork.ts`, `usePushToSisterApp.ts`, `usePushStudentData.ts`, `useLiveSession.ts`, `SyncRosterToScholarButton.tsx`, `RecommendedNextSteps.tsx:237`/`327`/`386`, `RemediationActions.tsx:139`, `DifferentiationGroupView.tsx:416`, `BatchReport.tsx:167`/`226`, `PushStudentPracticeDialog.tsx:227`.
- Student-facing self-view: `StudentDashboard.tsx`, `StudentJoinClass.tsx`, `StudentMagicCallback.tsx`.
- Email/AI bodies addressed to the student or sent to the model: `BatchRemediationEmailDialog.tsx:150`/`160`, `AIWorkDetector.tsx:62`/`93`, `StudentReportDialog.tsx:1000`–`1068` (prompt text), `PushStudentPracticeDialog.tsx:173`–`174`.
- Official NYC DOE gradebook path, which must carry legal names to match the portal roster: `Gradebook.tsx:595`–`707` (DOE CSV + auto-fill data), `DOEAutoFillDialog.tsx` throughout. Flagging for your confirmation rather than changing.
- QR components (`StudentQRCode.tsx`, `StudentPageQRCode.tsx`, `StudentOnlyQRCode.tsx`, `qrCodeUtils.ts`): no name fields at all — they encode IDs only. Nothing to fix.

## The two explicit confirmations

1. **`NameVisibilityControl` inside a dialog header — confirmed.** Mounted in `GroupAssignmentDialog.tsx:310` and `SetAssignmentDialog.tsx:324`, wrapped in a `div className="pt-1"` inside `DialogHeader` (after `DialogDescription`). It renders a flex row (badge + button + countdown) rather than raw text, so it does not fight Radix's header text layout; the app loads with no console errors beyond a pre-existing ref warning.
2. **Default on fresh load is hidden — confirmed.** `StudentNameContext.tsx:22` is `useState(false)`, and there is no `localStorage`/`sessionStorage` read anywhere in the file, so reveal never persists across a reload. The 5-minute inactivity timer additionally reverts to hidden and logs `auto_reverted_to_pseudonyms`.

## Suggested fix order if you want the (a) list closed

1. Mask at the two sources (`useMasteryData`, `useBatchAnalysis` display fields) — clears the heat map, grouping, group PDF, grading report PDF/Word, exported filenames, galleries and comparison views at once, keeping raw names only where scan matching needs them.
2. Mask `MasteryHeatMap:317` and the `AdaptiveWorksheetGenerator` render/PDF sites.
3. Mask `BatchRemediationEmailDialog` list rendering while leaving the email body intact.
4. Decide the DOE export question (keep legal names, or gate the export behind an explicit reveal).
