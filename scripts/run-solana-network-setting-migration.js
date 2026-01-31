#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 117: Add Solana network settings...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('  Adding solana_network setting...')
    await sql`
      INSERT INTO site_settings (setting_key, setting_value, description)
      VALUES (
        'solana_network',
        '"devnet"'::jsonb,
        'Solana network to use for deployments and minting (devnet or mainnet-beta)'
      )
      ON CONFLICT (setting_key) DO NOTHING
    `
    
    console.log('  Adding solana_rpc_mainnet setting...')
    await sql`
      INSERT INTO site_settings (setting_key, setting_value, description)
      VALUES (
        'solana_rpc_mainnet',
        '"https://api.mainnet-beta.solana.com"'::jsonb,
        'Solana RPC endpoint for mainnet-beta'
      )
      ON CONFLICT (setting_key) DO NOTHING
    `
    
    console.log('  Adding solana_rpc_devnet setting...')
    await sql`
      INSERT INTO site_settings (setting_key, setting_value, description)
      VALUES (
        'solana_rpc_devnet',
        '"https://api.devnet.solana.com"'::jsonb,
        'Solana RPC endpoint for devnet'
      )
      ON CONFLICT (setting_key) DO NOTHING
    `
    
    console.log('✅ Migration 117 completed!\n')

    const settings = await sql`
      SELECT setting_key, setting_value
      FROM site_settings
      WHERE setting_key LIKE 'solana_%'
      ORDER BY setting_key
    `

    if (settings.length > 0) {
      console.log('✅ Solana settings:')
      settings.forEach(s => {
        const value = typeof s.setting_value === 'string' ? s.setting_value : JSON.stringify(s.setting_value)
        console.log(`  - ${s.setting_key}: ${value}`)
      })
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
