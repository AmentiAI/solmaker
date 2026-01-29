/**
 * Script to grant 3000 credits to SigNullBtc wallet
 * Usage: node scripts/grant-credits-to-sigNullBtc.js
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

const CREDITS_TO_GRANT = 3000;

async function grantCredits() {
  try {
    // First, try to find the wallet address by username
    console.log('🔍 Finding wallet address for username "SigNullBtc"...\n');
    
    const profileResult = await sql`
      SELECT wallet_address, username 
      FROM profiles 
      WHERE LOWER(username) = LOWER('SigNullBtc')
      LIMIT 1
    `;
    
    let walletAddress;
    
    if (profileResult.length > 0) {
      walletAddress = profileResult[0].wallet_address;
      console.log(`✅ Found profile: ${profileResult[0].username}`);
      console.log(`   Wallet Address: ${walletAddress}\n`);
    } else {
      // Fallback: check if "SigNullBtc" is used as wallet address directly
      console.log('⚠️  No profile found, checking if "SigNullBtc" is a wallet address...\n');
      walletAddress = 'SigNullBtc';
    }
    
    console.log(`📊 Granting ${CREDITS_TO_GRANT} credits to ${walletAddress}...\n`);
    
    // Ensure credits table exists
    await sql`
      CREATE TABLE IF NOT EXISTS credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Add unique constraint if it doesn't exist
    try {
      await sql`ALTER TABLE credits ADD CONSTRAINT unique_wallet_address UNIQUE (wallet_address)`;
    } catch (e) {
      // Constraint might already exist, that's fine
    }
    
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_credits_wallet_address_unique ON credits (wallet_address)`;
    
    // Ensure credit_transactions table exists
    await sql`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        payment_txid TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Check if credits record exists
    const existing = await sql`
      SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
    `;
    
    if (existing.length > 0) {
      // Update existing credits
      await sql`
        UPDATE credits
        SET credits = credits + ${CREDITS_TO_GRANT}, updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ${walletAddress}
      `;
      console.log(`✅ Updated credits for ${walletAddress}`);
    } else {
      // Create new credits record
      await sql`
        INSERT INTO credits (wallet_address, credits)
        VALUES (${walletAddress}, ${CREDITS_TO_GRANT})
      `;
      console.log(`✅ Created new credits record for ${walletAddress}`);
    }
    
    // Record transaction
    await sql`
      INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
      VALUES (${walletAddress}, ${CREDITS_TO_GRANT}, 'purchase', 'Initial grant of 3000 credits')
    `;
    
    // Verify the credits were added
    const result = await sql`
      SELECT credits FROM credits WHERE wallet_address = ${walletAddress} LIMIT 1
    `;
    
    if (result.length > 0) {
      console.log(`\n✅ Successfully granted ${CREDITS_TO_GRANT} credits to ${walletAddress}`);
      console.log(`📊 Total credits: ${result[0].credits}\n`);
    } else {
      throw new Error('Failed to verify credits were added');
    }
    
  } catch (error) {
    console.error('❌ Error granting credits:', error);
    process.exit(1);
  }
}

grantCredits();
