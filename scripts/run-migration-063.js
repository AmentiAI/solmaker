#!/usr/bin/env node

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Database connection configuration
const DATABASE_URL = process.env.NEON_DATABASE || process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE or DATABASE_URL in .env.local');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function runMigration() {
  try {
    console.log('🔌 Connecting to database...');
    console.log('✅ Using Neon serverless connection');

    const migrationFile = '063_add_twitter_url_to_profiles.sql';
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    console.log(`🔄 Running migration: ${migrationFile}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Parse SQL statements properly - handle multi-line statements
    const lines = migrationSQL.split('\n');
    let currentStatement = '';
    const allStatements = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comment-only lines
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      
      currentStatement += ' ' + trimmed;
      
      // If line ends with semicolon, we have a complete statement
      if (trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt && stmt.length > 1) {
          // Remove trailing semicolon for cleaner execution
          allStatements.push(stmt.replace(/;\s*$/, ''));
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      allStatements.push(currentStatement.trim());
    }
    
    console.log(`📝 Found ${allStatements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < allStatements.length; i++) {
      const statement = allStatements[i];
      if (statement.trim()) {
        try {
          await sql.unsafe(statement);
          const preview = statement.split('\n')[0].substring(0, 80);
          console.log(`✅ [${i + 1}/${allStatements.length}] Executed: ${preview}...`);
        } catch (stmtError) {
          // Check if it's a column already exists error
          if (stmtError?.message?.includes('already exists') || 
              stmtError?.message?.includes('duplicate key') ||
              (stmtError?.message?.includes('column') && stmtError?.message?.includes('already exists'))) {
            console.log(`⏭️  [${i + 1}/${allStatements.length}] Skipping (already exists): ${statement.substring(0, 60)}...`);
            continue;
          }
          // Check if it's a "does not exist" error for COMMENT statements (column might not exist yet)
          if (stmtError?.message?.includes('does not exist') && statement.toUpperCase().includes('COMMENT')) {
            console.log(`⏭️  [${i + 1}/${allStatements.length}] Skipping COMMENT statement: ${statement.substring(0, 60)}...`);
            continue;
          }
          console.error(`❌ [${i + 1}/${allStatements.length}] Error executing statement:`, stmtError?.message);
          console.error(`Statement: ${statement.substring(0, 200)}`);
          throw stmtError;
        }
      }
    }
    
    // Record migration in schema_migrations if table exists
    try {
      await sql`INSERT INTO schema_migrations (filename) VALUES (${migrationFile}) ON CONFLICT (filename) DO NOTHING`;
      console.log(`   ✅ Recorded migration in schema_migrations`);
    } catch (err) {
      // If schema_migrations table doesn't exist, that's okay
      console.log('⚠️  Could not record migration (schema_migrations table may not exist):', err?.message);
    }
    
    console.log(`✅ Migration ${migrationFile} completed successfully`);

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error?.message || error);
    if (error?.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  runMigration().catch(console.error);
}

module.exports = { runMigration };

