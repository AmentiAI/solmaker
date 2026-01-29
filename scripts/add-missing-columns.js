#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.NEON_DATABASE;

if (!DATABASE_URL) {
  console.error('❌ NEON_DATABASE environment variable is not set');
  process.exit(1);
}

async function addMissingColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('📋 Adding missing columns...\n');

    // 1. Add wallet_type to profiles
    console.log('1️⃣ Adding wallet_type to profiles...');
    await client.query(`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'sol';
    `);
    console.log('   ✅ wallet_type added\n');

    // 2. Check if marketplace_reviews needs collection_id
    console.log('2️⃣ Checking marketplace_reviews structure...');
    const reviewsColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'marketplace_reviews'
    `);
    
    if (reviewsColumns.rows.length === 0) {
      console.log('   ⚠️  marketplace_reviews table does not exist, creating it...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_reviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          listing_id UUID NOT NULL,
          collection_id UUID,
          reviewer_wallet TEXT NOT NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          review_text TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing 
        ON marketplace_reviews(listing_id);
        
        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_collection 
        ON marketplace_reviews(collection_id);
        
        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_reviewer 
        ON marketplace_reviews(reviewer_wallet);
      `);
      console.log('   ✅ marketplace_reviews table created\n');
    } else {
      console.log('   ✓ marketplace_reviews exists');
      
      // Check if collection_id exists
      const hasCollectionId = reviewsColumns.rows.some(r => r.column_name === 'collection_id');
      if (!hasCollectionId) {
        console.log('   Adding collection_id column...');
        await client.query(`
          ALTER TABLE marketplace_reviews 
          ADD COLUMN IF NOT EXISTS collection_id UUID;
          
          CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_collection 
          ON marketplace_reviews(collection_id);
        `);
        console.log('   ✅ collection_id added\n');
      } else {
        console.log('   ✓ collection_id already exists\n');
      }
    }

    // 3. Add network column to pending_payments if missing
    console.log('3️⃣ Checking pending_payments for network column...');
    const paymentsColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pending_payments' 
      AND column_name = 'network'
    `);
    
    if (paymentsColumns.rows.length === 0) {
      console.log('   Adding network column...');
      await client.query(`
        ALTER TABLE pending_payments 
        ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'solana';
      `);
      console.log('   ✅ network added\n');
    } else {
      console.log('   ✓ network already exists\n');
    }

    // 4. Verify profiles structure
    console.log('4️⃣ Verifying profiles table structure...');
    const profilesColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles'
      ORDER BY ordinal_position
    `);
    
    console.log('   Profiles columns:');
    profilesColumns.rows.forEach(r => console.log(`     - ${r.column_name}`));
    
    // 5. Update default wallet_type for existing records
    console.log('\n5️⃣ Updating existing profiles with default wallet_type...');
    const updateResult = await client.query(`
      UPDATE profiles 
      SET wallet_type = 'sol' 
      WHERE wallet_type IS NULL
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} profiles\n`);

    console.log('🎉 All missing columns added successfully!');
    console.log('✨ Database is now fully compatible\n');

  } catch (error) {
    console.error('❌ Failed to add columns:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  addMissingColumns().catch(console.error);
}

module.exports = { addMissingColumns };
