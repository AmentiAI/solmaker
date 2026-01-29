/**
 * Script to verify and add wallet_address column if missing
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

async function verifyAndAddColumn() {
  try {
    console.log('🔍 Checking if wallet_address column exists...\n');
    
    // Check if column exists
    const checkResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'wallet_address'
    `;
    
    if (checkResult.length > 0) {
      console.log('✅ wallet_address column already exists in collections table');
    } else {
      console.log('⚠️  wallet_address column not found. Adding it now...\n');
      
      // Add the column
      await sql`
        ALTER TABLE collections
        ADD COLUMN wallet_address TEXT
      `;
      
      console.log('✅ Added wallet_address column to collections table');
      
      // Create index
      try {
        await sql`
          CREATE INDEX idx_collections_wallet_address 
          ON collections (wallet_address)
        `;
        console.log('✅ Created index on wallet_address');
      } catch (e) {
        if (e?.message?.includes('already exists')) {
          console.log('⏭️  Index already exists');
        } else {
          throw e;
        }
      }
    }
    
    // Verify it exists now
    const verifyResult = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name = 'wallet_address'
    `;
    
    if (verifyResult.length > 0) {
      console.log('\n✅ Verification successful!');
      console.log(`   Column: ${verifyResult[0].column_name}`);
      console.log(`   Type: ${verifyResult[0].data_type}\n`);
    } else {
      throw new Error('Column still not found after adding');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyAndAddColumn();

