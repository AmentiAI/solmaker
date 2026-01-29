const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Marketplace Reviews Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    console.log('\n[1/9] Creating marketplace_reviews table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS marketplace_reviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          transaction_id UUID NOT NULL REFERENCES marketplace_transactions(id) ON DELETE CASCADE,
          listing_id UUID NOT NULL REFERENCES collection_marketplace_listings(id) ON DELETE CASCADE,
          collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          seller_wallet VARCHAR(255) NOT NULL,
          buyer_wallet VARCHAR(255) NOT NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          review_text TEXT,
          buyer_username VARCHAR(255),
          is_visible BOOLEAN DEFAULT TRUE,
          is_edited BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT one_review_per_transaction UNIQUE (transaction_id),
          CONSTRAINT one_review_per_buyer_listing UNIQUE (listing_id, buyer_wallet)
        )
      `
      console.log('✅ Table created')
    } catch (error) {
      const errorMsg = error?.message || String(error)
      if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
        console.log('⏭️  Table already exists')
      } else {
        console.error('❌ Error:', errorMsg)
        throw error
      }
    }

    console.log('\n[2/9] Creating seller index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_seller ON marketplace_reviews(seller_wallet)`
    console.log('✅ Index created')

    console.log('\n[3/9] Creating buyer index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_buyer ON marketplace_reviews(buyer_wallet)`
    console.log('✅ Index created')

    console.log('\n[4/9] Creating listing index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id)`
    console.log('✅ Index created')

    console.log('\n[5/9] Creating collection index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_collection ON marketplace_reviews(collection_id)`
    console.log('✅ Index created')

    console.log('\n[6/9] Creating transaction index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_transaction ON marketplace_reviews(transaction_id)`
    console.log('✅ Index created')

    console.log('\n[7/9] Creating visible index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_visible ON marketplace_reviews(is_visible) WHERE is_visible = TRUE`
    console.log('✅ Index created')

    console.log('\n[8/9] Creating rating index...')
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_rating ON marketplace_reviews(rating)`
    console.log('✅ Index created')

    console.log('\n[9/9] Adding comments...')
    await sql`COMMENT ON TABLE marketplace_reviews IS 'Buyer reviews and ratings for marketplace purchases'`
    await sql`COMMENT ON COLUMN marketplace_reviews.rating IS 'Star rating from 1 to 5'`
    await sql`COMMENT ON COLUMN marketplace_reviews.buyer_username IS 'Denormalized username for display performance'`
    await sql`COMMENT ON COLUMN marketplace_reviews.is_visible IS 'Whether the review is visible to the public'`
    console.log('✅ Comments added')

    console.log('\n' + '='.repeat(50))
    console.log('✅ Marketplace Reviews Migration completed successfully!')
    console.log('='.repeat(50))
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()

