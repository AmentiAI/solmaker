/**
 * Verify compression_format column exists in collections table
 * Usage: node scripts/verify-compression-format.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function verifyColumn() {
  try {
    console.log('🔍 Checking if compression_format column exists...\n');
    
    // Check if column exists
    const result = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'collections' 
      AND column_name = 'compression_format'
    `;
    
    if (result && result.length > 0) {
      console.log('✅ Column exists!');
      console.log('📋 Column details:', result[0]);
      console.log('\n✅ No action needed - column is already present.');
    } else {
      console.log('❌ Column does NOT exist!');
      console.log('\n📝 Attempting to add column now...\n');
      
      // Try to add it directly
      try {
        await sql`
          ALTER TABLE collections 
          ADD COLUMN compression_format TEXT DEFAULT 'webp'
        `;
        console.log('✅ Column added successfully!');
      } catch (addError) {
        const errorMsg = addError?.message || String(addError);
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log('⏭️  Column already exists (caught in error handler)');
        } else {
          console.error('❌ Error adding column:', errorMsg);
          console.error('Full error:', addError);
        }
      }
    }
    
    // Also list all columns in collections table for debugging
    console.log('\n📊 All columns in collections table:');
    const allColumns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'collections'
      ORDER BY ordinal_position
    `;
    
    allColumns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking column:', error?.message || error);
    console.error('Full error:', error);
    process.exit(1);
  }
}

verifyColumn();

