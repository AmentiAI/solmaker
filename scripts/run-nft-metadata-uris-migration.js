#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 111: Create nft_metadata_uris table...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Creating nft_metadata_uris table...')
    await sql`
      CREATE TABLE IF NOT EXISTS nft_metadata_uris (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
        
        -- Metadata URIs
        image_uri TEXT NOT NULL,
        metadata_uri TEXT NOT NULL,
        
        -- Storage info
        storage_provider TEXT DEFAULT 'vercel-blob',
        
        -- NFT metadata
        nft_name TEXT,
        nft_number INTEGER,
        metadata_json JSONB,
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        
        -- Unique constraint: one metadata per ordinal
        UNIQUE(ordinal_id)
      )
    `
    
    console.log('  Creating indexes...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_metadata_uris_collection 
      ON nft_metadata_uris(collection_id)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_metadata_uris_ordinal 
      ON nft_metadata_uris(ordinal_id)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_metadata_uris_created 
      ON nft_metadata_uris(created_at DESC)
    `
    
    console.log('✅ Migration 111 completed!\n')

    // Verify table exists
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'nft_metadata_uris'
    `

    if (tables.length > 0) {
      console.log('✅ Table nft_metadata_uris created successfully')
      
      // Show columns
      const columns = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'nft_metadata_uris'
        ORDER BY ordinal_position
      `
      
      console.log('\n📋 Table columns:')
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`)
      })
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()
