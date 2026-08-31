CREATE TABLE public.banded_set_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  worksheet_id uuid REFERENCES public.worksheets(id) ON DELETE SET NULL,
  assigned_set integer NOT NULL DEFAULT 1 CHECK (assigned_set BETWEEN 1 AND 4),
  item_count integer NOT NULL DEFAULT 10,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banded_set_assignments TO authenticated;
GRANT ALL ON public.banded_set_assignments TO service_role;

ALTER TABLE public.banded_set_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their own set assignments"
ON public.banded_set_assignments FOR ALL TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE TRIGGER update_banded_set_assignments_updated_at
BEFORE UPDATE ON public.banded_set_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();