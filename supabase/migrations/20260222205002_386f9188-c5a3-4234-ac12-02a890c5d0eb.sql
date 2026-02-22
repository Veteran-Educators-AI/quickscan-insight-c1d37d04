
-- Create the external_students table for Scholar app integration
CREATE TABLE IF NOT EXISTS public.external_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT NOT NULL,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  class_id TEXT,
  class_name TEXT,
  source TEXT DEFAULT 'nycologic_ai',
  sync_timestamp TIMESTAMPTZ DEFAULT now(),
  linked_user_id UUID,
  teacher_name TEXT,
  overall_average NUMERIC,
  grades JSONB,
  misconceptions JSONB,
  weak_topics JSONB,
  remediation_recommendations TEXT[],
  skill_tags TEXT[],
  xp_potential INTEGER DEFAULT 0,
  coin_potential INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_students_external_id_key UNIQUE (external_id)
);

-- Enable RLS
ALTER TABLE public.external_students ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role key)
CREATE POLICY "Service role full access on external_students"
  ON public.external_students
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_external_students_updated_at
  BEFORE UPDATE ON public.external_students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
