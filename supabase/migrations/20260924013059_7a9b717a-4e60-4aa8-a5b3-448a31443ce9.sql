-- 1. Allow unlinked paper results (name kept as written, never guessed)
ALTER TABLE public.paper_scan_results ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.paper_scan_results ADD COLUMN IF NOT EXISTS name_as_written text;
ALTER TABLE public.paper_scan_results ADD COLUMN IF NOT EXISTS name_flag text;
ALTER TABLE public.paper_scan_results ADD COLUMN IF NOT EXISTS next_set integer;
ALTER TABLE public.paper_scan_results ADD COLUMN IF NOT EXISTS ticket_code text;

-- 2. Lessons area (unit-agnostic, Drive-backed)
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  course_slug text NOT NULL,
  unit_slug text NOT NULL,
  course text NOT NULL,
  title text NOT NULL,
  drive_folder_id text NOT NULL,
  manifest_name text NOT NULL DEFAULT 'Unit02_Manifest.json',
  manifest_generated_at timestamptz,
  gate_rule text,
  lesson_timing jsonb,
  sets jsonb,
  periods text[] NOT NULL DEFAULT '{}',
  last_synced_at timestamptz,
  last_sync_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, course_slug, unit_slug)
);
CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  lesson_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  label text,
  course_day integer,
  type text,
  title text,
  standards text[] NOT NULL DEFAULT '{}',
  aim text,
  do_now text,
  mini_lesson jsonb NOT NULL DEFAULT '[]',
  exit_ticket_questions jsonb NOT NULL DEFAULT '[]',
  check_totals jsonb,
  strip_excludes jsonb NOT NULL DEFAULT '[]',
  everyone_all_items boolean NOT NULL DEFAULT false,
  date_proposed date,
  date_confirmed date,
  date_edited_at timestamptz,
  taught_at timestamptz,
  gate_rule text,
  gate_status jsonb NOT NULL DEFAULT '{}',
  gate_evidence jsonb NOT NULL DEFAULT '{}',
  gate_edited_at timestamptz,
  gates_lesson_key text,
  manifest jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, lesson_key)
);
CREATE TABLE public.lesson_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  role text NOT NULL,
  format text NOT NULL,
  relative_path text NOT NULL,
  drive_file_id text,
  mime_type text,
  modified_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, role, format)
);
CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  period text NOT NULL,
  student_name text NOT NULL,
  email text,
  set_number integer,
  why text,
  flag text,
  flag_resolved_at timestamptz,
  source text NOT NULL DEFAULT 'manifest',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, period, student_name)
);
CREATE TABLE public.gate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  period text NOT NULL,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.exit_ticket_tallies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  period text NOT NULL,
  question text NOT NULL,
  correct integer NOT NULL DEFAULT 0,
  half integer NOT NULL DEFAULT 0,
  wrong integer NOT NULL DEFAULT 0,
  blank integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.roster_flag_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  flag_key text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, flag_key)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units','lessons','lesson_files','placements','gate_overrides','exit_ticket_tallies','roster_flag_resolutions'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Teacher owns rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = teacher_id AND public.is_valid_teacher_id(auth.uid())) WITH CHECK (auth.uid() = teacher_id AND public.is_valid_teacher_id(auth.uid()))', t);
  END LOOP;
END $$;

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lesson_files_updated_at BEFORE UPDATE ON public.lesson_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_placements_updated_at BEFORE UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();