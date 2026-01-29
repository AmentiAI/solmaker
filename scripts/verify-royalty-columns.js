const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function verify() {
  console.log('Verifying royalty columns...\n');
  
  const cols = await sql`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name IN ('creator_royalty_wallet', 'creator_royalty_percent', 'creator_payment_wallet', 'platform_fee_sats') 
    ORDER BY table_name
  `;
  
  console.log('Found columns:');
  cols.forEach(c => console.log('  ✅', c.table_name + '.' + c.column_name));
  
  if (cols.length === 0) {
    console.log('  ❌ No columns found!');
  }
  
  console.log('\nTotal:', cols.length, 'columns');
}

verify().catch(e => console.error('Error:', e.message));

