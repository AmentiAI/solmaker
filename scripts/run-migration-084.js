#!/usr/bin/env node

/**
 * Run Migration 084 - Solana NFT System
 * Adds Candy Machine support for Solana NFT minting
 */

const fs = require('fs')
const path = require('path')
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 084: Solana NFT System...\n')

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '084_create_solana_nft_system.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf8')

    console.log('📝 Executing migration...')
    await sql(migrationSql)

    console.log('✅ Migration 084 completed successfully!\n')
    console.log('📊 Created:')
    console.log('  - Added candy_machine columns to collections table')
    console.log('  - nft_metadata_uris table')
    console.log('  - solana_nft_mints table')
    console.log('  - candy_machine_deployments table')
    console.log('  - Views and triggers for Solana mints')

    // Verify tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('nft_metadata_uris', 'solana_nft_mints', 'candy_machine_deployments')
      ORDER BY table_name
    `

    console.log('\n✅ Verified tables:')
    tables.forEach(t => console.log(`  - ${t.table_name}`))

    // Check collections columns
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collections' 
      AND column_name IN ('candy_machine_address', 'collection_mint_address', 'deployment_status')
    `

    console.log('\n✅ Verified collections columns:')
    columns.forEach(c => console.log(`  - ${c.column_name}`))

    console.log('\n🎉 Ready for Solana NFT minting!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()
