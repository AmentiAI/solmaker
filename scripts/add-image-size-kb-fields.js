/**
 * Script to add image size KB fields to generated_ordinals table
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

async function addColumns() {
  try {
    console.log('📊 Adding image size KB fields...\n');
    
    try {
      await sql`
        ALTER TABLE generated_ordinals
        ADD COLUMN IF NOT EXISTS original_size_kb DECIMAL(10, 2)
      `;
      console.log('✅ Added original_size_kb to generated_ordinals table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  original_size_kb already exists in generated_ordinals');
      } else {
        throw error;
      }
    }
    
    try {
      await sql`
        ALTER TABLE generated_ordinals
        ADD COLUMN IF NOT EXISTS compressed_size_kb DECIMAL(10, 2)
      `;
      console.log('✅ Added compressed_size_kb to generated_ordinals table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  compressed_size_kb already exists in generated_ordinals');
      } else {
        throw error;
      }
    }
    
    try {
      await sql`
        ALTER TABLE generated_ordinals
        ADD COLUMN IF NOT EXISTS thumbnail_size_kb DECIMAL(10, 2)
      `;
      console.log('✅ Added thumbnail_size_kb to generated_ordinals table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  thumbnail_size_kb already exists in generated_ordinals');
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ All columns added successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addColumns();

