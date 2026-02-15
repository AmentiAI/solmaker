require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL)

async function main() {
  console.log('Expanding mint_type constraint to support agent mint modes...')

  // Drop old constraint
  try {
    await sql`ALTER TABLE collections DROP CONSTRAINT IF EXISTS check_mint_type`
    console.log('Dropped old check_mint_type constraint')
  } catch (err) {
    console.log('No existing constraint to drop (or already dropped)')
  }

  // Add expanded constraint
  await sql`
    ALTER TABLE collections ADD CONSTRAINT check_mint_type
      CHECK (mint_type IN ('hidden', 'choices', 'agent_only', 'agent_and_human'))
  `
  console.log('Added expanded check_mint_type constraint')

  // Add agent_signer_pubkey column
  await sql`
    ALTER TABLE collections ADD COLUMN IF NOT EXISTS agent_signer_pubkey VARCHAR(64)
  `
  console.log('Added agent_signer_pubkey column')

  // Verify
  const result = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'collections' AND column_name = 'agent_signer_pubkey'
  `
  console.log('Verification:', result.length ? 'agent_signer_pubkey column exists' : 'FAILED')

  console.log('Migration complete!')
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
