#!/usr/bin/env node

const { Client } = require('pg');

// Database connection configuration (same as migration scripts)
const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Wallet address to check
const walletAddress = 'bc1pvp5axlxx0k2j5w4afurf70m5v5qplkr44lswl2z8z6zpy0sx32ts2f5r82';

async function checkPaymentAddress() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log(`🔍 Checking payment address for wallet: ${walletAddress}`);
    console.log(`   Address length: ${walletAddress.length} characters\n`);

    const result = await client.query(
      `SELECT 
        wallet_address,
        payment_address,
        username,
        CASE 
          WHEN payment_address IS NULL THEN 'NULL'
          WHEN payment_address = '' THEN 'EMPTY_STRING'
          WHEN TRIM(payment_address) = '' THEN 'WHITESPACE_ONLY'
          ELSE 'HAS_VALUE'
        END as payment_address_status,
        LENGTH(payment_address) as payment_address_length,
        created_at,
        updated_at
      FROM profiles 
      WHERE wallet_address = $1
      LIMIT 1`,
      [walletAddress]
    );

    if (result.rows.length === 0) {
      console.log('❌ No profile found for this wallet address.\n');
      console.log('This wallet address does not exist in the profiles table.');
    } else {
      const profile = result.rows[0];
      console.log('✅ Profile found:\n');
      console.log('─'.repeat(70));
      console.log(`Wallet Address:     ${profile.wallet_address}`);
      console.log(`Username:           ${profile.username || '(null)'}`);
      console.log(`Payment Address:    ${profile.payment_address || '(null)'}`);
      console.log(`Payment Status:     ${profile.payment_address_status}`);
      
      if (profile.payment_address) {
        console.log(`Payment Length:      ${profile.payment_address_length} characters`);
      } else {
        console.log(`Payment Length:      N/A (no payment address)`);
      }
      
      console.log(`Created At:         ${profile.created_at}`);
      console.log(`Updated At:         ${profile.updated_at}`);
      console.log('─'.repeat(70));
      
      // Final verdict
      console.log('\n📊 VERDICT:');
      if (profile.payment_address_status === 'NULL') {
        console.log('❌ Payment address is NULL in the database');
      } else if (profile.payment_address_status === 'EMPTY_STRING') {
        console.log('❌ Payment address is an empty string in the database');
      } else if (profile.payment_address_status === 'WHITESPACE_ONLY') {
        console.log('❌ Payment address contains only whitespace in the database');
      } else if (profile.payment_address === profile.wallet_address) {
        console.log(`⚠️  Payment address EXISTS but equals wallet address (INVALID)`);
        console.log(`   This is why the admin shows "No payment address"`);
        console.log(`   Payment address should be a different P2SH-P2WPKH address from LaserEyes`);
      } else {
        console.log(`✅ Payment address EXISTS and is different from wallet address: ${profile.payment_address}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed.');
  }
}

checkPaymentAddress();
