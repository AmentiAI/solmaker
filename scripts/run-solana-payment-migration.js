#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.NEON_DATABASE;

if (!DATABASE_URL) {
  console.error('❌ NEON_DATABASE environment variable is not set');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationFile = '070_add_solana_payment_support.sql';
    
    // Check if already executed
    const existing = await client.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [migrationFile]
    );

    if (existing.rows.length > 0) {
      console.log(`⏭️  Migration ${migrationFile} already executed`);
      console.log('✅ Database is up to date!');
      return;
    }

    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    console.log(`🔄 Running migration: ${migrationFile}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query('BEGIN');
    
    try {
      // Execute the migration SQL
      await client.query(migrationSQL);
      
      // Record the migration
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [migrationFile]
      );
      
      await client.query('COMMIT');
      console.log(`✅ Migration ${migrationFile} completed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // Verify the changes
    console.log('\n🔍 Verifying pending_payments table structure...');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'pending_payments'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 pending_payments table columns:');
    columns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n✨ The database now supports Solana payments for credit purchases');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the migration
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };
