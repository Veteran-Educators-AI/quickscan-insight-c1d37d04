ALTER TABLE public.lesson_plans
ADD COLUMN IF NOT EXISTS aim TEXT;

UPDATE public.lesson_plans
SET aim = objective
WHERE aim IS NULL;