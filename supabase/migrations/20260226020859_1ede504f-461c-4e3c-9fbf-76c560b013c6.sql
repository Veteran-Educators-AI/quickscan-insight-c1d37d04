-- Replace external insert policy so Scholar works whether requests resolve to anon or authenticated role
DROP POLICY IF EXISTS "Allow external app inserts with valid teacher_id" ON public.grade_history;

CREATE POLICY "Allow external app inserts with valid teacher_id"
ON public.grade_history
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = grade_history.teacher_id
      AND profiles.role = 'teacher'
  )
);