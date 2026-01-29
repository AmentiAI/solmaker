-- Add image model override to generation_jobs
-- Allows Classic vs Pro per queued job
ALTER TABLE generation_jobs
ADD COLUMN IF NOT EXISTS image_model TEXT;


