/**
 * Script to add PFP collection and prompt settings columns
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
    console.log('📊 Adding PFP and prompt settings columns...\n');
    
    // Add is_pfp_collection
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN is_pfp_collection BOOLEAN DEFAULT FALSE
      `;
      console.log('✅ Added is_pfp_collection to collections table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  is_pfp_collection already exists in collections');
      } else {
        throw error;
      }
    }
    
    // Add facing_direction
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN facing_direction TEXT
      `;
      // Add check constraint separately
      await sql`
        ALTER TABLE collections 
        DROP CONSTRAINT IF EXISTS collections_facing_direction_check
      `;
      await sql`
        ALTER TABLE collections 
        ADD CONSTRAINT collections_facing_direction_check 
        CHECK (facing_direction IS NULL OR facing_direction IN ('left', 'left-front', 'front', 'right-front', 'right'))
      `;
      console.log('✅ Added facing_direction to collections table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  facing_direction already exists in collections');
      } else {
        throw error;
      }
    }
    
    // Add use_hyper_detailed
    try {
      await sql`
        ALTER TABLE collections 
        ADD COLUMN use_hyper_detailed BOOLEAN DEFAULT TRUE
      `;
      console.log('✅ Added use_hyper_detailed to collections table');
    } catch (error) {
      if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
        console.log('⏭️  use_hyper_detailed already exists in collections');
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

