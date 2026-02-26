
-- Allow inserts into grade_history from service role or when teacher_id references a valid teacher
-- This enables Scholar (using anon key) to insert grades for known teachers
CREATE POLICY "Allow external app inserts with valid teacher_id"
ON public.grade_history
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = grade_history.teacher_id 
    AND profiles.role = 'teacher'
  )
);
