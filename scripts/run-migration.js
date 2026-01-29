/**
 * Simple script to run the performance indexes migration
 * Usage: node scripts/run-migration.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE in .env.local');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function runMigration() {
  try {
    console.log('📊 Applying performance indexes migration...\n');
    
    const migrationPath = join(__dirname, 'migrations', '013_add_performance_indexes.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolons and execute each statement
    // Filter out comments and empty statements, but keep multi-line statements together
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
    
    // Separate CREATE INDEX statements from ANALYZE
    const createIndexStatements = allStatements.filter(s => 
      s.toUpperCase().includes('CREATE INDEX') || 
      s.toUpperCase().includes('CREATE UNIQUE INDEX')
    );
    const analyzeStatements = allStatements.filter(s => 
      s.toUpperCase().includes('ANALYZE')
    );
    
    console.log(`Found ${createIndexStatements.length} index creation statements\n`);
    
    // Execute CREATE INDEX statements
    for (let i = 0; i < createIndexStatements.length; i++) {
      const statement = createIndexStatements[i];
      try {
        await sql.unsafe(statement);
        const preview = statement.split('\n')[0].substring(0, 80);
        console.log(`✅ [${i + 1}/${createIndexStatements.length}] ${preview}...`);
      } catch (error) {
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log(`⏭️  [${i + 1}/${createIndexStatements.length}] Index already exists, skipping`);
        } else {
          console.error(`❌ [${i + 1}/${createIndexStatements.length}] Error:`, errorMsg);
          console.error('Statement:', statement.substring(0, 100));
          // Don't exit on individual statement errors, continue with rest
        }
      }
    }
    
    // Run ANALYZE separately
    if (analyzeStatements.length > 0) {
      try {
        console.log('\n📈 Updating table statistics...');
        for (const analyzeStmt of analyzeStatements) {
          await sql.unsafe(analyzeStmt);
        }
        console.log('✅ Statistics updated');
      } catch (error) {
        console.error('⚠️  Warning: Could not update statistics:', error.message);
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📉 Database queries should now be significantly faster and cheaper.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

