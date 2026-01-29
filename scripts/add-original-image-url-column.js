/**
 * Script to add original_image_url column to generated_ordinals table
 * Usage: node scripts/add-original-image-url-column.js
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
    console.log('📊 Adding original_image_url column to generated_ordinals table...\n');
    
    const migrationPath = join(__dirname, 'migrations', '028_add_original_image_url.sql');
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
    
    console.log(`Found ${allStatements.length} statement(s) to execute\n`);
    
    // Execute statements
    for (let i = 0; i < allStatements.length; i++) {
      const statement = allStatements[i];
      try {
        await sql.unsafe(statement);
        const preview = statement.split('\n')[0].substring(0, 80);
        console.log(`✅ [${i + 1}/${allStatements.length}] ${preview}...`);
      } catch (error) {
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log(`⏭️  [${i + 1}/${allStatements.length}] Column already exists, skipping`);
        } else {
          console.error(`❌ [${i + 1}/${allStatements.length}] Error:`, errorMsg);
          console.error('Statement:', statement.substring(0, 100));
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📸 The original_image_url column has been added to the generated_ordinals table.\n');
    console.log('🔄 You can now flip images and restore them to their original state.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

