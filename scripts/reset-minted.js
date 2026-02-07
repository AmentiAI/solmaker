require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE
const sql = neon(DATABASE_URL)
const collectionId = process.argv[2] || '39896e32-86d3-4a1d-a083-be0a2c56c652'

async function run() {
  console.log(`Resetting minted state for collection: ${collectionId}\n`)

  const r1 = await sql`
    UPDATE generated_ordinals SET is_minted = false
    WHERE collection_id = ${collectionId}::uuid AND is_minted = true
    RETURNING id
  `
  console.log(`Reset ${r1.length} ordinals to unminted`)

  const r2 = await sql`
    DELETE FROM solana_nft_mints WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`Deleted ${r2.length} mint records`)

  const r3 = await sql`
    DELETE FROM mint_sessions WHERE collection_id = ${collectionId}::uuid
    RETURNING id
  `
  console.log(`Deleted ${r3.length} mint sessions`)

  const check = await sql`
    SELECT 
      count(*) FILTER (WHERE is_minted = true) as minted,
      count(*) as total
    FROM generated_ordinals
    WHERE collection_id = ${collectionId}::uuid
  `
  console.log(`\nMinted: ${check[0].minted} / ${check[0].total}`)
  console.log('Done!')
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
