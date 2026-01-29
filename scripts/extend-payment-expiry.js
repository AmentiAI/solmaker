/**
 * Extend expired marketplace pending payments
 * Run: node scripts/extend-payment-expiry.js
 */

require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

async function run() {
  const databaseUrl = process.env.NEON_DATABASE || process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ No database URL found')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    // Check current pending payments
    console.log('📋 Checking pending payments...\n')
    
    const payments = await sql`
      SELECT id, status, payment_txid, expires_at, NOW() as current_time,
             expires_at > NOW() as not_expired,
             listing_id
      FROM marketplace_pending_payments 
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `
    
    console.log('Found payments:')
    payments.forEach(p => {
      console.log(`  - ID: ${p.id}`)
      console.log(`    Status: ${p.status}`)
      console.log(`    TX ID: ${p.payment_txid || 'NULL'}`)
      console.log(`    Expires: ${p.expires_at}`)
      console.log(`    Current: ${p.current_time}`)
      console.log(`    Not Expired: ${p.not_expired}`)
      console.log('')
    })

    if (payments.length === 0) {
      console.log('No pending payments found.')
      return
    }

    // Extend expiry for all pending payments with txids by 24 hours
    console.log('🔄 Extending expiry for payments with txids...')
    
    const result = await sql`
      UPDATE marketplace_pending_payments
      SET expires_at = NOW() + INTERVAL '24 hours'
      WHERE status = 'pending'
        AND payment_txid IS NOT NULL
      RETURNING id, expires_at
    `
    
    console.log(`✅ Extended ${result.length} payment(s)`)
    result.forEach(r => {
      console.log(`  - ${r.id}: now expires ${r.expires_at}`)
    })

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

run()

