/**
 * Script to add lighting_description column to collections table
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
    console.log('📊 Adding lighting_description column...\n');
    
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN lighting_description TEXT
      `;
      console.log('✅ Added lighting_description to collections table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  lighting_description already exists in collections');
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ Column added successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addColumn();

 