-- Allow admins to force a collection to appear in the homepage ordinal ticker
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS force_show_on_homepage_ticker BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_collections_force_show_on_homepage_ticker
ON collections (force_show_on_homepage_ticker);


