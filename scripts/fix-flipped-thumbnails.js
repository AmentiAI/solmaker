// Fix stale thumbnails for flipped ordinals
// When an ordinal is flipped, image_url is updated but thumbnail_url was not cleared.
// This script clears thumbnail_url for any ordinal whose image_url contains 'flipped'.

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL)

async function main() {
  // Find all ordinals with stale thumbnails (flipped image but old thumbnail)
  const stale = await sql`
    SELECT id, collection_id, ordinal_number, image_url, thumbnail_url
    FROM generated_ordinals
    WHERE image_url LIKE '%flipped%'
      AND thumbnail_url IS NOT NULL
  `

  console.log(`Found ${stale.length} ordinals with stale thumbnails after flip`)

  if (stale.length === 0) {
    console.log('Nothing to fix!')
    return
  }

  for (const row of stale) {
    console.log(`  #${row.ordinal_number || row.id} — clearing thumbnail_url`)
  }

  // Clear them all
  const result = await sql`
    UPDATE generated_ordinals
    SET thumbnail_url = NULL
    WHERE image_url LIKE '%flipped%'
      AND thumbnail_url IS NOT NULL
  `

  console.log(`Done! Cleared ${stale.length} stale thumbnails.`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
