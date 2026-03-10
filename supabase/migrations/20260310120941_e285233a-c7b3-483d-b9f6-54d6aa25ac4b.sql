-- Clean duplicates in Period 6 Term 2 class (ec630780-87c0-4b0c-8fd8-f01a6a2fe7e6)
WITH ranked AS (
  SELECT gh.id,
    ROW_NUMBER() OVER (PARTITION BY gh.student_id, gh.topic_name, DATE(gh.created_at) ORDER BY gh.created_at ASC) as rn
  FROM grade_history gh
  JOIN students s ON s.id = gh.student_id
  WHERE s.class_id = 'ec630780-87c0-4b0c-8fd8-f01a6a2fe7e6'
)
DELETE FROM grade_history WHERE id IN (SELECT id FROM ranked WHERE rn > 1);