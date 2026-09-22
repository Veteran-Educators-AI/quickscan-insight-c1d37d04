DROP INDEX IF EXISTS public.paper_scan_results_teacher_source_ref_key;
ALTER TABLE public.paper_scan_results
  ADD CONSTRAINT paper_scan_results_teacher_source_ref_key UNIQUE (teacher_id, source_ref);