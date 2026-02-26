-- Validate teacher IDs for external inserts without being blocked by RLS on profiles
CREATE OR REPLACE FUNCTION public.is_valid_teacher_id(p_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_teacher_id
      AND role = 'teacher'
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_teacher_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_teacher_id(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Allow external app inserts with valid teacher_id" ON public.grade_history;

CREATE POLICY "Allow external app inserts with valid teacher_id"
ON public.grade_history
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_valid_teacher_id(teacher_id));