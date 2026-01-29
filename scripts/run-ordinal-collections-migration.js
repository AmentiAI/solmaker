/**
 * Run Ordinal Collections Migration
 * Creates ordinal_collections table to store collection metadata from Magic Eden
 * Usage: node scripts/run-ordinal-collections-migration.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🚀 Running Ordinal Collections Migration...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Read the SQL migration file
    const migrationPath = path.join(__dirname, 'migrations', '068_create_ordinal_collections.sql')
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`)
      process.exit(1)
    }

    console.log(`📄 Reading migration file: ${migrationPath}`)
    
    // Execute statements explicitly to handle function definitions properly
    console.log(`📝 Executing migration statements...\n`)
    
    // 1. Create table
    console.log('  Creating ordinal_collections table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS ordinal_collections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          symbol VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(255),
          description TEXT,
          image_uri TEXT,
          chain VARCHAR(50),
          supply INTEGER,
          min_inscription_number INTEGER,
          max_inscription_number INTEGER,
          website_link TEXT,
          twitter_link TEXT,
          discord_link TEXT,
          telegram TEXT,
          instagram TEXT,
          banner TEXT,
          floor_price BIGINT,
          volume BIGINT,
          magic_eden_created_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `
      console.log('  ✅ Created ordinal_collections table')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ❌ Error:', e.message)
      } else {
        console.log('  ✅ Table already exists')
      }
    }

    // 2. Create index
    console.log('  Creating index...')
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_ordinal_collections_symbol ON ordinal_collections(symbol)`
      console.log('  ✅ Created index')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ⚠️  Error:', e.message)
      } else {
        console.log('  ✅ Index already exists')
      }
    }

    // 3. Create function
    console.log('  Creating update function...')
    try {
      await sql`
        CREATE OR REPLACE FUNCTION update_ordinal_collection_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `
      console.log('  ✅ Created function')
    } catch (e) {
      console.error('  ⚠️  Error:', e.message)
    }

    // 4. Create trigger
    console.log('  Creating trigger...')
    try {
      await sql`
        DROP TRIGGER IF EXISTS ordinal_collections_update_timestamp ON ordinal_collections
      `
      await sql`
        CREATE TRIGGER ordinal_collections_update_timestamp
        BEFORE UPDATE ON ordinal_collections
        FOR EACH ROW
        EXECUTE FUNCTION update_ordinal_collection_timestamp()
      `
      console.log('  ✅ Created trigger')
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('  ⚠️  Error:', e.message)
      } else {
        console.log('  ✅ Trigger already exists')
      }
    }

    console.log('')
    console.log('='.repeat(60))
    console.log('✅ Ordinal Collections Migration completed!')
    console.log('='.repeat(60))
    console.log('')

    // Verify table was created
    console.log('🔍 Verifying table...')
    try {
      const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'ordinal_collections'
      `
      
      if (tables.length > 0) {
        console.log('   ✅ ordinal_collections table exists')
        
        // Check columns
        const columns = await sql`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'ordinal_collections'
          ORDER BY ordinal_position
        `
        
        console.log(`   📊 Table has ${columns.length} columns:`)
        columns.forEach(col => {
          console.log(`      • ${col.column_name} (${col.data_type})`)
        })
      } else {
        console.log('   ⚠️  ordinal_collections table not found')
      }
    } catch (error) {
      console.error('   ⚠️  Could not verify table:', error.message)
    }

    console.log('')
    console.log('📊 Summary:')
    console.log('   • ordinal_collections: Stores collection metadata from Magic Eden')
    console.log('   • Fields: symbol, name, description, image_uri, social links, supply, etc.')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   1. List an ordinal with a collection_symbol')
    console.log('   2. The system will automatically fetch and save collection metadata')
    console.log('   3. Collection images and info will appear on /marketplace')
    console.log('')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
