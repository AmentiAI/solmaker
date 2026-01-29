/**
 * Script to run the decimal credits migration
 * Changes credits from INTEGER to DECIMAL to support fractional credits (0.05 per trait)
 * Usage: node scripts/run-decimal-credits-migration.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function runMigration() {
  try {
    console.log('📊 Applying decimal credits migration...\n');
    console.log('This will change credits from INTEGER to DECIMAL(10,2) to support fractional credits.\n');
    
    const migrationPath = join(__dirname, 'migrations', '022_change_credits_to_decimal.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Execute the migration SQL directly (it uses DO $$ block)
    try {
      await sql.unsafe(migrationSQL);
      console.log('✅ Migration executed successfully!');
      console.log('📝 Credits column changed to DECIMAL(10,2)');
      console.log('📝 Credit transactions amount column changed to DECIMAL(10,2)');
      console.log('\n✅ Migration completed successfully!');
      console.log('💰 You can now use fractional credits (e.g., 0.25 credits for 5 traits).\n');
    } catch (error) {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('already exists') || 
          errorMsg.includes('duplicate') ||
          errorMsg.includes('does not exist')) {
        console.log('⏭️  Migration may have already been applied or columns do not exist');
        console.log('Error details:', errorMsg);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error?.message || String(error));
    process.exit(1);
  }
}

runMigration();

