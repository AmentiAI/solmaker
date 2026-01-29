/**
 * Script to add compression_target_kb column to collections table
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

async function addColumn() {
  try {
    console.log('📊 Adding compression_target_kb column...\n');
    
    // Add compression_target_kb to collections
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN compression_target_kb INTEGER
      `;
      console.log('✅ Added compression_target_kb to collections table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  compression_target_kb already exists in collections');
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ Column added successfully!');
    console.log('\nVerifying...\n');
    
    // Verify
    const check = await sql`
      SELECT 
        column_name, 
        data_type, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
        AND column_name = 'compression_target_kb'
    `;
    
    const checkArray = Array.isArray(check) ? check : [check];
    if (checkArray.length > 0) {
      checkArray.forEach((col) => {
        console.log(`  ✅ ${col.table_name}.${col.column_name}: ${col.data_type} (default: ${col.column_default || 'NULL'})`);
      });
      console.log('\n✅ Column confirmed to exist!');
    } else {
      console.log('\n⚠️  Column not found after adding');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addColumn();

