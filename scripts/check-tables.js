#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function checkTables() {
  const client = new Client({
    connectionString: process.env.NEON_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('Existing tables:');
    result.rows.forEach(r => console.log(`  - ${r.table_name}`));
    console.log(`\nTotal: ${result.rows.length} tables`);
  } finally {
    await client.end();
  }
}

checkTables().catch(console.error);
