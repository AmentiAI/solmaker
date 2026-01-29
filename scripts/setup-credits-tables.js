#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.NEON_DATABASE;

if (!DATABASE_URL) {
  console.error('❌ NEON_DATABASE environment variable is not set');
  process.exit(1);
}

async function setupCreditsTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    console.log('\n📋 Setting up credits system tables...\n');

    // 1. Create credits table
    console.log('1️⃣ Creating credits table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        credits DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ Credits table ready');

    // 2. Create unique index on wallet_address
    console.log('2️⃣ Creating unique index on wallet_address...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_credits_wallet_address_unique 
      ON credits (wallet_address);
    `);
    console.log('   ✅ Unique index created');

    // 3. Create credit_transactions table
    console.log('3️⃣ Creating credit_transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        payment_txid TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ Credit transactions table ready');

    // 4. Create index on credit_transactions wallet_address
    console.log('4️⃣ Creating index on credit_transactions...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet_address 
      ON credit_transactions (wallet_address);
    `);
    console.log('   ✅ Index created');

    // 5. Create pending_payments table with Solana support
    console.log('5️⃣ Creating pending_payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        credits_amount DECIMAL(10, 2) NOT NULL,
        bitcoin_amount DECIMAL(18, 8),
        payment_amount DECIMAL(20, 9),
        payment_usd DECIMAL(10, 2),
        payment_address TEXT NOT NULL,
        payment_txid TEXT,
        confirmations INTEGER DEFAULT 0,
        payment_type TEXT DEFAULT 'btc',
        network TEXT DEFAULT 'bitcoin',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );
    `);
    console.log('   ✅ Pending payments table ready');

    // 6. Create indexes on pending_payments
    console.log('6️⃣ Creating indexes on pending_payments...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_payments_wallet_address 
      ON pending_payments (wallet_address);
      
      CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_address 
      ON pending_payments (payment_address);
      
      CREATE INDEX IF NOT EXISTS idx_pending_payments_status 
      ON pending_payments (status);
      
      CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_type 
      ON pending_payments (payment_type);
      
      CREATE INDEX IF NOT EXISTS idx_pending_payments_network 
      ON pending_payments (network);
      
      CREATE INDEX IF NOT EXISTS idx_pending_payments_status_type 
      ON pending_payments (status, payment_type);
    `);
    console.log('   ✅ All indexes created');

    // 7. Verify tables exist
    console.log('\n🔍 Verifying tables...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('credits', 'credit_transactions', 'pending_payments')
      ORDER BY table_name;
    `);

    console.log('\n📊 Created tables:');
    tables.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // 8. Show pending_payments structure
    console.log('\n📋 pending_payments table structure:');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'pending_payments'
      ORDER BY ordinal_position;
    `);

    columns.rows.forEach(row => {
      const defaultVal = row.column_default ? ` (default: ${row.column_default})` : '';
      console.log(`  - ${row.column_name}: ${row.data_type}${defaultVal}`);
    });

    // 9. Check if any pending payments exist
    const pendingCount = await client.query(`
      SELECT COUNT(*) as count FROM pending_payments;
    `);
    console.log(`\n📈 Total pending payments: ${pendingCount.rows[0].count}`);

    // 10. Check if any credits exist
    const creditsCount = await client.query(`
      SELECT COUNT(*) as count FROM credits;
    `);
    console.log(`📈 Total users with credits: ${creditsCount.rows[0].count}`);

    console.log('\n🎉 Credits system setup completed successfully!');
    console.log('✨ The database now supports Solana, Bitcoin, and Ethereum payments');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the setup
if (require.main === module) {
  setupCreditsTables().catch(console.error);
}

module.exports = { setupCreditsTables };
