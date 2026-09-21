ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS merged_into_student_id uuid REFERENCES public.students(id);

CREATE TABLE IF NOT EXISTS public.paper_scan_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id),
  source_ref text,
  submission_type text,
  topic_name text NOT NULL,
  standard_code text,
  activity_name text,
  score numeric,
  items_correct integer,
  items_attempted integer,
  item_marks jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weak_skill_tags text[] NOT NULL DEFAULT '{}'::text[],
  summary text,
  grade_history_id uuid REFERENCES public.grade_history(id),
  raw_payload jsonb,
  scanned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS paper_scan_results_teacher_source_ref_key
  ON public.paper_scan_results (teacher_id, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS paper_scan_results_student_idx ON public.paper_scan_results (student_id);
CREATE INDEX IF NOT EXISTS paper_scan_results_class_idx ON public.paper_scan_results (class_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_scan_results TO authenticated;
GRANT ALL ON public.paper_scan_results TO service_role;

ALTER TABLE public.paper_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their own paper scan results"
ON public.paper_scan_results
FOR ALL
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE TRIGGER update_paper_scan_results_updated_at
BEFORE UPDATE ON public.paper_scan_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();