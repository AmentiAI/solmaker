require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function fix() {
  const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);
  
  // Update the expected sats to match what was actually sent (1000)
  const result = await sql`
    UPDATE marketplace_pending_payments
    SET btc_amount_sats = 1000
    WHERE id = 'ba54d989-719b-4bf1-b523-e7623286a785'
    RETURNING id, btc_amount_sats
  `;
  
  console.log('✅ Updated payment expected amount to 1000 sats:', result);
}

fix().catch(console.error);

