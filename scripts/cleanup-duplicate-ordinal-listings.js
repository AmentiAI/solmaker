/**
 * Cleanup duplicate ordinal listings
 * Removes cancelled/pending/expired listings when there are duplicates
 * Keeps only the most recent active listing for each inscription_id
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function runCleanup() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found. Please set NEON_DATABASE or DATABASE_URL')
    process.exit(1)
  }

  console.log('🧹 Cleaning up duplicate ordinal listings...')
  console.log('📡 Connecting to database...')

  const sql = neon(databaseUrl)

  try {
    // Find inscriptions with multiple listings
    console.log('  Finding duplicate inscriptions...')
    const duplicates = await sql`
      SELECT inscription_id, COUNT(*) as count
      FROM ordinal_listings
      GROUP BY inscription_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `

    if (duplicates.length === 0) {
      console.log('  ✅ No duplicates found')
      return
    }

    console.log(`  Found ${duplicates.length} inscriptions with duplicates`)

    let totalDeleted = 0

    for (const dup of duplicates) {
      console.log(`\n  Processing inscription: ${dup.inscription_id} (${dup.count} listings)`)

      // Get all listings for this inscription, ordered by status priority and date
      const listings = await sql`
        SELECT id, status, created_at, seller_wallet
        FROM ordinal_listings
        WHERE inscription_id = ${dup.inscription_id}
        ORDER BY 
          CASE status
            WHEN 'active' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'sold' THEN 3
            WHEN 'cancelled' THEN 4
            WHEN 'expired' THEN 5
            ELSE 6
          END,
          created_at DESC
      `

      // Keep the first one (highest priority), delete the rest
      const toKeep = listings[0]
      const toDelete = listings.slice(1)

      console.log(`    Keeping: ${toKeep.id} (status: ${toKeep.status}, created: ${toKeep.created_at})`)

      for (const listing of toDelete) {
        console.log(`    Deleting: ${listing.id} (status: ${listing.status}, created: ${listing.created_at})`)
        await sql`
          DELETE FROM ordinal_listings
          WHERE id = ${listing.id}
        `
        totalDeleted++
      }
    }

    console.log('')
    console.log('='.repeat(60))
    console.log(`✅ Cleanup completed!`)
    console.log(`   Processed ${duplicates.length} duplicate inscriptions`)
    console.log(`   Deleted ${totalDeleted} duplicate listings`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  }
}

runCleanup()
