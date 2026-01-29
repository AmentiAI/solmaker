#!/usr/bin/env node

const { Client } = require('pg');

// Database connection configuration (same as migration scripts)
const DATABASE_URL = process.env.NEON_DATABASE || 
                     process.env.DATABASE_URL || 
                     'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Get wallet address from command line arguments
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.error('❌ Error: Wallet address is required.');
  console.log('\nUsage: node scripts/query-wallet.js <wallet_address>');
  console.log('Example: node scripts/query-wallet.js bc1pvp5axlxx0k2j5w4afurf70m5v5qplkr44lswl2z8z6zpy0sx32ts2f5r82');
  process.exit(1);
}

async function queryWallet() {
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

    // Query exact match
    console.log(`🔍 Querying for wallet address: ${walletAddress}`);
    console.log(`   Address length: ${walletAddress.length} characters\n`);

    const exactMatch = await client.query(
      `SELECT 
        wallet_address,
        payment_address,
        username,
        display_name,
        bio,
        avatar_url,
        wallet_type,
        opt_in,
        created_at,
        updated_at,
        LENGTH(wallet_address) as wallet_address_length,
        LENGTH(payment_address) as payment_address_length
      FROM profiles 
      WHERE wallet_address = $1
      LIMIT 1`,
      [walletAddress]
    );

    if (exactMatch.rows.length > 0) {
      console.log('✅ EXACT MATCH FOUND:\n');
      const profile = exactMatch.rows[0];
      console.log('Profile Details:');
      console.log('─'.repeat(60));
      console.log(`Wallet Address:     ${profile.wallet_address}`);
      console.log(`  Length:           ${profile.wallet_address_length} chars`);
      console.log(`Payment Address:    ${profile.payment_address || '(null)'}`);
      if (profile.payment_address) {
        console.log(`  Length:           ${profile.payment_address_length} chars`);
      }
      console.log(`Username:           ${profile.username || '(null)'}`);
      console.log(`Display Name:       ${profile.display_name || '(null)'}`);
      console.log(`Bio:                ${profile.bio || '(null)'}`);
      console.log(`Avatar URL:         ${profile.avatar_url || '(null)'}`);
      console.log(`Wallet Type:        ${profile.wallet_type || '(null)'}`);
      console.log(`Opt In:             ${profile.opt_in ? 'true' : 'false'}`);
      console.log(`Created At:         ${profile.created_at}`);
      console.log(`Updated At:         ${profile.updated_at}`);
      console.log('─'.repeat(60));
      
      // Check if addresses match
      if (profile.wallet_address === walletAddress) {
        console.log('\n✅ Addresses match exactly!');
      } else {
        console.log('\n⚠️  WARNING: Addresses do not match exactly!');
        console.log(`   Expected: ${walletAddress}`);
        console.log(`   Found:    ${profile.wallet_address}`);
      }
    } else {
      console.log('❌ No exact match found.\n');
      
      // Try to find similar addresses (case-insensitive, partial match)
      console.log('🔍 Searching for similar addresses...\n');
      
      // Try case-insensitive match
      const caseInsensitive = await client.query(
        `SELECT wallet_address, LENGTH(wallet_address) as addr_length
         FROM profiles 
         WHERE LOWER(wallet_address) = LOWER($1)
         LIMIT 5`,
        [walletAddress]
      );
      
      if (caseInsensitive.rows.length > 0) {
        console.log('⚠️  Found case-insensitive matches:');
        caseInsensitive.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.wallet_address} (length: ${row.addr_length})`);
        });
        console.log();
      }
      
      // Try partial match (first/last characters)
      const firstChars = walletAddress.substring(0, 10);
      const lastChars = walletAddress.substring(walletAddress.length - 10);
      
      const partialMatch = await client.query(
        `SELECT wallet_address, LENGTH(wallet_address) as addr_length
         FROM profiles 
         WHERE wallet_address LIKE $1 OR wallet_address LIKE $2
         LIMIT 10`,
        [`${firstChars}%`, `%${lastChars}`]
      );
      
      if (partialMatch.rows.length > 0) {
        console.log('⚠️  Found partial matches (first/last 10 chars):');
        partialMatch.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.wallet_address} (length: ${row.addr_length})`);
        });
        console.log();
      }
      
      // Show all profiles with similar length
      const similarLength = await client.query(
        `SELECT wallet_address, LENGTH(wallet_address) as addr_length
         FROM profiles 
         WHERE LENGTH(wallet_address) = $1
         LIMIT 10`,
        [walletAddress.length]
      );
      
      if (similarLength.rows.length > 0) {
        console.log(`ℹ️  Found ${similarLength.rows.length} profile(s) with same address length (${walletAddress.length}):`);
        similarLength.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.wallet_address}`);
        });
        console.log();
      }
      
      // Show total profile count
      const totalCount = await client.query('SELECT COUNT(*) as count FROM profiles');
      console.log(`ℹ️  Total profiles in database: ${totalCount.rows[0].count}`);
    }

    // Also check for any profiles with this address as payment_address
    const paymentMatch = await client.query(
      `SELECT wallet_address, payment_address, username
       FROM profiles 
       WHERE payment_address = $1
       LIMIT 5`,
      [walletAddress]
    );

    if (paymentMatch.rows.length > 0) {
      console.log('\n📋 Found profiles with this address as payment_address:');
      paymentMatch.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. Wallet: ${row.wallet_address}, Username: ${row.username || '(none)'}`);
      });
    }

    // Check other tables where this wallet might exist (explains why admin shows it)
    console.log('\n🔍 Checking other tables for wallet activity...\n');

    // Check credits table
    const creditsMatch = await client.query(
      `SELECT wallet_address, credits, created_at, updated_at
       FROM credits 
       WHERE wallet_address = $1
       LIMIT 5`,
      [walletAddress]
    );
    if (creditsMatch.rows.length > 0) {
      console.log('💰 Found in credits table:');
      creditsMatch.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. Credits: ${row.credits}, Created: ${row.created_at}, Updated: ${row.updated_at}`);
      });
    }

    // Check pending_payments table
    const pendingPaymentsMatch = await client.query(
      `SELECT wallet_address, status, bitcoin_amount, credits_amount, payment_txid, created_at
       FROM pending_payments 
       WHERE wallet_address = $1
       LIMIT 5`,
      [walletAddress]
    );
    if (pendingPaymentsMatch.rows.length > 0) {
      console.log('\n💳 Found in pending_payments table:');
      pendingPaymentsMatch.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. Status: ${row.status}, BTC: ${row.bitcoin_amount}, Credits: ${row.credits_amount}, TXID: ${row.payment_txid || '(none)'}, Created: ${row.created_at}`);
      });
    }

    // Check credit_transactions table
    const creditTransactionsMatch = await client.query(
      `SELECT wallet_address, transaction_type, amount, created_at
       FROM credit_transactions 
       WHERE wallet_address = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [walletAddress]
    );
    if (creditTransactionsMatch.rows.length > 0) {
      console.log('\n📊 Found in credit_transactions table:');
      creditTransactionsMatch.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. Type: ${row.transaction_type}, Amount: ${row.amount}, Date: ${row.created_at}`);
      });
    }

    // Check collections table
    const collectionsMatch = await client.query(
      `SELECT id, name, wallet_address, created_at
       FROM collections 
       WHERE wallet_address = $1
       LIMIT 5`,
      [walletAddress]
    );
    if (collectionsMatch.rows.length > 0) {
      console.log('\n🎨 Found in collections table:');
      collectionsMatch.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. Collection: ${row.name || row.id}, Created: ${row.created_at}`);
      });
    }

    // Summary
    const hasActivity = creditsMatch.rows.length > 0 || 
                       pendingPaymentsMatch.rows.length > 0 || 
                       creditTransactionsMatch.rows.length > 0 ||
                       collectionsMatch.rows.length > 0;
    
    if (hasActivity && exactMatch.rows.length === 0) {
      console.log('\n⚠️  SUMMARY: This wallet has activity in other tables but NO PROFILE exists!');
      console.log('   This explains why the admin page shows the wallet but says "No profile".');
      console.log('   The profile creation likely failed or was never triggered.');
    }

  } catch (error) {
    console.error('❌ Query failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the query
if (require.main === module) {
  queryWallet().catch(console.error);
}

module.exports = { queryWallet };

