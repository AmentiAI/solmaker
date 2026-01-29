/**
 * Script to run the compression settings migration
 * Adds compression_quality and compression_dimensions columns to collections table
 * Usage: node scripts/run-compression-migration.js
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
    console.log('📊 Applying compression settings migration...\n');
    
    const migrationPath = join(__dirname, 'migrations', '020_add_compression_settings.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolons and execute each statement
    const lines = migrationSQL.split('\n');
    let currentStatement = '';
    const allStatements = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comment-only lines
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      
      currentStatement += (currentStatement ? ' ' : '') + trimmed;
      
      // If line ends with semicolon, we have a complete statement
      if (trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt && stmt.length > 1) {
          // Remove trailing semicolon
          allStatements.push(stmt.replace(/;\s*$/, ''));
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      allStatements.push(currentStatement.trim());
    }
    
    console.log(`Found ${allStatements.length} statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < allStatements.length; i++) {
      const statement = allStatements[i];
      try {
        await sql.unsafe(statement);
        const preview = statement.split('\n')[0].substring(0, 80);
        console.log(`✅ [${i + 1}/${allStatements.length}] ${preview}...`);
      } catch (error) {
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate') ||
            (errorMsg.includes('column') && errorMsg.includes('already exists'))) {
          console.log(`⏭️  [${i + 1}/${allStatements.length}] Column already exists, skipping`);
        } else {
          console.error(`❌ [${i + 1}/${allStatements.length}] Error:`, errorMsg);
          console.error('Statement:', statement.substring(0, 100));
          throw error;
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📝 Compression settings columns have been added to collections table.');
    console.log('📝 compressed_image_url column has been added to generated_ordinals table.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

