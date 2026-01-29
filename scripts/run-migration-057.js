#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection configuration (same as setup-database.js)
const DATABASE_URL = process.env.NEON_DATABASE || 'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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

    const migrationFile = '057_add_cap_supply.sql';
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
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
            // Check if it's a column already exists error
            if (stmtError.message.includes('already exists') || 
                stmtError.message.includes('duplicate key') ||
                stmtError.message.includes('column') && stmtError.message.includes('already exists')) {
              console.log(`⚠️  Skipping statement (already exists): ${statement.substring(0, 50)}...`);
              continue;
            }
            throw stmtError;
          }
        }
      }
      
      // Record migration in schema_migrations if table exists
      try {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [migrationFile]);
      } catch (err) {
        // If schema_migrations table doesn't exist, that's okay
        console.log('⚠️  Could not record migration (schema_migrations table may not exist)');
      }
      
      await client.query('COMMIT');
      console.log(`✅ Migration ${migrationFile} completed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Error running migration ${migrationFile}:`, error.message);
      throw error;
    }

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };

