import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.NEON_DATABASE || process.env.DATABASE_URL);

async function fix() {
  console.log('Updating ALL jobs to have proper timestamps...\n');
  
  // Update all completed jobs to have completed_at if missing
  await sql`
    UPDATE generation_jobs 
    SET completed_at = COALESCE(completed_at, created_at + INTERVAL '30 seconds')
    WHERE status = 'completed' AND completed_at IS NULL
  `;
  console.log('✅ Updated completed jobs with completed_at');
  
  // Update all failed jobs to have completed_at if missing
  await sql`
    UPDATE generation_jobs 
    SET completed_at = COALESCE(completed_at, created_at + INTERVAL '30 seconds')
    WHERE status = 'failed' AND completed_at IS NULL
  `;
  console.log('✅ Updated failed jobs with completed_at');
  
  // Update all jobs to have started_at if missing
  await sql`
    UPDATE generation_jobs 
    SET started_at = COALESCE(started_at, created_at)
    WHERE started_at IS NULL
  `;
  console.log('✅ Updated all jobs with started_at');
  
  // Check final state
  const nullCompleted = await sql`SELECT COUNT(*) as count FROM generation_jobs WHERE completed_at IS NULL AND status IN ('completed', 'failed')`;
  const nullStarted = await sql`SELECT COUNT(*) as count FROM generation_jobs WHERE started_at IS NULL AND status IN ('completed', 'failed', 'processing')`;
  
  console.log('\n📊 Final check:');
  console.log(`   Jobs missing completed_at: ${nullCompleted[0].count}`);
  console.log(`   Jobs missing started_at: ${nullStarted[0].count}`);
  console.log('\n✅ Done! All jobs now have timestamps.');
}

fix().catch(console.error);

