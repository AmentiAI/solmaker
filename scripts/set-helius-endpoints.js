const { neon } = require('@neondatabase/serverless')

async function setHeliusEndpoints() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Set NEON_DATABASE or DATABASE_URL environment variable.')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    // Check current settings
    console.log('🔍 Checking current Solana settings...')
    const current = await sql`
      SELECT setting_key, setting_value
      FROM site_settings
      WHERE setting_key IN ('solana_network', 'solana_rpc_mainnet', 'solana_rpc_devnet')
      ORDER BY setting_key
    `

    console.log('\n📋 Current settings:')
    current.forEach(row => {
      console.log(`  ${row.setting_key}: ${row.setting_value}`)
    })

    // Helius endpoints from .env.local
    const heliusMainnet = 'https://mainnet.helius-rpc.com/?api-key=1979a78a-acf5-48e8-b68d-5256535a84ee'
    const heliusDevnet = 'https://devnet.helius-rpc.com/?api-key=77a7f165-c4ff-49bc-93f7-de2a5706977e'

    console.log('\n🔧 Setting Helius endpoints...')

    // Upsert devnet RPC (this is what you need for candy machine deployment)
    await sql`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('solana_rpc_devnet', ${JSON.stringify(heliusDevnet)}::jsonb)
      ON CONFLICT (setting_key)
      DO UPDATE SET setting_value = ${JSON.stringify(heliusDevnet)}::jsonb, updated_at = NOW()
    `
    console.log('  ✅ Set devnet RPC to Helius')

    // Upsert mainnet RPC
    await sql`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('solana_rpc_mainnet', ${JSON.stringify(heliusMainnet)}::jsonb)
      ON CONFLICT (setting_key)
      DO UPDATE SET setting_value = ${JSON.stringify(heliusMainnet)}::jsonb, updated_at = NOW()
    `
    console.log('  ✅ Set mainnet RPC to Helius')

    // Ensure network is set to devnet
    await sql`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('solana_network', ${JSON.stringify('devnet')}::jsonb)
      ON CONFLICT (setting_key)
      DO UPDATE SET setting_value = ${JSON.stringify('devnet')}::jsonb, updated_at = NOW()
    `
    console.log('  ✅ Set network to devnet')

    // Verify
    console.log('\n✅ Verifying updated settings...')
    const updated = await sql`
      SELECT setting_key, setting_value
      FROM site_settings
      WHERE setting_key IN ('solana_network', 'solana_rpc_mainnet', 'solana_rpc_devnet')
      ORDER BY setting_key
    `

    console.log('\n📋 Updated settings:')
    updated.forEach(row => {
      const value = row.setting_value.includes('helius-rpc.com')
        ? row.setting_value.substring(0, 50) + '...'
        : row.setting_value
      console.log(`  ${row.setting_key}: ${value}`)
    })

    console.log('\n🎉 Done! Helius endpoints have been set in the database.')
    console.log('💡 Restart your server for changes to take effect.')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

setHeliusEndpoints()
