-- Fix promotions schema:
-- - promotions.collection_id was incorrectly created as INTEGER while collections.id is UUID
-- - make collection_id a UUID safely (non-uuid legacy values become NULL)
-- - add subject_type for richer history (optional)

-- Drop bad FK if it exists
ALTER TABLE promotions
  DROP CONSTRAINT IF EXISTS promotions_collection_id_fkey;

-- Convert collection_id to UUID safely:
-- If it's not a UUID-shaped value, it becomes NULL.
ALTER TABLE promotions
  ALTER COLUMN collection_id TYPE UUID
  USING (
    CASE
      WHEN promotions.collection_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN promotions.collection_id::text::uuid
      ELSE NULL
    END
  );

-- Re-add FK to collections
ALTER TABLE promotions
  ADD CONSTRAINT promotions_collection_id_fkey
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;

-- Optional: track whether this was a character or object flyer
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS subject_type TEXT;


