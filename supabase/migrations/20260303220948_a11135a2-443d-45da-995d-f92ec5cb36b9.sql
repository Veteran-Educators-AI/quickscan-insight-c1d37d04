
-- Add svg and image_prompt columns to live_session_questions
ALTER TABLE public.live_session_questions
ADD COLUMN svg text,
ADD COLUMN image_prompt text;
