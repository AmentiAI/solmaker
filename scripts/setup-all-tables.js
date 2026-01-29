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

async function setupAllTables() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Create migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if main schema has been run
    const existingMigrations = await client.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      ['001_solmaker_schema.sql']
    );

    if (existingMigrations.rows.length > 0) {
      console.log('✅ Main schema already applied');
    } else {
      console.log('📋 Running main schema (001_solmaker_schema.sql)...');
      const schemaPath = path.join(__dirname, 'migrations', '001_solmaker_schema.sql');
      
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        
        await client.query('BEGIN');
        try {
          await client.query(schemaSQL);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            ['001_solmaker_schema.sql']
          );
          await client.query('COMMIT');
          console.log('✅ Main schema applied successfully\n');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } else {
        console.log('⚠️  001_solmaker_schema.sql not found, running individual migrations...\n');
        
        // Run essential migrations one by one
        const essentialMigrations = [
          '001_create_collections.sql',
          '002_create_layers.sql',
          '003_create_traits.sql',
          '004_add_indexes.sql',
          '018_create_profiles.sql',
        ];
        
        for (const migration of essentialMigrations) {
          const existing = await client.query(
            'SELECT filename FROM schema_migrations WHERE filename = $1',
            [migration]
          );
          
          if (existing.rows.length > 0) {
            console.log(`⏭️  ${migration} already applied`);
            continue;
          }
          
          const migrationPath = path.join(__dirname, 'migrations', migration);
          if (!fs.existsSync(migrationPath)) {
            console.log(`⚠️  ${migration} not found, skipping`);
            continue;
          }
          
          console.log(`🔄 Running ${migration}...`);
          const sql = fs.readFileSync(migrationPath, 'utf8');
          
          await client.query('BEGIN');
          try {
            await client.query(sql);
            await client.query(
              'INSERT INTO schema_migrations (filename) VALUES ($1)',
              [migration]
            );
            await client.query('COMMIT');
            console.log(`✅ ${migration} completed`);
          } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ ${migration} failed:`, error.message);
          }
        }
      }
    }

    // Verify tables
    console.log('\n🔍 Verifying tables...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('\n📊 Existing tables:');
    tables.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log(`\n✨ Total: ${tables.rows.length} tables`);

    // Check for profiles table specifically
    const hasProfiles = tables.rows.some(r => r.table_name === 'profiles');
    if (hasProfiles) {
      console.log('\n✅ profiles table exists!');
    } else {
      console.log('\n⚠️  profiles table missing! Creating now...');
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          wallet_address TEXT PRIMARY KEY,
          username VARCHAR(50) UNIQUE,
          display_name VARCHAR(100),
          bio TEXT,
          avatar_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);
        CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON profiles (wallet_address);
      `);
      
      console.log('✅ profiles table created!');
    }

    console.log('\n🎉 Database setup complete!');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

if (require.main === module) {
  setupAllTables().catch(console.error);
}

module.exports = { setupAllTables };
