const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function run() {
  console.log('🚀 Running marketplace BTC payments migration...\n');

  try {
    // 1. Add BTC pricing columns to marketplace listings
    console.log('1. Adding BTC pricing columns to marketplace listings...');
    await sql`ALTER TABLE collection_marketplace_listings ADD COLUMN IF NOT EXISTS price_btc DECIMAL(18, 8) DEFAULT NULL`;
    await sql`ALTER TABLE collection_marketplace_listings ADD COLUMN IF NOT EXISTS seller_btc_address VARCHAR(255) DEFAULT NULL`;
    console.log('   ✅ Added price_btc and seller_btc_address columns');

    // Add payment_type with a check constraint - need to use unsafe for this
    try {
      await sql`ALTER TABLE collection_marketplace_listings ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'credits'`;
      console.log('   ✅ Added payment_type column');
    } catch (e) {
      console.log('   ℹ️ payment_type column may already exist');
    }

    // Update existing rows
    await sql`UPDATE collection_marketplace_listings SET payment_type = 'credits' WHERE payment_type IS NULL`;
    console.log('   ✅ Updated existing listings to credits payment type');

    // 2. Create marketplace pending payments table
    console.log('\n2. Creating marketplace_pending_payments table...');
    await sql`
      CREATE TABLE IF NOT EXISTS marketplace_pending_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id UUID NOT NULL,
        buyer_wallet VARCHAR(255) NOT NULL,
        seller_wallet VARCHAR(255) NOT NULL,
        btc_amount DECIMAL(18, 8) NOT NULL,
        btc_amount_sats BIGINT NOT NULL,
        payment_address VARCHAR(255) NOT NULL,
        payment_txid VARCHAR(255),
        confirmations INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ
      )
    `;
    console.log('   ✅ Created marketplace_pending_payments table');

    // 3. Add BTC columns to marketplace_transactions
    console.log('\n3. Adding BTC columns to marketplace_transactions...');
    await sql`ALTER TABLE marketplace_transactions ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'credits'`;
    await sql`ALTER TABLE marketplace_transactions ADD COLUMN IF NOT EXISTS btc_amount DECIMAL(18, 8)`;
    await sql`ALTER TABLE marketplace_transactions ADD COLUMN IF NOT EXISTS btc_txid VARCHAR(255)`;
    console.log('   ✅ Added payment_type, btc_amount, btc_txid columns');

    // 4. Create indexes
    console.log('\n4. Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_pending_status ON marketplace_pending_payments(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_pending_listing ON marketplace_pending_payments(listing_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_marketplace_pending_buyer ON marketplace_pending_payments(buyer_wallet)`;
    console.log('   ✅ Created indexes');

    // 5. Update the transfer function
    console.log('\n5. Updating transfer_collection_ownership function...');
    
    // Check current schema of promotions table to get correct column type for collection_id
    const promoSchema = await sql`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'promotions' AND column_name = 'collection_id'
    `;
    const collectionIdType = promoSchema[0]?.data_type || 'uuid';
    console.log('   ℹ️ Promotions collection_id type:', collectionIdType);

    // Create the updated function based on schema
    if (collectionIdType === 'uuid') {
      await sql`
        CREATE OR REPLACE FUNCTION transfer_collection_ownership(
          p_collection_id UUID,
          p_from_wallet VARCHAR(255),
          p_to_wallet VARCHAR(255),
          p_listing_id UUID
        )
        RETURNS BOOLEAN AS $$
        BEGIN
          UPDATE collections
          SET wallet_address = p_to_wallet,
              marketplace_status = 'sold',
              marketplace_listing_id = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_collection_id
          AND wallet_address = p_from_wallet;

          IF NOT FOUND THEN
            RETURN FALSE;
          END IF;

          UPDATE collection_marketplace_listings
          SET status = 'sold',
              sold_to_wallet = p_to_wallet,
              sold_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_listing_id
          AND seller_wallet = p_from_wallet;

          UPDATE promotions
          SET wallet_address = p_to_wallet
          WHERE collection_id = p_collection_id
          AND wallet_address = p_from_wallet;

          DELETE FROM collection_collaborators
          WHERE collection_id = p_collection_id::text;

          RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql
      `;
    } else {
      // Integer or text type
      await sql`
        CREATE OR REPLACE FUNCTION transfer_collection_ownership(
          p_collection_id UUID,
          p_from_wallet VARCHAR(255),
          p_to_wallet VARCHAR(255),
          p_listing_id UUID
        )
        RETURNS BOOLEAN AS $$
        BEGIN
          UPDATE collections
          SET wallet_address = p_to_wallet,
              marketplace_status = 'sold',
              marketplace_listing_id = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_collection_id
          AND wallet_address = p_from_wallet;

          IF NOT FOUND THEN
            RETURN FALSE;
          END IF;

          UPDATE collection_marketplace_listings
          SET status = 'sold',
              sold_to_wallet = p_to_wallet,
              sold_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = p_listing_id
          AND seller_wallet = p_from_wallet;

          UPDATE promotions
          SET wallet_address = p_to_wallet
          WHERE collection_id::text = p_collection_id::text
          AND wallet_address = p_from_wallet;

          DELETE FROM collection_collaborators
          WHERE collection_id = p_collection_id::text;

          RETURN TRUE;
        END;
        $$ LANGUAGE plpgsql
      `;
    }
    console.log('   ✅ Updated transfer_collection_ownership function');

    // Verify
    console.log('\n6. Verifying migration...');
    const cols = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'collection_marketplace_listings' 
      AND column_name IN ('price_btc', 'seller_btc_address', 'payment_type')
    `;
    console.log('   Marketplace listing columns:', cols.map(c => c.column_name).join(', '));

    const pendingTable = await sql`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_pending_payments')
    `;
    console.log('   marketplace_pending_payments table:', pendingTable[0].exists ? '✅ exists' : '❌ missing');

    console.log('\n✅ Migration completed successfully!');
  } catch (e) {
    console.error('\n❌ Migration failed:', e.message);
    process.exit(1);
  }
}

run();

