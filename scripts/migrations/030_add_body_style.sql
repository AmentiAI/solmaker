-- Migration: Add body_style column to collections table
-- Options: 'full', 'half', 'headonly'
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS body_style TEXT DEFAULT 'full';

