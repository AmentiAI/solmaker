/**
 * Script to verify compression columns exist in the database
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

async function verifyColumns() {
  try {
    console.log('📊 Checking compression columns...\n');
    
    // Check collections table
    const collectionsCheck = await sql`
      SELECT 
        column_name, 
        data_type, 
        column_default,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
        AND (column_name = 'compression_quality' OR column_name = 'compression_dimensions')
      ORDER BY column_name
    `;
    
    const collectionsArray = Array.isArray(collectionsCheck) ? collectionsCheck : [collectionsCheck];
    
    console.log('Collections table:');
    if (collectionsArray.length === 0) {
      console.log('  ❌ No compression columns found!');
    } else {
      collectionsArray.forEach((col) => {
        console.log(`  ✅ ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'NULL'}, nullable: ${col.is_nullable})`);
      });
    }
    
    // Check generated_ordinals table
    const ordinalsCheck = await sql`
      SELECT 
        column_name, 
        data_type, 
        column_default,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generated_ordinals' 
        AND column_name = 'compressed_image_url'
    `;
    
    const ordinalsArray = Array.isArray(ordinalsCheck) ? ordinalsCheck : [ordinalsCheck];
    
    console.log('\nGenerated ordinals table:');
    if (ordinalsArray.length === 0) {
      console.log('  ❌ compressed_image_url column not found!');
    } else {
      ordinalsArray.forEach((col) => {
        console.log(`  ✅ ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'NULL'}, nullable: ${col.is_nullable})`);
      });
    }
    
    // Summary
    console.log('\n📋 Summary:');
    const allColumns = [...collectionsArray, ...ordinalsArray];
    if (allColumns.length === 3) {
      console.log('  ✅ All compression columns exist!');
    } else {
      console.log(`  ⚠️  Found ${allColumns.length}/3 columns`);
      if (collectionsArray.length < 2) {
        console.log('  ❌ Missing compression columns in collections table');
      }
      if (ordinalsArray.length < 1) {
        console.log('  ❌ Missing compressed_image_url in generated_ordinals table');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyColumns();

