#!/usr/bin/env node

const { Client } = require('pg');

const DATABASE_URL = process.env.NEON_DATABASE || 
  'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const wallet = 'bc1ptku2xtatqhntfctzachrmr8laq36s20wtrgnm66j39g0a3fwamlqxkryf2';

async function assignWallet() {
  const client = new Client({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  try {
    await client.connect();
    console.log('🔌 Connected to database');
    
    const result = await client.query(
      `UPDATE collections SET wallet_address = $1 WHERE wallet_address IS NULL RETURNING id, name`,
      [wallet]
    );
    
    console.log(`\n✅ Updated ${result.rowCount} collections to wallet:\n   ${wallet}\n`);
    
    if (result.rows.length > 0) {
      console.log('Collections updated:');
      result.rows.forEach(r => console.log(`  - ${r.name} (${r.id})`));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

assignWallet();

