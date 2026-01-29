# Database Performance Optimization

This document describes the optimizations made to reduce database compute costs and improve query performance.

## Problem

The database was experiencing extremely high compute usage due to:
1. **19,020 calls** to `SELECT ... FROM generated_ordinals WHERE collection_id = $1 ORDER BY created_at DESC` (avg 34ms, total 647s)
2. **9,158 calls** to a similar query without thumbnail_url (avg 18.8ms, total 172s)
3. **28,592 calls** to `SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = $1` (avg 0.2ms, total 6s)
4. **27,904 calls** to `SELECT status, COUNT(*) FROM generation_jobs WHERE collection_id = $1 AND status IN (...) GROUP BY status` (avg 0.1ms, total 1s)

## Root Causes

1. **Excessive Polling**: The collections page was polling every 10 seconds, triggering database queries continuously
2. **Missing Indexes**: Database queries were doing full table scans instead of using indexes
3. **Inefficient Queries**: Some queries were fetching all rows and paginating in memory

## Solutions Implemented

### 1. Database Indexes (`scripts/migrations/013_add_performance_indexes.sql`)

Added comprehensive indexes for common query patterns:

- `idx_generated_ordinals_collection_created_desc`: For `collection_id + created_at DESC` queries
- `idx_generated_ordinals_collection_number`: For ordering by `ordinal_number`
- `idx_generated_ordinals_collection_minted`: Partial index for filtering unminted ordinals
- `idx_generated_ordinals_collection_id`: For COUNT queries
- `idx_generation_jobs_status_collection`: Composite index for status + collection queries
- `idx_generation_jobs_collection_status`: For GROUP BY status queries
- `idx_generation_jobs_pending`: Partial index for pending jobs (most common query)

### 2. Reduced Polling Frequency

**Before**: Polling every 10 seconds regardless of activity
**After**: 
- Polling every 30 seconds (3x reduction)
- Only reload ordinals on page 1 when there are active jobs
- Job status checks continue but less frequently

**Location**: `app/collections/[id]/page.tsx`

### 3. Query Optimization

While the ordinals query still fetches all rows for a collection (to support JSONB trait filtering), it now:
- Uses indexed `collection_id` lookups
- Only fetches when needed (reduced polling)
- Could be further optimized with JSONB GIN indexes for very large collections

## Running the Migration

To apply the performance indexes:

```bash
node scripts/run-migration.js
```

Or manually execute the SQL:
```bash
psql $NEON_DATABASE < scripts/migrations/013_add_performance_indexes.sql
```

## Expected Impact

1. **Query Performance**: 
   - `collection_id` lookups should be 10-100x faster with indexes
   - COUNT queries should be nearly instant
   - GROUP BY queries optimized with composite indexes

2. **Cost Reduction**:
   - 70% reduction in polling frequency (10s → 30s)
   - Conditional polling stops when no active jobs
   - Indexed queries use less CPU and memory

3. **Database Load**:
   - Reduced from ~28,000 queries to ~9,000 queries per hour (67% reduction)
   - Lower average query time due to index usage
   - Better connection pool utilization

## Monitoring

After applying the indexes, monitor:
- Query execution time in Neon dashboard
- Total query count per hour
- Database compute usage
- Application response times

## Future Optimizations

For very large collections (10,000+ ordinals):
1. Add JSONB GIN indexes for trait filtering
2. Implement cursor-based pagination instead of offset
3. Cache COUNT queries with short TTL
4. Use materialized views for common aggregations

