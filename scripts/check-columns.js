require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')
const sql = neon(process.env.NEON_DATABASE)

sql`SELECT column_name FROM information_schema.columns WHERE table_name='nft_metadata_uris' ORDER BY ordinal_position`
  .then(r => { console.log('nft_metadata_uris columns:'); r.forEach(c => console.log('  -', c.column_name)) })
  .catch(e => console.error(e.message))
