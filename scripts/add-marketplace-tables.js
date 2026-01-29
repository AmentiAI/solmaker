#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function addMarketplaceTables() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Create collection_marketplace_listings
    console.log('1️⃣ Creating collection_marketplace_listings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS collection_marketplace_listings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL,
        seller_wallet TEXT NOT NULL,
        price_credits DECIMAL(10,2),
        price_btc DECIMAL(18,8),
        seller_btc_address TEXT,
        payment_type TEXT DEFAULT 'credits',
        status TEXT DEFAULT 'active',
        title TEXT,
        description TEXT,
        sold_to_wallet TEXT,
        sold_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_marketplace_listings_collection 
      ON collection_marketplace_listings(collection_id);
      
      CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller 
      ON collection_marketplace_listings(seller_wallet);
      
      CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status 
      ON collection_marketplace_listings(status);
    `);
    console.log('   ✅ collection_marketplace_listings created\n');

    // Create marketplace_transactions
    console.log('2️⃣ Creating marketplace_transactions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id UUID NOT NULL,
        buyer_wallet TEXT NOT NULL,
        seller_wallet TEXT NOT NULL,
        collection_id UUID,
        price_credits DECIMAL(10,2),
        price_btc DECIMAL(18,8),
        payment_type TEXT DEFAULT 'credits',
        btc_amount DECIMAL(18,8),
        btc_txid TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_marketplace_tx_listing 
      ON marketplace_transactions(listing_id);
      
      CREATE INDEX IF NOT EXISTS idx_marketplace_tx_buyer 
      ON marketplace_transactions(buyer_wallet);
      
      CREATE INDEX IF NOT EXISTS idx_marketplace_tx_seller 
      ON marketplace_transactions(seller_wallet);
    `);
    console.log('   ✅ marketplace_transactions created\n');

    console.log('🎉 Marketplace tables created successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

addMarketplaceTables().catch(console.error);
