/**
 * Script to find the wallet address for user with username "SigNullBtc"
 * Usage: node scripts/find-sigNullBtc-wallet.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function findSigNullBtcWallet() {
  try {
    console.log('🔍 Searching for wallet address with username "SigNullBtc"...\n');
    
    // Check profiles table
    const profileResult = await sql`
      SELECT wallet_address, username, display_name 
      FROM profiles 
      WHERE LOWER(username) = LOWER('SigNullBtc')
      LIMIT 1
    `;
    
    if (profileResult.length > 0) {
      const profile = profileResult[0];
      console.log('✅ Found profile:');
      console.log(`   Wallet Address: ${profile.wallet_address}`);
      console.log(`   Username: ${profile.username}`);
      console.log(`   Display Name: ${profile.display_name || 'N/A'}\n`);
      
      // Check if this wallet has credits
      const creditsResult = await sql`
        SELECT credits FROM credits WHERE wallet_address = ${profile.wallet_address} LIMIT 1
      `;
      
      if (creditsResult.length > 0) {
        console.log(`💰 Current credits: ${creditsResult[0].credits}`);
      } else {
        console.log('💰 No credits record found for this wallet');
      }
      
      return profile.wallet_address;
    } else {
      console.log('❌ No profile found with username "SigNullBtc"');
      console.log('\n📋 All profiles in database:');
      const allProfiles = await sql`
        SELECT wallet_address, username, display_name 
        FROM profiles 
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      if (allProfiles.length > 0) {
        allProfiles.forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.username} (${p.wallet_address.substring(0, 20)}...)`);
        });
      } else {
        console.log('   No profiles found in database');
      }
      
      // Check if "SigNullBtc" is used as a wallet address directly
      console.log('\n🔍 Checking if "SigNullBtc" is used as a wallet address...');
      const directWalletCheck = await sql`
        SELECT credits FROM credits WHERE LOWER(wallet_address) = LOWER('SigNullBtc') LIMIT 1
      `;
      
      if (directWalletCheck.length > 0) {
        console.log('✅ Found credits record with "SigNullBtc" as wallet address');
        console.log(`💰 Credits: ${directWalletCheck[0].credits}`);
        return 'SigNullBtc';
      }
      
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findSigNullBtcWallet();

