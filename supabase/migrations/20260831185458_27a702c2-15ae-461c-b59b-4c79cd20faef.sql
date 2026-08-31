CREATE TYPE public.question_band AS ENUM ('foundation', 'core', 'extension', 'depth');

ALTER TABLE public.questions
  ADD COLUMN band public.question_band NOT NULL DEFAULT 'core',
  ADD COLUMN answer_group text;

CREATE INDEX IF NOT EXISTS idx_questions_band ON public.questions (band);
CREATE INDEX IF NOT EXISTS idx_questions_answer_group ON public.questions (answer_group);