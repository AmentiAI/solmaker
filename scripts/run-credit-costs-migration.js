#!/usr/bin/env node

/**
 * Run Migration 085 - Add credit_costs columns
 * Adds cost_per_unit, unit_name, and updated_by columns
 */

const fs = require('fs')
const path = require('path')
const { neon } = require('@neondatabase/serverless')

async function runMigration() {
  console.log('🚀 Running Migration 085: Add credit_costs columns...\n')

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL or NEON_DATABASE environment variable is required')
    process.exit(1)
  }

  const sql = neon(databaseUrl)

  try {
    console.log('📝 Executing migration statements...\n')
    
    // Execute each ALTER TABLE statement individually
    console.log('  Adding cost_per_unit column...')
    await sql`
      ALTER TABLE credit_costs 
      ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(10,2)
    `
    
    console.log('  Adding unit_name column...')
    await sql`
      ALTER TABLE credit_costs 
      ADD COLUMN IF NOT EXISTS unit_name TEXT DEFAULT 'unit'
    `
    
    console.log('  Adding updated_by column...')
    await sql`
      ALTER TABLE credit_costs 
      ADD COLUMN IF NOT EXISTS updated_by TEXT
    `
    
    console.log('  Copying data from credit_cost to cost_per_unit...')
    await sql`
      UPDATE credit_costs 
      SET cost_per_unit = credit_cost 
      WHERE cost_per_unit IS NULL AND credit_cost IS NOT NULL
    `
    
    console.log('  Setting default cost_per_unit values...')
    await sql`
      UPDATE credit_costs 
      SET cost_per_unit = 1.0 
      WHERE cost_per_unit IS NULL
    `
    
    console.log('  Making cost_per_unit NOT NULL...')
    await sql`
      ALTER TABLE credit_costs 
      ALTER COLUMN cost_per_unit SET NOT NULL
    `
    
    console.log('  Setting unit_name defaults...')
    await sql`
      UPDATE credit_costs 
      SET unit_name = CASE 
        WHEN action_type = 'image_generation' THEN 'image'
        WHEN action_type = 'trait_generation' THEN 'trait'
        WHEN action_type = 'collection_generation' THEN 'collection'
        ELSE 'unit'
      END
      WHERE unit_name IS NULL OR unit_name = 'unit'
    `
    
    console.log('  Creating index...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_credit_costs_action_type ON credit_costs(action_type)
    `

    console.log('✅ Migration 085 completed successfully!\n')
    console.log('📊 Added/updated columns:')
    console.log('  - cost_per_unit (DECIMAL)')
    console.log('  - unit_name (TEXT)')
    console.log('  - updated_by (TEXT)')

    // Verify columns exist
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'credit_costs' 
      AND column_name IN ('cost_per_unit', 'unit_name', 'updated_by', 'credit_cost')
      ORDER BY column_name
    `

    console.log('\n✅ Verified columns in credit_costs table:')
    columns.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`))

    // Show current credit costs
    const costs = await sql`
      SELECT action_type, cost_per_unit, unit_name, description 
      FROM credit_costs 
      ORDER BY action_type
    `

    if (costs.length > 0) {
      console.log('\n📋 Current credit costs:')
      costs.forEach(c => {
        console.log(`  - ${c.action_type}: ${c.cost_per_unit} credits per ${c.unit_name}`)
      })
    } else {
      console.log('\n⚠️  No credit costs defined yet. Add some via the admin panel.')
    }

    console.log('\n🎉 Migration complete! Credit costs configuration is ready.')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

runMigration()
