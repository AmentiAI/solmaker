const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) process.env[k] = envConfig[k];

const client = new Client({ 
  connectionString: process.env.NEON_DATABASE, 
  ssl: { rejectUnauthorized: false } 
});

async function fix() {
  await client.connect();
  
  const ids = [
    'f1c32d1f-ad87-4d76-9388-3989f5a0e162',
    'b49d65e0-b509-4910-ba15-4bfff878350d',
    '5718b030-3aef-46b2-b8b4-3ac46d6bd9af',
    '4871565d-cf98-41b6-bc3e-01caaaeecb6c',
    '59b78534-2a3b-4ada-bbb1-e9d67df205da',
    '32f4e499-9095-4fc7-80d1-954fc1d0fe6f',
    '36f28e0b-f98f-4805-b88b-fc68be2d977d'
  ];
  
  const result = await client.query(
    `UPDATE generated_ordinals SET is_minted = true WHERE id = ANY($1) RETURNING id, ordinal_number, is_minted`,
    [ids]
  );
  
  console.log('Fixed', result.rowCount, 'ordinals:');
  result.rows.forEach(r => console.log('  ', r.id, '- is_minted:', r.is_minted));
  
  await client.end();
}

fix().catch(console.error);
