-- Make collection_id nullable in promotion_jobs table
-- This allows videos to be generated from uploaded images without a collection
-- Run this migration in your database

ALTER TABLE promotion_jobs
ALTER COLUMN collection_id DROP NOT NULL;
