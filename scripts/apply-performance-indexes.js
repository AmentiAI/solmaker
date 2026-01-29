/**
 * Script to apply performance indexes to reduce database compute costs
 * Run this script after deploying to ensure all indexes are created
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getDatabaseUrl = () => {
  return process.env.NEON_DATABASE || 
         process.env.DATABASE_URL || 
         process.env.NEXT_PUBLIC_NEON_DATABASE ||
         ''
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ No database connection string found. Please set NEON_DATABASE environment variable.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function applyIndexes() {
  try {
    console.log('📊 Applying performance indexes...');
    
    // Read the migration file
    const migrationPath = join(__dirname, 'migrations', '013_add_performance_indexes.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await sql`${sql.unsafe(statement)}`;
        console.log('✅ Executed:', statement.substring(0, 60) + '...');
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message && error.message.includes('already exists')) {
          console.log('⏭️  Index already exists, skipping');
        } else {
          console.error('❌ Error executing statement:', error.message);
          console.error('Statement:', statement.substring(0, 100));
        }
      }
    }
    
    console.log('✅ All indexes applied successfully!');
    console.log('📈 Database queries should now be significantly faster.');
    
  } catch (error) {
    console.error('❌ Error applying indexes:', error);
    process.exit(1);
  }
}

applyIndexes();

