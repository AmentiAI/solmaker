require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE
const sql = neon(DATABASE_URL)
const collectionId = process.argv[2]

if (!collectionId) {
  console.error('Usage: node scripts/reset-deployment.js <collection-id>')
  process.exit(1)
}

async function run() {
  console.log(`Resetting deployment for collection: ${collectionId}\n`)

  // Reset collection deployment columns
  await sql`
    UPDATE collections
    SET 
      candy_machine_address = NULL,
      collection_mint_address = NULL,
      collection_authority = NULL,
      candy_guard_address = NULL,
      metadata_uploaded = false,
      deployment_status = 'not_deployed',
      deployment_tx_signature = NULL,
      deployed_at = NULL,
      deployed_by = NULL
    WHERE id = ${collectionId}::uuid
  `
  console.log('✅ Reset collections columns')

  // Delete deployment logs
  const deploys = await sql`
    DELETE FROM candy_machine_deployments 
    WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`✅ Deleted ${deploys.length} deployment log entries`)

  // Delete metadata URIs
  const uris = await sql`
    DELETE FROM nft_metadata_uris 
    WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`✅ Deleted ${uris.length} metadata URI entries`)

  // Reset ordinal metadata_uploaded flags
  await sql`
    UPDATE generated_ordinals
    SET metadata_uploaded = false
    WHERE collection_id = ${collectionId}::uuid
  `
  console.log('✅ Reset ordinal metadata_uploaded flags')

  // Delete any mint records
  const mints = await sql`
    DELETE FROM solana_nft_mints 
    WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`✅ Deleted ${mints.length} mint records`)

  // Delete any mint sessions
  const sessions = await sql`
    DELETE FROM mint_sessions 
    WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`✅ Deleted ${sessions.length} mint sessions`)

  // Verify
  const col = await sql`
    SELECT deployment_status, candy_machine_address, collection_mint_address, metadata_uploaded
    FROM collections WHERE id = ${collectionId}::uuid
  `
  if (col.length) {
    console.log('\nCurrent state:')
    console.log('  deployment_status:', col[0].deployment_status)
    console.log('  candy_machine_address:', col[0].candy_machine_address)
    console.log('  collection_mint_address:', col[0].collection_mint_address)
    console.log('  metadata_uploaded:', col[0].metadata_uploaded)
  }

  console.log('\n🎉 Deployment reset! You can now re-deploy from scratch.')
}

run().catch(e => {
  console.error('❌ Error:', e.message)
  process.exit(1)
})
