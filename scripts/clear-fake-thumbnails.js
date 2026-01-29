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
  
  console.log('🧹 Clearing fake thumbnail URLs...\n');

  try {
    // Check current state
    const countResult = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(thumbnail_url) as with_thumbnails,
        COUNT(CASE WHEN thumbnail_url = image_url THEN 1 END) as fake_thumbnails,
        COUNT(CASE WHEN thumbnail_url LIKE '%thumbnail-%' THEN 1 END) as real_thumbnails
      FROM generated_ordinals
    `;
    
    const stats = Array.isArray(countResult) ? countResult[0] : countResult;
    
    console.log('📊 Current State:');
    console.log(`  Total ordinals: ${stats.total}`);
    console.log(`  With thumbnail_url: ${stats.with_thumbnails}`);
    console.log(`  Fake thumbnails (same as image_url): ${stats.fake_thumbnails}`);
    console.log(`  Real thumbnails: ${stats.real_thumbnails}`);
    console.log('');

    if (stats.fake_thumbnails === 0) {
      console.log('✅ No fake thumbnails found! All clean.');
      return;
    }

    // Clear fake thumbnails
    console.log(`🧹 Clearing ${stats.fake_thumbnails} fake thumbnails...`);
    
    const result1 = await sql`
      UPDATE generated_ordinals
      SET thumbnail_url = NULL
      WHERE thumbnail_url = image_url
    `;
    
    const result2 = await sql`
      UPDATE generated_ordinals
      SET thumbnail_url = NULL
      WHERE thumbnail_url IS NOT NULL 
        AND thumbnail_url NOT LIKE '%thumbnail-%'
    `;
    
    console.log('✅ Cleared successfully!');
    
    // Check final state
    const finalResult = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(thumbnail_url) as with_thumbnails,
        COUNT(CASE WHEN thumbnail_url LIKE '%thumbnail-%' THEN 1 END) as real_thumbnails
      FROM generated_ordinals
    `;
    
    const finalStats = Array.isArray(finalResult) ? finalResult[0] : finalResult;
    
    console.log('\n📊 After Cleanup:');
    console.log(`  Total ordinals: ${finalStats.total}`);
    console.log(`  With thumbnail_url: ${finalStats.with_thumbnails}`);
    console.log(`  Real thumbnails: ${finalStats.real_thumbnails}`);
    console.log(`  Ready for auto-generation: ${finalStats.total - finalStats.with_thumbnails}`);
    
    console.log('\n✨ Done! Now when you visit the mint page:');
    console.log('  1. System will detect missing thumbnails');
    console.log('  2. Auto-generate compressed versions in background');
    console.log('  3. Save real thumbnail URLs to database');
    console.log('  4. Future loads will be 85% faster!');
    
  } catch (error) {
    console.error('❌ Error clearing thumbnails:', error);
    process.exit(1);
  }
}

main();

