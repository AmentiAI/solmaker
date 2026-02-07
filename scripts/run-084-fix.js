const { neon } = require('@neondatabase/serverless')

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE
if (!DATABASE_URL) {
  console.error('No DATABASE_URL or NEON_DATABASE set')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function run() {
  console.log('Adding missing columns to collections table...')
  
  // Add columns
  await sql`
    ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS candy_machine_address TEXT,
    ADD COLUMN IF NOT EXISTS collection_mint_address TEXT,
    ADD COLUMN IF NOT EXISTS collection_authority TEXT,
    ADD COLUMN IF NOT EXISTS candy_guard_address TEXT,
    ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deployment_status TEXT DEFAULT 'not_deployed',
    ADD COLUMN IF NOT EXISTS deployment_tx_signature TEXT,
    ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deployed_by TEXT
  `
  console.log('✅ Columns added to collections table')

  // Add index
  await sql`
    CREATE INDEX IF NOT EXISTS idx_collections_candy_machine 
    ON collections(candy_machine_address) WHERE candy_machine_address IS NOT NULL
  `
  console.log('✅ Index created')

  // Create nft_metadata_uris table
  await sql`
    CREATE TABLE IF NOT EXISTS nft_metadata_uris (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
      image_uri TEXT NOT NULL,
      metadata_uri TEXT NOT NULL,
      storage_provider TEXT DEFAULT 'vercel-blob',
      nft_name TEXT,
      nft_number INTEGER,
      metadata_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('✅ nft_metadata_uris table created')

  // Create indexes for nft_metadata_uris
  await sql`CREATE INDEX IF NOT EXISTS idx_metadata_uris_collection ON nft_metadata_uris(collection_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_metadata_uris_ordinal ON nft_metadata_uris(ordinal_id)`

  // Create solana_nft_mints table
  await sql`
    CREATE TABLE IF NOT EXISTS solana_nft_mints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      candy_machine_address TEXT NOT NULL,
      session_id UUID REFERENCES mint_sessions(id) ON DELETE SET NULL,
      phase_id UUID REFERENCES mint_phases(id) ON DELETE SET NULL,
      ordinal_id UUID REFERENCES generated_ordinals(id) ON DELETE SET NULL,
      nft_mint_address TEXT,
      metadata_uri TEXT,
      token_account TEXT,
      minter_wallet TEXT NOT NULL,
      mint_tx_signature TEXT UNIQUE,
      mint_price_lamports BIGINT NOT NULL DEFAULT 0,
      platform_fee_lamports BIGINT DEFAULT 0,
      total_paid_lamports BIGINT,
      mint_status TEXT DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('✅ solana_nft_mints table created')

  // Create indexes for solana_nft_mints
  await sql`CREATE INDEX IF NOT EXISTS idx_solana_mints_collection ON solana_nft_mints(collection_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_solana_mints_candy_machine ON solana_nft_mints(candy_machine_address)`
  await sql`CREATE INDEX IF NOT EXISTS idx_solana_mints_minter ON solana_nft_mints(minter_wallet)`
  await sql`CREATE INDEX IF NOT EXISTS idx_solana_mints_status ON solana_nft_mints(mint_status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_solana_mints_tx_signature ON solana_nft_mints(mint_tx_signature) WHERE mint_tx_signature IS NOT NULL`

  // Create candy_machine_deployments table
  await sql`
    CREATE TABLE IF NOT EXISTS candy_machine_deployments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      step TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_signature TEXT,
      error_message TEXT,
      step_data JSONB,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `
  console.log('✅ candy_machine_deployments table created')

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_cm_deployments_collection ON candy_machine_deployments(collection_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_cm_deployments_status ON candy_machine_deployments(status)`

  // Add metadata_uploaded to generated_ordinals
  await sql`ALTER TABLE generated_ordinals ADD COLUMN IF NOT EXISTS metadata_uploaded BOOLEAN DEFAULT false`
  console.log('✅ metadata_uploaded added to generated_ordinals')

  // Verify
  const cols = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'collections' 
    AND column_name IN ('candy_machine_address', 'collection_mint_address', 'deployment_status', 'metadata_uploaded')
    ORDER BY column_name
  `
  console.log('\n✅ Verified collections columns:')
  cols.forEach(c => console.log('  -', c.column_name))

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('nft_metadata_uris', 'solana_nft_mints', 'candy_machine_deployments')
    ORDER BY table_name
  `
  console.log('\n✅ Verified tables:')
  tables.forEach(t => console.log('  -', t.table_name))
  
  console.log('\n🎉 Migration 084 complete!')
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
