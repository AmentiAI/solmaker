/**
 * Script to verify and fix the credits column type
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

async function verifyAndFix() {
  try {
    console.log('📊 Checking credits column type...\n');
    
    // Check current type
    const creditsCheck = await sql`
      SELECT 
        column_name, 
        data_type, 
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = 'credits' AND column_name = 'credits'
    `;
    
    const creditsArray = Array.isArray(creditsCheck) ? creditsCheck : [creditsCheck];
    if (creditsArray.length > 0) {
      const col = creditsArray[0];
      console.log('Current credits column type:', col.data_type, col.numeric_precision, col.numeric_scale);
      
      if (col.data_type === 'integer' || col.data_type === 'bigint') {
        console.log('\n⚠️  Credits column is still INTEGER. Converting to DECIMAL...');
        await sql`ALTER TABLE credits ALTER COLUMN credits TYPE DECIMAL(10, 2) USING credits::DECIMAL(10, 2)`;
        console.log('✅ Credits column converted to DECIMAL(10,2)');
      } else {
        console.log('✅ Credits column is already DECIMAL');
      }
    } else {
      console.log('⚠️  Credits table or column not found');
    }
    
    // Check credit_transactions
    const transactionsCheck = await sql`
      SELECT 
        column_name, 
        data_type, 
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = 'credit_transactions' AND column_name = 'amount'
    `;
    
    const transactionsArray = Array.isArray(transactionsCheck) ? transactionsCheck : [transactionsCheck];
    if (transactionsArray.length > 0) {
      const col = transactionsArray[0];
      console.log('\nCurrent credit_transactions.amount column type:', col.data_type, col.numeric_precision, col.numeric_scale);
      
      if (col.data_type === 'integer' || col.data_type === 'bigint') {
        console.log('\n⚠️  Amount column is still INTEGER. Converting to DECIMAL...');
        await sql`ALTER TABLE credit_transactions ALTER COLUMN amount TYPE DECIMAL(10, 2) USING amount::DECIMAL(10, 2)`;
        console.log('✅ Amount column converted to DECIMAL(10,2)');
      } else {
        console.log('✅ Amount column is already DECIMAL');
      }
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyAndFix();

