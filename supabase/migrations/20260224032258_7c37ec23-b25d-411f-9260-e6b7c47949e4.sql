-- Allow teachers to insert test events into their own sync log
CREATE POLICY "Teachers can insert their own sync logs"
ON public.sister_app_sync_log
FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

-- Allow teachers to update their own sync logs (for marking as processed)
CREATE POLICY "Teachers can update their own sync logs"
ON public.sister_app_sync_log
FOR UPDATE
USING (auth.uid() = teacher_id);