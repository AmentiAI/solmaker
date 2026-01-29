-- Clear thumbnail_url where it equals image_url
-- These are not real thumbnails, just copies of the original URL
UPDATE generated_ordinals
SET thumbnail_url = NULL
WHERE thumbnail_url = image_url;

-- Also clear any thumbnail_url that doesn't contain 'thumbnail-' prefix
-- Real thumbnails have filenames like: thumbnail-{collection}-{number}.jpg
UPDATE generated_ordinals
SET thumbnail_url = NULL
WHERE thumbnail_url IS NOT NULL 
  AND thumbnail_url NOT LIKE '%thumbnail-%';

