#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const { neon } = await import('@neondatabase/serverless');
  
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  
  console.log('📸 Setting up thumbnail support...\n');

  try {
    // Read and execute migration
    const migrationPath = path.join(__dirname, 'migrations', '009_add_thumbnail_url.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration: 009_add_thumbnail_url.sql');
    
    // Split on semicolons and execute each statement separately
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await sql(statement);
        console.log('✓ Executed statement');
      } catch (err) {
        // Ignore errors for IF NOT EXISTS statements
        if (!err.message?.includes('already exists')) {
          throw err;
        }
        console.log('✓ Statement already applied (skipped)');
      }
    }
    
    console.log('\n✅ Thumbnail support added successfully!');
    console.log('\n📊 Summary:');
    console.log('  - Added thumbnail_url column to generated_ordinals');
    console.log('  - Existing records use image_url as fallback');
    console.log('  - New ordinals will have both original + thumbnail');
    console.log('  - Collection pages: Show full-quality originals');
    console.log('  - Mint pages: Show optimized thumbnails');
    console.log('\n🔄 Next steps:');
    console.log('  1. Run: npm install (if you haven\'t already)');
    console.log('  2. Generate new ordinals - they will automatically create thumbnails');
    console.log('  3. Thumbnails are ~80-90% smaller than originals');
    console.log('\n💡 Note: Collection management pages still use original high-quality images');
    console.log('   Only the mint selection page uses compressed thumbnails for faster loading');
    
  } catch (error) {
    console.error('❌ Error setting up thumbnails:', error);
    process.exit(1);
  }
}

main();

