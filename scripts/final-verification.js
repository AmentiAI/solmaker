#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function finalVerification() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...\n');
    await client.connect();

    // Check table count
    const tables = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tableCount = parseInt(tables.rows[0].count);
    
    console.log(`📊 Tables: ${tableCount}/38 ${tableCount >= 38 ? '✅' : '❌'}`);

    // Check critical tables
    const criticalTables = ['profiles', 'credits', 'pending_payments', 'collections', 'marketplace_reviews', 'collection_marketplace_listings', 'marketplace_transactions'];
    for (const table of criticalTables) {
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      console.log(`  ${exists.rows[0].exists ? '✅' : '❌'} ${table}`);
    }

    // Check critical columns
    console.log('\n📋 Critical Columns:');
    const criticalColumns = [
      ['profiles', 'wallet_type'],
      ['profiles', 'opt_in'],
      ['pending_payments', 'payment_type'],
      ['pending_payments', 'network'],
      ['marketplace_reviews', 'collection_id']
    ];

    for (const [table, column] of criticalColumns) {
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        )
      `, [table, column]);
      console.log(`  ${exists.rows[0].exists ? '✅' : '❌'} ${table}.${column}`);
    }

    // Check RPC configuration
    console.log('\n🌐 Configuration:');
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    const isHelius = rpcUrl?.includes('helius');
    console.log(`  ${isHelius ? '✅' : '⚠️ '} Solana RPC: ${isHelius ? 'Helius (Good!)' : 'Public (May have rate limits)'}`);
    console.log(`  ${process.env.SOL_PAYMENT_ADDRESS ? '✅' : '❌'} SOL Payment Address`);

    console.log('\n🎉 Verification Complete!\n');

    if (tableCount >= 36 && isHelius) {
      console.log('✨ Everything is ready! You can now:');
      console.log('   1. Connect your Solana wallet');
      console.log('   2. Create/edit your profile');
      console.log('   3. Buy credits with SOL');
      console.log('   4. Use all platform features\n');
    } else {
      console.log('⚠️  Some issues detected. Run appropriate setup scripts.\n');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await client.end();
  }
}

finalVerification().catch(console.error);
