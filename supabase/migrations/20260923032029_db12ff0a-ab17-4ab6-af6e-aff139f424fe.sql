CREATE TABLE public.lesson_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  pack_date date NOT NULL,
  day_number integer,
  lesson_title text,
  status text NOT NULL DEFAULT 'generating',
  source_worksheet_code text,
  source_worksheet_title text,
  source_worksheet_date date,
  papers integer NOT NULL DEFAULT 0,
  student_count integer NOT NULL DEFAULT 0,
  what_this_fixes text,
  draft jsonb,
  error_message text,
  distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  distributed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lesson_packs_class_date_key ON public.lesson_packs (teacher_id, class_id, pack_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_packs TO authenticated;
GRANT ALL ON public.lesson_packs TO service_role;

ALTER TABLE public.lesson_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their own lesson packs"
ON public.lesson_packs FOR ALL TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

CREATE TRIGGER update_lesson_packs_updated_at
BEFORE UPDATE ON public.lesson_packs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();