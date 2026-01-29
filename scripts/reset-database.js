#!/usr/bin/env node

const { Client } = require('pg');

// Database connection configuration
const DATABASE_URL = process.env.NEON_DATABASE || 'postgresql://neondb_owner:npg_Fuz8VsTtkwC5@ep-sparkling-cherry-adpxcdzr-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function resetDatabase() {
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

    console.log('🗑️  Dropping existing tables...');
    
    // Drop tables in reverse order (traits -> layers -> collections)
    await client.query('DROP TABLE IF EXISTS traits CASCADE;');
    await client.query('DROP TABLE IF EXISTS layers CASCADE;');
    await client.query('DROP TABLE IF EXISTS collections CASCADE;');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
    
    console.log('✅ Database reset completed!');
    console.log('💡 You can now run: npm run db:setup');

  } catch (error) {
    console.error('❌ Database reset failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the reset
if (require.main === module) {
  resetDatabase().catch(console.error);
}

module.exports = { resetDatabase };
