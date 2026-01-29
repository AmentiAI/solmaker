-- Add banner video support for launchpad hero banners
ALTER TABLE collections ADD COLUMN IF NOT EXISTS banner_video_url TEXT;


