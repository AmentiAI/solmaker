import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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

async function makeHashNullable() {
  try {
    console.log('📊 Making trait_combination_hash nullable...\n');
    
    await sql`ALTER TABLE generated_ordinals ALTER COLUMN trait_combination_hash DROP NOT NULL`;
    console.log('✅ trait_combination_hash is now nullable');
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

makeHashNullable();

