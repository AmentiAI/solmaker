#!/usr/bin/env node

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env,local') });

const DATABASE_URL = process.env.NEON_DATABASE;

if (!DATABASE_URL) {
  console.error('❌ NEON_DATABASE environment variable is not set');
  process.exit(1);
}

async function fixGenerationJobsColumns() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to Neon database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('📋 Fixing generation_jobs table columns...\n');

    // Check current columns in generation_jobs
    console.log('1️⃣ Checking generation_jobs current structure...');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'generation_jobs'
      ORDER BY ordinal_position
    `);
    
    console.log('   Current columns:');
    columns.rows.forEach(r => console.log(`     - ${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`));
    console.log('');

    // Add prompt_description column if missing
    const hasPromptDescription = columns.rows.some(r => r.column_name === 'prompt_description');
    
    if (!hasPromptDescription) {
      console.log('2️⃣ Adding prompt_description column...');
      await client.query(`
        ALTER TABLE generation_jobs 
        ADD COLUMN IF NOT EXISTS prompt_description TEXT;
      `);
      console.log('   ✅ prompt_description column added\n');
    } else {
      console.log('2️⃣ ✓ prompt_description column already exists\n');
    }

    // Verify the fix
    console.log('3️⃣ Verifying updated structure...');
    const updatedColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_name = 'generation_jobs'
      AND column_name = 'prompt_description'
    `);
    
    if (updatedColumns.rows.length > 0) {
      console.log('   ✅ Verification successful: prompt_description exists');
      console.log(`      Type: ${updatedColumns.rows[0].data_type}\n`);
    } else {
      console.log('   ❌ Verification failed: prompt_description not found\n');
    }

    console.log('🎉 Generation jobs table updated successfully!');
    console.log('✨ The cron job should now work without errors\n');

  } catch (error) {
    console.error('❌ Failed to fix columns:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  fixGenerationJobsColumns().catch(console.error);
}

module.exports = { fixGenerationJobsColumns };
