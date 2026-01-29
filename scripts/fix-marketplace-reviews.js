#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function fixMarketplaceReviews() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    console.log('📋 Checking marketplace_reviews columns...');
    const columns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'marketplace_reviews'
      ORDER BY ordinal_position
    `);

    console.log('Current columns:');
    columns.rows.forEach(r => console.log(`  - ${r.column_name}`));

    const hasTransactionId = columns.rows.some(r => r.column_name === 'transaction_id');

    if (!hasTransactionId) {
      console.log('\n➕ Adding transaction_id column...');
      await client.query(`
        ALTER TABLE marketplace_reviews 
        ADD COLUMN IF NOT EXISTS transaction_id UUID;
      `);
      
      console.log('➕ Creating index...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_transaction 
        ON marketplace_reviews(transaction_id);
      `);
      
      console.log('✅ transaction_id added\n');
    } else {
      console.log('\n✅ transaction_id already exists\n');
    }

    // Show updated structure
    console.log('📊 Updated marketplace_reviews structure:');
    const updatedColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'marketplace_reviews'
      ORDER BY ordinal_position
    `);

    updatedColumns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
      console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}`);
    });

    console.log('\n🎉 marketplace_reviews is now complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

fixMarketplaceReviews().catch(console.error);
