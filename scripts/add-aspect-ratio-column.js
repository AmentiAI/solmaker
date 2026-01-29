const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function run() {
  try {
    console.log('Adding aspect_ratio columns...');
    
    // Add aspect_ratio to promotion_jobs
    await sql`ALTER TABLE promotion_jobs ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT 'square'`;
    console.log('✅ Added aspect_ratio to promotion_jobs');
    
    // Add aspect_ratio to promotions  
    await sql`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT 'square'`;
    console.log('✅ Added aspect_ratio to promotions');
    
    // Verify columns exist
    const jobsCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'promotion_jobs' AND column_name = 'aspect_ratio'`;
    console.log('promotion_jobs verification:', jobsCols.length > 0 ? 'Column exists ✅' : 'Column missing ❌');
    
    const promoCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'aspect_ratio'`;
    console.log('promotions verification:', promoCols.length > 0 ? 'Column exists ✅' : 'Column missing ❌');
    
    console.log('\n✅ Migration complete!');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();

