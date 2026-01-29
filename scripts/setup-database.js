#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection configuration
const DATABASE_URL = process.env.NEON_DATABASE || 'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Migration files in order
const migrations = [
  '001_create_collections.sql',
  '002_create_layers.sql', 
  '003_create_traits.sql',
  '004_add_indexes.sql'
];

async function runMigrations() {
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

    console.log('📋 Checking existing migrations...');
    const existingMigrations = await client.query('SELECT filename FROM schema_migrations ORDER BY id');
    const executedFiles = existingMigrations.rows.map(row => row.filename);

    for (const migrationFile of migrations) {
      if (executedFiles.includes(migrationFile)) {
        console.log(`⏭️  Skipping ${migrationFile} (already executed)`);
        continue;
      }

      const migrationPath = path.join(__dirname, 'migrations', migrationFile);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`⚠️  Migration file not found: ${migrationPath}`);
        continue;
      }

      console.log(`🔄 Running migration: ${migrationFile}`);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await client.query('BEGIN');
        
        // Split SQL into individual statements and execute them
        const statements = migrationSQL
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await client.query(statement);
            } catch (stmtError) {
              // Check if it's a constraint already exists error
              if (stmtError.message.includes('already exists') || 
                  stmtError.message.includes('duplicate key') ||
                  stmtError.message.includes('constraint') && stmtError.message.includes('already exists') ||
                  stmtError.message.includes('constraint') && stmtError.message.includes('already exists') ||
                  stmtError.message.includes('relation') && stmtError.message.includes('already exists')) {
                console.log(`⚠️  Skipping statement (already exists): ${statement.substring(0, 50)}...`);
                continue;
              }
              throw stmtError;
            }
          }
        }
        
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migrationFile]);
        await client.query('COMMIT');
        console.log(`✅ Migration ${migrationFile} completed successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Error running migration ${migrationFile}:`, error.message);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully!');

    // Verify tables were created
    console.log('🔍 Verifying database structure...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('collections', 'layers', 'traits', 'schema_migrations')
      ORDER BY table_name;
    `);

    console.log('📊 Created tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the setup
if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = { runMigrations };
