import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { compressImage, needsCompression } from '@/lib/image-compression';
import crypto from 'crypto';
import { createThumbnail, getFileSizeKB, createContentViolationImage } from '@/lib/image-optimizer';
import { sql } from '@/lib/database';
import { checkAuthorizationServer } from '@/lib/auth/access-control';
import { getOrCreateCredits } from '@/lib/credits/credits';

// Force dynamic rendering - prevent caching
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/cron/process-generation-jobs-v2 - Process pending generation jobs (called by Vercel Cron)
// Also accepts POST for manual triggering (development/testing)
// NOTE: Renamed from process-generation-jobs to force fresh deployment and bypass Vercel function cache
export async function GET(request: NextRequest) {
  // Verify this is a cron request (skip in development if no CRON_SECRET)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Only require auth if CRON_SECRET is set (production)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    //return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return processJobs();
}

export async function POST(request: NextRequest) {
  try {
    // Allow manual triggering for development/testing (admin only)
    // Check if user is admin
    const body = await request.json().catch(() => ({}));
    const walletAddress = body.wallet_address || null;
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    if (!sql) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
    }
    
    const { isAdmin } = await checkAuthorizationServer(walletAddress, sql);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }
    
    return await processJobs();
  } catch (error) {
    console.error('[Cron POST] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to process jobs',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

// Helper function to save generation errors to the database
async function saveGenerationError(
  jobId: string,
  collectionId: string | null,
  ordinalNumber: number | null,
  errorType: string,
  errorMessage: string,
  errorDetails: any = null,
  apiResponse: any = null,
  prompt: string | null = null
) {
  if (!sql) {
    console.error('[Cron] Cannot save generation error: Database not available');
    return;
  }

  try {
    // Handle null/empty collectionId - use null instead of empty string for uuid column
    const validCollectionId = collectionId && collectionId.trim() ? collectionId : null;
    
    await sql`
      INSERT INTO generation_errors (
        generation_job_id,
        collection_id,
        ordinal_number,
        error_type,
        error_message,
        error_details,
        api_response,
        prompt
      )
      VALUES (
        ${jobId}::uuid,
        ${validCollectionId ? sql`${validCollectionId}::uuid` : sql`NULL`},
        ${ordinalNumber},
        ${errorType},
        ${errorMessage},
        ${errorDetails ? JSON.stringify(errorDetails) : null}::jsonb,
        ${apiResponse ? JSON.stringify(apiResponse) : null}::jsonb,
        ${prompt}
      )
    `;
    console.log(`[Cron] Saved generation error for job ${jobId}: ${errorType}`);
  } catch (saveError) {
    console.error('[Cron] Failed to save generation error:', saveError);
    // Don't throw - we don't want error saving to break the cron job
  }
}

async function processJobs() {
  console.log('[Cron] Starting processJobs function...');

  if (!sql) {
    console.error('[Cron] Database connection not available');
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  console.log('[Cron] Database connection OK');

  try {
    // ============================================
    // PROMOTION JOBS: Check for completed video jobs (fallback if callback failed)
    // ============================================
    try {
      // Find jobs that are processing and have a Kie AI taskId stored
      // Check jobs that have been processing for at least 30 seconds (to give callback time)
      // Also check older jobs that might have missed callbacks (up to 30 minutes old)
      const processingVideoJobs = await sql`
        SELECT id, error_message, started_at
        FROM promotion_jobs
        WHERE status = 'processing'
          AND error_message LIKE 'KIE_AI_TASK_ID:%'
          AND started_at < NOW() - INTERVAL '30 seconds'
          AND started_at > NOW() - INTERVAL '30 minutes'
        ORDER BY started_at ASC
        LIMIT 10
      ` as any[];
      
      if (processingVideoJobs.length > 0) {
        console.log(`[Cron] Checking ${processingVideoJobs.length} processing video job(s) for completion...`);
        
        const kieApiKey = process.env.KIE_AI_API_KEY;
        const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
        
        if (kieApiKey) {
          for (const job of processingVideoJobs) {
            try {
              // Extract taskId from error_message (format: "KIE_AI_TASK_ID:taskId")
              const taskIdMatch = job.error_message?.match(/KIE_AI_TASK_ID:(.+)/);
              if (!taskIdMatch) continue;
              
              const taskId = taskIdMatch[1];
              // Try Veo 3.1 endpoint first: /api/v1/veo/record-info
              let recordInfoEndpoint = `${kieApiEndpoint}/api/v1/veo/record-info?taskId=${taskId}`;
              
              console.log(`[Cron] Checking task ${taskId} for job ${job.id}...`);
              
              let recordRes = await fetch(recordInfoEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${kieApiKey}`,
                },
              });
              
              // If 404, try the old endpoint format
              if (recordRes.status === 404) {
                recordInfoEndpoint = `${kieApiEndpoint}/api/v1/jobs/recordInfo?taskId=${taskId}`;
                console.log(`[Cron] Veo 3.1 endpoint not found, trying old format: ${recordInfoEndpoint}`);
                recordRes = await fetch(recordInfoEndpoint, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${kieApiKey}`,
                  },
                });
              }
              
              const recordData = await recordRes.json().catch((e) => {
                console.error(`[Cron] Failed to parse JSON response for task ${taskId}:`, e);
                return null;
              });
              
              if (!recordData) {
                console.error(`[Cron] No response data for task ${taskId}`);
                continue;
              }
              
              console.log(`[Cron] Task ${taskId} response:`, JSON.stringify(recordData, null, 2));
              
              if (!recordRes.ok) {
                console.error(`[Cron] HTTP error checking task ${taskId}:`, recordRes.status, recordRes.statusText);
                console.error(`[Cron] Response:`, recordData);
                continue;
              }
              
              if (recordData.code !== 200) {
                console.error(`[Cron] Kie AI API error for task ${taskId}:`, {
                  code: recordData.code,
                  message: recordData.message || recordData.msg,
                  fullResponse: recordData
                });
                continue;
              }
              
              if (!recordData.data) {
                console.error(`[Cron] No data field in response for task ${taskId}:`, recordData);
                continue;
              }
              
              // Handle Veo 3.1 format: { code: 200, data: { taskId, response: { resultUrls: [...] }, successFlag: 1 } }
              // Or old recordInfo format: { code: 200, data: { taskId, state, resultJson, ... } }
              // successFlag: 1 = success, 0 = still processing, 2+ = various failures (3 = content policy)
              const data = recordData.data || {};
              let state: string;
              let resultInfo: any = null;
              let failMsg: string | null = null;
              
              if (recordData.code === 200) {
                // First check for explicit failure via successFlag (e.g., 3 = content policy violation)
                if (data.successFlag !== undefined && data.successFlag !== 0 && data.successFlag !== 1) {
                  // Explicit failure (successFlag: 2, 3, etc.)
                  state = 'fail';
                  const rawMsg = data.errorMessage || recordData.msg;
                  if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
                    failMsg = rawMsg;
                  } else {
                    failMsg = `Video generation failed (successFlag: ${data.successFlag})`;
                  }
                  console.log(`[Cron] Task ${taskId} failed with successFlag: ${data.successFlag}, errorMessage: ${failMsg}`);
                } else if (data.response && data.response.resultUrls && data.response.resultUrls.length > 0) {
                  // Has result URLs - check successFlag
                  if (data.successFlag === 1) {
                    state = 'success';
                    resultInfo = data.response;
                  } else {
                    // Has resultUrls but successFlag is not 1 - treat as failure with partial results
                    state = 'fail';
                    failMsg = data.errorMessage || recordData.msg || `Video generation failed (successFlag: ${data.successFlag})`;
                  }
                } else if (data.info && data.info.resultUrls && data.info.resultUrls.length > 0) {
                  // Alternative Veo 3.1 format with info.resultUrls
                  state = 'success';
                  resultInfo = data.info;
                } else if (data.state === 'success' || data.state === 'fail') {
                  // Old format from recordInfo
                  state = data.state;
                  if (data.resultJson) {
                    try {
                      resultInfo = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
                    } catch (e) {
                      console.error(`[Cron] Failed to parse resultJson for task ${taskId}:`, e);
                      continue;
                    }
                  }
                  // Validate failMsg - don't use if it's a state value or empty
                  const rawFailMsg = data.failMsg || data.errorMessage || null;
                  if (rawFailMsg && rawFailMsg !== 'success' && rawFailMsg !== 'fail' && rawFailMsg.length > 2) {
                    failMsg = rawFailMsg;
                  } else {
                    failMsg = null;
                  }
                } else if (data.errorMessage && data.errorMessage !== 'success' && data.errorMessage.length > 2) {
                  // Has explicit error message - this is a failure
                  state = 'fail';
                  failMsg = data.errorMessage;
                  console.log(`[Cron] Task ${taskId} failed with errorMessage: ${failMsg}`);
                } else {
                  // code: 200, no resultUrls, no explicit error, successFlag: 0 = still processing
                  console.log(`[Cron] Task ${taskId} still processing, successFlag: ${data.successFlag}`);
                  continue;
                }
              } else {
                // Failed
                state = 'fail';
                failMsg = recordData.msg || recordData.message || `Failed with code ${recordData.code}`;
              }
              
              console.log(`[Cron] Task ${taskId} state: ${state}, has resultUrls: ${!!resultInfo?.resultUrls}`);
              
              if (state === 'success' || state === 'fail') {
                console.log(`[Cron] Task ${taskId} is ${state}, triggering callback processing...`);
                try {
                  // Convert to format handler expects
                  const resultJson = resultInfo ? JSON.stringify(resultInfo) : null;
                  // Import and use the shared callback handler
                  const { handleKieAiCallback } = await import('@/lib/promotion/kie-ai-callback-handler');
                  await handleKieAiCallback(job.id, state, resultJson, failMsg, null, taskId);
                  console.log(`[Cron] Successfully processed task ${taskId} for job ${job.id}`);
                } catch (callbackError: any) {
                  console.error(`[Cron] Error processing callback for task ${taskId}:`, callbackError);
                  console.error(`[Cron] Callback error message:`, callbackError.message);
                  console.error(`[Cron] Callback error stack:`, callbackError.stack);
                  // Don't continue to next job - log and move on
                }
              }
            } catch (checkError: any) {
              console.error(`[Cron] Error checking task for job ${job.id}:`, checkError.message);
            }
          }
        }
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e || 'Unknown error');
      if (!errorMsg.toLowerCase().includes('does not exist') && !errorMsg.toLowerCase().includes('relation')) {
        console.error('[Cron] Error checking video job completion:', errorMsg);
      }
    }

    // ============================================
    // PROMOTION JOBS: Clean up stuck jobs (after checking for completion)
    // EXCLUDE video jobs waiting for Kie AI callbacks - they can take 5-10+ minutes
    // ============================================
    // Handle stuck promotion jobs (timeout after 5 minutes)
    // Preserve taskId if it exists in error_message
    try {
      // First, get stuck jobs and preserve their taskIds
      const stuckJobs = await sql`
        SELECT id, error_message
        FROM promotion_jobs
        WHERE status = 'processing'
          AND started_at < NOW() - INTERVAL '5 minutes'
        FOR UPDATE
      ` as any[];
      
      for (const job of stuckJobs) {
        // Extract taskId if it exists
        const taskIdMatch = job.error_message?.match(/KIE_AI_TASK_ID:(.+)/);
        const taskId = taskIdMatch ? taskIdMatch[1] : null;
        
        // Preserve taskId in error message if it exists
        const errorMessage = taskId 
          ? `Job timed out - stuck in processing state for more than 5 minutes. KIE_AI_TASK_ID:${taskId}`
          : 'Job timed out - stuck in processing state for more than 5 minutes';
        
        await sql`
          UPDATE promotion_jobs
          SET
            status = 'failed',
            completed_at = CURRENT_TIMESTAMP,
            error_message = ${errorMessage}
          WHERE id = ${job.id}::uuid
        `;
      }
      
      if (stuckJobs.length > 0) {
        console.log(`[Cron] Cleaned up ${stuckJobs.length} stuck promotion job(s) (preserving taskIds where available)`);
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e || 'Unknown error');
      if (!errorMsg.toLowerCase().includes('does not exist') && !errorMsg.toLowerCase().includes('relation')) {
        console.error('[Cron] Error cleaning up stuck promotion jobs:', errorMsg);
      }
    }

    // ============================================
    // STEP 1: Clean up stuck jobs (started but never completed)
    // Jobs that have been "processing" for more than 5 minutes are considered stuck
    // ============================================
    const stuckJobsResult = await sql`
      UPDATE generation_jobs
      SET 
        status = 'failed',
        completed_at = CURRENT_TIMESTAMP,
        error_message = 'Job timed out - stuck in processing state for more than 5 minutes'
      WHERE status = 'processing'
        AND started_at < NOW() - INTERVAL '5 minutes'
      RETURNING id
    `;
    
    const stuckJobs = Array.isArray(stuckJobsResult) ? stuckJobsResult : [];
    if (stuckJobs.length > 0) {
      console.log(`[Cron] Cleaned up ${stuckJobs.length} stuck job(s) that were processing for >5 minutes`);
    }

    // ============================================
    // STEP 2: Get collections with pending jobs
    // ============================================
    // Get collections with pending jobs, ordered by oldest job first (fair distribution)
    const collectionsWithJobs = await sql`
      SELECT collection_id, MIN(created_at) as oldest_job
      FROM generation_jobs
      WHERE status = 'pending'
      GROUP BY collection_id
      ORDER BY oldest_job ASC
      LIMIT 50
    `;

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    const allJobs: any[] = [];
    const collectionsCount = Array.isArray(collectionsWithJobs) ? collectionsWithJobs.length : 0;

    if (Array.isArray(collectionsWithJobs) && collectionsWithJobs.length > 0) {
      console.log(`[Cron] Found ${collectionsWithJobs.length} collection(s) with pending jobs`);

      // Process up to 20 jobs per collection (allows full batch processing per user)
      for (const row of collectionsWithJobs) {
        const collectionId = (row as any).collection_id;
        const jobsForCollection = await sql`
          SELECT id, collection_id, ordinal_number, trait_overrides, prompt_description, image_model
          FROM generation_jobs
          WHERE collection_id = ${collectionId}
          AND status = 'pending'
          ORDER BY created_at ASC
          LIMIT 20
        `;
        
        if (Array.isArray(jobsForCollection) && jobsForCollection.length > 0) {
          allJobs.push(...jobsForCollection);
          console.log(`[Cron] Collection ${collectionId}: ${jobsForCollection.length} job(s) queued for processing`);
        }
      }

      if (allJobs.length > 0) {
        console.log(`[Cron] Processing ${allJobs.length} jobs across ${collectionsWithJobs.length} collection(s)`);

        // Process jobs concurrently (each collection's jobs process independently)
        const results = await Promise.allSettled(
          allJobs.map((job: any) =>
            processJob(job.id, job.collection_id, job.ordinal_number, job.trait_overrides, job.prompt_description, job.image_model)
          )
        );

        successful = results.filter(r => r.status === 'fulfilled').length;
        failed = results.filter(r => r.status === 'rejected').length;

        errors.push(
          ...results
            .filter(r => r.status === 'rejected')
            .map(r => r.reason?.message || String(r.reason || 'Unknown error'))
        );
      }
    } else {
      console.log('[Cron] No pending generation jobs found');
    }

    // ============================================
    // PROMOTION JOBS: Process pending promotion jobs
    // ============================================
    let promoProcessed = 0;
    let promoSuccessful = 0;
    let promoFailed = 0;
    const promoErrors: string[] = [];

    try {
      console.log('[Cron] Checking for pending promotion jobs...');
      
      // First, check for any pending jobs
      const pendingCountRes = await sql`
        SELECT COUNT(*)::int as count
        FROM promotion_jobs
        WHERE status = 'pending'
      `;
      const pendingCount = Array.isArray(pendingCountRes) && pendingCountRes.length > 0 
        ? Number((pendingCountRes[0] as any)?.count || 0) 
        : 0;
      
      console.log(`[Cron] Found ${pendingCount} pending promotion job(s)`);

      if (pendingCount > 0) {
        const promoJobs = await sql`
          SELECT
            id,
            wallet_address,
            collection_id,
            flyer_text,
            no_text,
            subject_type,
            subject_count,
            subject_actions,
            aspect_ratio
          FROM promotion_jobs
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 10
        `;

        const promoList = Array.isArray(promoJobs) ? promoJobs : [];
        console.log(`[Cron] Retrieved ${promoList.length} promotion job(s) from database`);
        
        if (promoList.length > 0) {
          console.log(`[Cron] Processing ${promoList.length} promotion job(s):`, promoList.map((j: any) => j.id));
          
          // Debug logging for UUID issue - log raw values from DB
          promoList.forEach((j: any, idx: number) => {
            console.log(`[Cron] Job ${idx} raw values:`, {
              id: j.id,
              collection_id: j.collection_id,
              collection_id_type: typeof j.collection_id,
              collection_id_is_null: j.collection_id === null,
              collection_id_is_empty: j.collection_id === '',
              collection_id_stringified: JSON.stringify(j.collection_id),
            });
          });
          
          const promoResults = await Promise.allSettled(
            promoList.map((j: any) => {
              const jobId = String(j.id || '');
              if (!jobId) {
                console.error('[Cron] Promotion job missing id:', j);
                return Promise.reject(new Error('Job missing id'));
              }
              
              // Convert collection_id properly - null, undefined, and empty string all become null
              const rawCollectionId = j.collection_id;
              const processedCollectionId = (rawCollectionId && rawCollectionId !== '' && rawCollectionId !== 'null') 
                ? String(rawCollectionId) 
                : null;
              
              console.log(`[Cron] Starting to process promotion job ${jobId}, collectionId: ${processedCollectionId} (raw: ${rawCollectionId})`);
              return processPromotionJob(
                jobId,
                String(j.wallet_address || ''),
                processedCollectionId,
                String(j.flyer_text ?? ''),
                Boolean(j.no_text),
                String(j.subject_type ?? 'character'),
                Number(j.subject_count ?? 1),
                j.subject_actions,
                String(j.aspect_ratio ?? 'square')
              );
            })
          );

          promoProcessed = promoList.length;
          promoSuccessful = promoResults.filter(r => r.status === 'fulfilled').length;
          promoFailed = promoResults.filter(r => r.status === 'rejected').length;
          
          promoResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              const error = (result as PromiseRejectedResult).reason?.message || String((result as PromiseRejectedResult).reason || 'Unknown error');
              const job = promoList[index] as any;
              console.error(`[Cron] Promotion job ${job?.id} failed:`, error);
              promoErrors.push(error);
            }
          });
          
          if (promoFailed > 0) {
            console.error(`[Cron] ${promoFailed} promotion job(s) failed:`, promoErrors);
          }
          if (promoSuccessful > 0) {
            console.log(`[Cron] Successfully processed ${promoSuccessful} promotion job(s)`);
          }
        } else {
          console.warn(`[Cron] Found ${pendingCount} pending promotion job(s) but query returned 0 results (possible query issue)`);
        }
      }
    } catch (e: any) {
      // Log the error instead of silently ignoring it
      const errorMsg = e?.message || String(e || 'Unknown error');
      console.error('[Cron] Error processing promotion jobs:', errorMsg);
      console.error('[Cron] Full error:', e);
      // Check if it's a table doesn't exist error
      if (errorMsg.toLowerCase().includes('does not exist') || errorMsg.toLowerCase().includes('relation') || errorMsg.toLowerCase().includes('table')) {
        console.error('[Cron] promotion_jobs table may not exist. Please run migration 038_create_promotion_jobs.sql');
      } else {
        // Re-throw non-table errors as they might be important
        promoErrors.push(errorMsg);
      }
    }

    return NextResponse.json({
      message: 'Jobs processed',
      processed: allJobs.length,
      collections: collectionsCount,
      successful,
      failed,
      stuckJobsCleaned: stuckJobs.length,
      errors: errors.length > 0 ? errors : undefined,
      promotion: {
        processed: promoProcessed,
        successful: promoSuccessful,
        failed: promoFailed,
        errors: promoErrors.length > 0 ? promoErrors : undefined,
      },
    });

  } catch (error) {
    console.error('[Cron] Error processing jobs:', error);
    return NextResponse.json({ error: 'Failed to process jobs', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function mapPromotionError(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const lower = s.toLowerCase()
  if (
    lower.includes('billing') ||
    lower.includes('hard limit') ||
    lower.includes('insufficient_quota') ||
    lower.includes('insufficient quota') ||
    lower.includes('quota') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('payment') ||
    lower.includes('please check your plan')
  ) {
    return 'Platform Undergoing Maitnence'
  }
  if (
    lower.includes('safety_violations') ||
    lower.includes('content policy') ||
    lower.includes('content_policy_violation') ||
    lower.includes('moderation') ||
    lower.includes('safety') ||
    lower.includes('"sexual"') ||
    lower.includes('[sexual]') ||
    lower.includes('sexual')
  ) {
    return 'Content violation'
  }
  return typeof raw === 'string' && raw.trim() ? raw : 'Failed to generate flyer'
}

async function processPromotionJob(
  jobId: string,
  walletAddress: string,
  collectionId: string | null,
  flyerText: string,
  noText: boolean,
  subjectType: string,
  subjectCount: number,
  subjectActionsRaw: any,
  aspectRatio: string = 'square'
) {
  if (!sql) throw new Error('Database not available');

  // Debug logging for UUID issue
  console.log(`[Cron] processPromotionJob called with:`, {
    jobId,
    walletAddress: walletAddress?.substring(0, 20) + '...',
    collectionId,
    collectionIdType: typeof collectionId,
    collectionIdIsNull: collectionId === null,
    collectionIdIsEmpty: collectionId === '',
    collectionIdIsFalsy: !collectionId,
  });

  if (!jobId || !jobId.trim()) {
    throw new Error('Invalid job ID');
  }

  // Mark as processing
  try {
    const updateResult = await sql`
      UPDATE promotion_jobs
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId}::uuid
        AND status = 'pending'
      RETURNING id
    `;
    
    const updated = Array.isArray(updateResult) ? updateResult : [];
    if (updated.length === 0) {
      // Job might have been picked up by another process or doesn't exist
      throw new Error(`Job ${jobId} not found or already processing`);
    }
    console.log(`[Cron] Marked promotion job ${jobId} as processing`);
  } catch (updateError: any) {
    const errorMsg = updateError?.message || String(updateError || 'Unknown error');
    console.error(`[Cron] Failed to mark promotion job ${jobId} as processing:`, errorMsg);
    throw new Error(`Failed to start job: ${errorMsg}`);
  }

  try {
    const n = Math.max(1, Math.min(8, Number(subjectCount || 1)));
    
    // Parse subject_actions if it's a string (PostgreSQL JSONB might come as string)
    let subjectActions: any = subjectActionsRaw;
    if (typeof subjectActionsRaw === 'string') {
      try {
        subjectActions = JSON.parse(subjectActionsRaw);
      } catch (e) {
        console.error(`[Cron] Failed to parse subject_actions for job ${jobId}:`, e);
        subjectActions = null;
      }
    }

    // Check if this is a v2 job with specific ordinal IDs
    const isSelectedMode = subjectType === 'selected' && 
      typeof subjectActions === 'object' && 
      subjectActions !== null &&
      Array.isArray(subjectActions.ordinal_ids);
    
    let seedPrompts: string[] = [];
    let scenePrompt = '';
    let actions: string[] = [];

    // Fetch collection (for name; we intentionally do NOT use description in the prompt)
    // Note: collectionId may be null for upload/flyer video sources
    let col: any = null;
    if (collectionId) {
      const colRes = await sql`
        SELECT id, name
        FROM collections
        WHERE id = ${collectionId}::uuid
        LIMIT 1
      `;
      col = Array.isArray(colRes) && colRes.length > 0 ? (colRes[0] as any) : null;
      if (!col?.id) throw new Error('Collection not found');
    }

    // Check if this is a video job
    const isVideoJob = typeof subjectActions === 'object' && 
                       subjectActions !== null &&
                       subjectActions.content_type === 'video';
    
    console.log(`[Cron] Promotion job ${jobId} - isVideoJob: ${isVideoJob}, subjectActions type: ${typeof subjectActionsRaw}, parsed type: ${typeof subjectActions}, content_type: ${subjectActions?.content_type}`);
    
    // For video jobs, fetch image URLs based on source type; for flyer jobs, fetch prompts
    let imageUrls: string[] = [];
    
    if (isVideoJob) {
      // Handle different video source types
      const videoSourceType = String(subjectActions?.video_source_type || 'collection').trim();
      
      if (videoSourceType === 'collection') {
        // Collection source: fetch image URLs from ordinals
        if (!collectionId) {
          throw new Error('Collection ID is required for collection source');
        }
        const ordinalIds = subjectActions?.ordinal_ids as string[] || [];
        if (ordinalIds.length === 0) {
          throw new Error('No ordinal IDs provided for collection source');
        }
        
        const imageRes = await sql`
          SELECT id, image_url, compressed_image_url, thumbnail_url
          FROM generated_ordinals
          WHERE id = ANY(${ordinalIds}::uuid[])
            AND collection_id = ${collectionId}::uuid
        `;
        const imageMap = new Map((Array.isArray(imageRes) ? imageRes : []).map((r: any) => [
          String(r.id), 
          String(r.image_url || r.compressed_image_url || r.thumbnail_url || '')
        ]));
        
        // Maintain order of selection
        imageUrls = ordinalIds
          .map(id => imageMap.get(id) || '')
          .filter(Boolean);
        
        if (imageUrls.length < ordinalIds.length) {
          throw new Error(`Some selected images don't have image URLs. Found ${imageUrls.length} of ${ordinalIds.length}.`);
        }
      } else if (videoSourceType === 'flyer') {
        // Flyer source: use the flyer's image URL
        const flyerIdRaw = String(subjectActions?.flyer_id || '').trim();
        if (!flyerIdRaw) {
          throw new Error('No flyer ID provided for flyer source');
        }
        
        // Check if it's a job_ prefixed ID (UUID from promotion_jobs) or regular ID (INTEGER from promotions)
        const isJobId = flyerIdRaw.startsWith('job_');
        const cleanId = isJobId ? flyerIdRaw.replace('job_', '') : flyerIdRaw;
        
        let flyer: any = null;
        
        if (isJobId) {
          // Try promotion_jobs table first (UUID)
          const jobRes = await sql`
            SELECT image_url
            FROM promotion_jobs
            WHERE id = ${cleanId}::uuid
            LIMIT 1
          `;
          flyer = Array.isArray(jobRes) ? (jobRes[0] as any) : null;
        } else {
          // Try promotions table (INTEGER)
          const flyerRes = await sql`
            SELECT image_url
            FROM promotions
            WHERE id = ${parseInt(cleanId)}
            LIMIT 1
          `;
          flyer = Array.isArray(flyerRes) ? (flyerRes[0] as any) : null;
          
          // If not found in promotions, try promotion_jobs as fallback (in case it's actually a UUID without prefix)
          if (!flyer || !flyer.image_url) {
            try {
              const jobRes = await sql`
                SELECT image_url
                FROM promotion_jobs
                WHERE id = ${cleanId}::uuid
                LIMIT 1
              `;
              flyer = Array.isArray(jobRes) ? (jobRes[0] as any) : null;
            } catch {
              // Ignore if UUID cast fails
            }
          }
        }
        
        if (!flyer || !flyer.image_url) {
          throw new Error(`Flyer not found or has no image URL: ${flyerIdRaw}`);
        }
        
        imageUrls = [flyer.image_url];
      } else if (videoSourceType === 'upload') {
        // Upload source: use the uploaded image URL
        const uploadedImageUrl = String(subjectActions?.uploaded_image_url || '').trim();
        if (!uploadedImageUrl) {
          throw new Error('No uploaded image URL provided for upload source');
        }
        imageUrls = [uploadedImageUrl];
      } else {
        throw new Error(`Invalid video source type: ${videoSourceType}`);
      }
    }
    
    if (!isVideoJob) {
      // Flyer jobs: fetch prompts
      if (isSelectedMode) {
        // V2 mode: Fetch data for specific ordinal IDs
        const ordinalIds = subjectActions?.ordinal_ids as string[] || [];
        scenePrompt = String(subjectActions?.scene_prompt || '').trim();
        
        if (!collectionId) {
          throw new Error('Collection ID is required for flyer generation');
        }
        
        // For flyer: fetch prompts
        const promptRes = await sql`
          SELECT id, prompt
          FROM generated_ordinals
          WHERE id = ANY(${ordinalIds}::uuid[])
            AND collection_id = ${collectionId}::uuid
            AND prompt IS NOT NULL
            AND prompt <> ''
        `;
        const ordinalMap = new Map((Array.isArray(promptRes) ? promptRes : []).map((r: any) => [String(r.id), String(r.prompt || '')]));
        
        // Maintain order of selection
        seedPrompts = ordinalIds
          .map(id => ordinalMap.get(id) || '')
          .filter(Boolean);
        
        if (seedPrompts.length < ordinalIds.length) {
          throw new Error(`Some selected images don't have prompts. Found ${seedPrompts.length} of ${ordinalIds.length}.`);
        }
      } else {
        // V1 mode: Random selection with individual actions
        actions = Array.isArray(subjectActions)
          ? subjectActions.slice(0, n).map((a: any) => String(a ?? '').slice(0, 120))
          : [];

        if (!collectionId) {
          throw new Error('Collection ID is required for flyer generation');
        }

        // For flyer: fetch prompts (existing behavior)
        const promptRes = await sql`
          SELECT prompt
          FROM generated_ordinals
          WHERE collection_id = ${collectionId}::uuid
            AND prompt IS NOT NULL
            AND prompt <> ''
          ORDER BY RANDOM()
          LIMIT ${n}
        `;
        seedPrompts = (Array.isArray(promptRes) ? promptRes : [])
          .map((r: any) => String(r?.prompt || ''))
          .filter(Boolean);
        
        if (seedPrompts.length < n) {
          throw new Error(`Not enough saved prompts found for this collection yet. Need ${n}, found ${seedPrompts.length}. Generate more images first.`);
        }
      }
    }

    // Only create seedBlock for flyer jobs (not needed for video jobs which use imageUrls)
    const seedBlock = !isVideoJob ? seedPrompts.map((p, i) => `PROMPT ${i + 1}:\n${p}`).join('\n\n') : '';
    const normalizedSubjectType = subjectType === 'selected' ? 'character' : (subjectType && String(subjectType).toLowerCase() === 'object' ? 'object' : 'character');
    
    // Build actions block - for v2 mode, use scene prompt; for v1, use individual actions
    let actionsBlock = '';
    if (isSelectedMode && scenePrompt) {
      actionsBlock = `SCENE/ACTION FOR ALL: ${scenePrompt}`;
    } else if (actions.length > 0) {
      actionsBlock = actions
        .map((a, i) =>
          normalizedSubjectType === 'object'
            ? `OBJECT ${i + 1} DETAILS: ${a && a.trim() ? a.trim() : '(random object)'}`
            : `CHARACTER ${i + 1} ACTION: ${a && a.trim() ? a.trim() : '(random action)'}`
        )
        .join('\n');
    }

    // Map aspect ratio to OpenAI size format and description
    // Note: OpenAI only supports 1024x1024, 1024x1536, 1536x1024, and 'auto'
    const aspectRatioConfig: Record<string, { size: string; description: string }> = {
      'square': { size: '1024x1024', description: '1024x1024 square' },
      'portrait': { size: '1024x1536', description: '1024x1536 portrait (2:3 ratio, great for posters)' },
      'landscape': { size: '1536x1024', description: '1536x1024 landscape (3:2 ratio, great for banners)' },
      'story': { size: '1024x1536', description: '1024x1536 tall portrait (best for mobile stories)' }, // Story uses portrait size
    };
    const { size: imageSize, description: sizeDescription } = aspectRatioConfig[aspectRatio] || aspectRatioConfig['square'];

    const prompt = `You are designing a promotional flyer.

STYLE SEED PROMPTS (randomly selected from this collection). Use them ONLY to match the visual style:
${seedBlock}

${actionsBlock ? `${isSelectedMode ? 'SCENE DIRECTION' : (normalizedSubjectType === 'object' ? 'OBJECT DETAILS' : 'CHARACTER ACTIONS')}:\n${actionsBlock}\n` : ''}

${noText ? 'NO TEXT MODE: Do not include ANY text, letters, numbers, words, logos, or watermarks anywhere in the image.' : `TEXT TO INCLUDE (must be clearly readable, no typos):\n${flyerText}`}

STYLE REQUIREMENTS:
- Match the same art style, rendering approach, and aesthetic as the STYLE SEED PROMPTS.
- Create ONE cohesive flyer image containing EXACTLY ${n} distinct ${normalizedSubjectType === 'object' ? 'objects' : 'characters'}.
- Each ${normalizedSubjectType === 'object' ? 'object' : 'character'} should be inspired by PROMPT i and must match ${normalizedSubjectType === 'object' ? 'OBJECT i DETAILS' : 'CHARACTER i ACTION'} (if provided).
- All subjects must exist in ONE scene with ONE shared background. Do NOT create separate panels, tiles, collages of different backgrounds, or split-screen layouts.
- Use consistent lighting and perspective across all subjects so it feels like a single composition.
- Do NOT recreate any exact existing artwork.
${noText ? '- Absolutely no text/letters/numbers/symbols/watermarks.' : '- If any seed prompt says "no text" or similar, IGNORE that instruction — you MUST include the TEXT TO INCLUDE above.'}

DESIGN REQUIREMENTS:
- ${sizeDescription} flyer
${noText ? '- Do not render any typography at all.' : '- The text can be placed ANYWHERE that looks best for the design (top/center/bottom/diagonal), but MUST be clearly readable.\n- You may choose hierarchy (headline/subheadline/callout), but you must include the exact TEXT TO INCLUDE above.'}
- No extra random words, no watermarks
- Keep composition clean and professional`;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    let uploaded: { url: string };
    
    if (isVideoJob) {
      // Video generation using Kie AI Veo 3.1 API with image-to-video
      const videoScene = String(subjectActions?.video_scene || '').trim();
      const videoActions = String(subjectActions?.video_actions || '').trim();
      const videoSpeech = String(subjectActions?.video_speech || '').trim();
      
      // Build video prompt from scene, actions, and optional speech
      // Example: "character is driving down the road in rainy weather on the tractor singing 'sweet home alabama' song"
      let videoPromptParts: string[] = [];
      
      if (videoScene) {
        videoPromptParts.push(videoScene);
      }
      
      if (videoActions) {
        videoPromptParts.push(videoActions);
      }
      
      if (videoSpeech) {
        videoPromptParts.push(videoSpeech);
      }
      
      // If nothing provided, use a default
      const collectionName = col?.name || 'collection';
      const videoPrompt = videoPromptParts.length > 0 
        ? videoPromptParts.join(' ')
        : `A promotional video from "${collectionName}" collection`;

      // Use Kie AI Veo 3.1 API
      const kieApiKey = process.env.KIE_AI_API_KEY || 'b7d2d820a349cf654b4c68fa6e1e2c33';
      const kieApiBaseUrl = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
      const veoGenerateEndpoint = `${kieApiBaseUrl}/api/v1/veo/generate`;
      
      // Log environment variable status (without exposing full values)
      console.log(`[Cron] Kie AI Veo 3.1 Configuration:`, {
        baseUrl: kieApiBaseUrl,
        veoGenerateEndpoint,
        endpointSet: !!process.env.KIE_AI_API_ENDPOINT,
        endpointFromEnv: process.env.KIE_AI_API_ENDPOINT || 'NOT SET (using default)',
        keySet: !!process.env.KIE_AI_API_KEY,
        keyLength: kieApiKey ? kieApiKey.length : 0,
        allEnvVars: Object.keys(process.env).filter(k => k.includes('KIE')).join(', ') || 'none',
      });
      
      // Map aspect ratio (Veo 3.1 uses '16:9' | '9:16' | 'Auto')
      const veoAspectRatio = aspectRatio === 'portrait' ? '9:16' : '16:9';
      
      // Use veo3_fast for cost efficiency, or veo3 for highest quality
      const veoModel = 'veo3_fast'; // 'veo3' for quality, 'veo3_fast' for cost efficiency
      
      // Generation type: REFERENCE_2_VIDEO (with images)
      const generationType = 'REFERENCE_2_VIDEO';
      
      console.log(`[Cron] Starting Kie AI Veo 3.1 video generation for job ${jobId}`, {
        endpoint: veoGenerateEndpoint,
        aspectRatio: veoAspectRatio,
        model: veoModel,
        generationType,
        promptLength: videoPrompt.length,
        imageUrlsCount: imageUrls.length,
        hasScene: !!videoScene,
        hasActions: !!videoActions,
        hasSpeech: !!videoSpeech
      });

      // Get base URL for callback
      // Priority: NEXT_PUBLIC_BASE_URL > VERCEL_URL > fallback
      let baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (!baseUrl && process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      }
      if (!baseUrl) {
        baseUrl = 'http://localhost:3000';
        console.warn('[Cron] No base URL configured, using localhost. Callbacks will not work in production!');
      }
      const callbackUrl = `${baseUrl}/api/promotion/kie-ai-callback`;
      console.log('[Cron] Callback URL configured:', callbackUrl);
      console.log('[Cron] Environment variables:', {
        hasNextPublicBaseUrl: !!process.env.NEXT_PUBLIC_BASE_URL,
        hasVercelUrl: !!process.env.VERCEL_URL,
        vercelUrl: process.env.VERCEL_URL,
        finalBaseUrl: baseUrl
      });

      // Step 1: Create Veo 3.1 generation task with callback URL
      const createTaskRes = await fetch(veoGenerateEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`,
        },
        body: JSON.stringify({
          prompt: videoPrompt,
          imageUrls: imageUrls,
          model: veoModel,
          generationType: generationType,
          aspectRatio: veoAspectRatio,
          callBackUrl: callbackUrl,
          enableTranslation: true, // Auto-translate prompts to English for better results
          // Optional: seeds for reproducibility (10000-99999)
          // Optional: watermark for branding
        }),
      });

      const createTaskData = await createTaskRes.json().catch((e) => {
        console.error(`[Cron] Failed to parse Kie AI Veo 3.1 generate response:`, e);
        return {};
      });

      if (!createTaskRes.ok) {
        const rawMsg = (createTaskData as any)?.message || (createTaskData as any)?.error?.message || JSON.stringify(createTaskData);
        const statusCode = createTaskRes.status;
        console.error(`[Cron] Kie AI Veo 3.1 generate error (${statusCode}):`, rawMsg);
        console.error(`[Cron] Full response:`, createTaskData);
        console.error(`[Cron] Request details:`, {
          endpoint: veoGenerateEndpoint,
          method: 'POST',
          hasKey: !!kieApiKey,
          keyLength: kieApiKey ? kieApiKey.length : 0,
        });
        
        // Provide more helpful error messages
        if (statusCode === 404 || rawMsg.includes('not found') || rawMsg.includes('Invalid method')) {
          const errorMsg = `Kie AI Veo 3.1 API endpoint not found (${statusCode}). ` +
            `Endpoint used: ${veoGenerateEndpoint}. ` +
            `Please verify KIE_AI_API_ENDPOINT environment variable is set correctly in Vercel. ` +
            `Should be: https://api.kie.ai (base URL, not full endpoint)`;
          console.error(`[Cron] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Kie AI Veo 3.1 API authentication failed. Check your KIE_AI_API_KEY environment variable.');
        }
        if (statusCode === 402) {
          throw new Error('Insufficient credits for Veo 3.1 video generation. Please add credits to your account.');
        }
        if (statusCode === 400) {
          // Check if it's a content policy violation or 1080P processing
          const rawMsgLower = rawMsg.toLowerCase();
          const isContentPolicyViolation = 
            rawMsgLower.includes('content policy') ||
            rawMsgLower.includes('content violation') ||
            rawMsgLower.includes('violating content policies') ||
            rawMsgLower.includes('flagged') ||
            rawMsgLower.includes('moderation');
          
          if (isContentPolicyViolation) {
            // Content policy violation - restore credits and fail immediately
            try {
              const jobDetails = await sql`
                SELECT wallet_address
                FROM promotion_jobs
                WHERE id = ${jobId}::uuid
              ` as any[];
              
              if (jobDetails.length > 0 && jobDetails[0].wallet_address) {
                const walletAddress = jobDetails[0].wallet_address;
                const creditAmount = 4; // Video generation costs 4 credits
                
                // Ensure credits record exists
                await getOrCreateCredits(walletAddress);
                
                // Restore credits
                await sql`
                  UPDATE credits
                  SET credits = credits + ${creditAmount}, updated_at = CURRENT_TIMESTAMP
                  WHERE wallet_address = ${walletAddress}
                `;
                
                // Record refund transaction
                await sql`
                  INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
                  VALUES (${walletAddress}, ${creditAmount}, 'refund', ${'Refund for video generation failed: Content policy violation'})
                `;
                
                // Mark job as failed immediately
                await sql`
                  UPDATE promotion_jobs
                  SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ${rawMsg}
                  WHERE id = ${jobId}::uuid
                `;
                
                console.log(`[Cron] ✅ Restored ${creditAmount} credits to ${walletAddress} and marked job as failed due to content policy violation`);
              }
            } catch (restoreError: any) {
              console.error(`[Cron] Failed to restore credits for content policy violation:`, restoreError);
            }
            
            throw new Error(`Content policy violation: ${rawMsg}`);
          } else {
            // 400 means 1080P is processing, should be ready in 1-2 minutes
            throw new Error('1080P video is processing. It should be ready in 1-2 minutes. Please check back shortly.');
          }
        }
        if (statusCode === 422) {
          throw new Error(`Veo 3.1 validation error: ${rawMsg}. Your request may have been rejected by content policies.`);
        }
        if (statusCode === 501) {
          throw new Error('Veo 3.1 video generation failed. Please try again or contact support.');
        }
        
        throw new Error(`Kie AI Veo 3.1 API error: ${mapPromotionError(rawMsg)}`);
      }

      // Check if task was created successfully
      if (createTaskData.code !== 200 || !createTaskData.data?.taskId) {
        console.error(`[Cron] Failed to create Kie AI Veo 3.1 task:`, createTaskData);
        throw new Error(`Failed to create Veo 3.1 task: ${createTaskData.msg || createTaskData.message || 'Unknown error'}`);
      }

      const taskId = createTaskData.data.taskId;
      console.log(`[Cron] Kie AI Veo 3.1 task created: ${taskId}, waiting for callback at ${callbackUrl}`);

      // Store taskId in error_message temporarily so callback can find the job
      // Format: "KIE_AI_TASK_ID:taskId" - callback will extract this
      await sql`
        UPDATE promotion_jobs
        SET error_message = ${`KIE_AI_TASK_ID:${taskId}`}
        WHERE id = ${jobId}::uuid
      `;

      // Job will be completed by the callback endpoint
      // Return early - callback will handle completion
      console.log(`[Cron] Task ${taskId} queued, callback will handle completion`);
      return;
    } else {
      // Image generation (existing flyer code)
      const model = process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_MODEL || 'gpt-image-1.5';

      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size: imageSize,
          n: 1,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawMsg = (data as any)?.error?.message || (data as any)?.message || data;
        throw new Error(mapPromotionError(rawMsg));
      }

      const b64 = (data as any)?.data?.[0]?.b64_json || null;
      if (!b64) throw new Error('No image returned from model');

      const bytes = Buffer.from(b64, 'base64');
      const outBlob = new Blob([bytes], { type: 'image/png' });
      const filename = `promotions/${collectionId || 'uploads'}/${Date.now()}.png`;
      uploaded = await put(filename, outBlob, { access: 'public', addRandomSuffix: false });
    }

    // Mark job completed
    await sql`
      UPDATE promotion_jobs
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, image_url = ${uploaded.url}
      WHERE id = ${jobId}::uuid
    `;

    // Save to promotions history (be resilient to schema differences)
    // Only save to promotions table if we have a collection (flyer jobs)
    // Video jobs from uploaded images don't have a collection_id
    if (collectionId && col) {
      try {
        try {
          await sql`
            INSERT INTO promotions (
              wallet_address,
              collection_id,
              collection_name,
              image_url,
              flyer_text,
              character_count,
              character_actions,
              no_text,
              subject_type
            ) VALUES (
              ${walletAddress},
              ${collectionId}::uuid,
              ${String(col.name)},
              ${uploaded.url},
              ${flyerText},
              ${n},
              ${JSON.stringify(actions)},
              ${noText},
              ${normalizedSubjectType}
            )
          `;
        } catch (e: any) {
          const msg = String(e?.message || e || '').toLowerCase();
          if (msg.includes('subject_type') && msg.includes('does not exist')) {
            await sql`
              INSERT INTO promotions (
                wallet_address,
                collection_id,
                collection_name,
                image_url,
                flyer_text,
                character_count,
                character_actions,
                no_text
              ) VALUES (
                ${walletAddress},
                ${collectionId}::uuid,
                ${String(col.name)},
                ${uploaded.url},
                ${flyerText},
                ${n},
                ${JSON.stringify(actions)},
                ${noText}
              )
            `;
          } else {
            throw e;
          }
        }
      } catch (historyError) {
        console.error('[Cron] Failed to save promotion history:', historyError);
      }
    }

  } catch (e: any) {
    const msg = mapPromotionError(e?.message || e);
    console.error(`[Cron] Promotion job ${jobId} failed:`, msg);
    
    // Check if this is a content policy violation
    const errorLower = msg.toLowerCase();
    const isContentPolicyViolation = 
      errorLower.includes('content policy') ||
      errorLower.includes('content violation') ||
      errorLower.includes('violating content policies') ||
      errorLower.includes('flagged') ||
      errorLower.includes('moderation');
    
    // If content policy violation for video job, restore credits
    if (isContentPolicyViolation) {
      try {
        const jobDetails = await sql`
          SELECT wallet_address, subject_actions
          FROM promotion_jobs
          WHERE id = ${jobId}::uuid
        ` as any[];
        
        if (jobDetails.length > 0) {
          const job = jobDetails[0];
          const walletAddress = job.wallet_address;
          const subjectActions = job.subject_actions || {};
          const isVideoJob = subjectActions.content_type === 'video';
          
          if (isVideoJob && walletAddress) {
            const creditAmount = 4; // Video generation costs 4 credits
            try {
              // Ensure credits record exists
              await getOrCreateCredits(walletAddress);
              
              // Restore credits
              await sql`
                UPDATE credits
                SET credits = credits + ${creditAmount}, updated_at = CURRENT_TIMESTAMP
                WHERE wallet_address = ${walletAddress}
              `;
              
              // Record refund transaction
              await sql`
                INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
                VALUES (${walletAddress}, ${creditAmount}, 'refund', ${'Refund for video generation failed: Content policy violation'})
              `;
              
              console.log(`[Cron] ✅ Restored ${creditAmount} credits to ${walletAddress} due to content policy violation`);
            } catch (restoreError: any) {
              console.error(`[Cron] Failed to restore credits:`, restoreError);
              // Continue with marking as failed even if credit restore fails
            }
          }
        }
      } catch (restoreCheckError: any) {
        console.error(`[Cron] Error checking job details for credit restore:`, restoreCheckError);
      }
    }
    
    // Try to mark job as failed, but don't throw if this fails (to avoid masking the original error)
    try {
      await sql`
        UPDATE promotion_jobs
        SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ${msg}
        WHERE id = ${jobId}::uuid
      `;
    } catch (updateError: any) {
      console.error(`[Cron] Failed to update promotion job ${jobId} status to failed:`, updateError?.message || String(updateError));
    }
    
    throw new Error(msg);
  }
}

async function processJob(
  jobId: string,
  collectionId: string,
  ordinalNumber: number | null,
  traitOverrides: Record<string, string> | null = null,
  promptDescription: string | null = null,
  imageModel: string | null = null
) {
  if (!sql) throw new Error('Database not available');

  let prompt: string | null = null; // Declare prompt at function scope so it's accessible in catch block

  try {
    // Mark job as processing
    await sql`
      UPDATE generation_jobs
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = ${jobId}
    `;

    if (traitOverrides && Object.keys(traitOverrides).length > 0) {
      console.log(`[Cron] Processing job ${jobId} with trait overrides:`, traitOverrides);
    } else {
      console.log(`[Cron] Processing job ${jobId}`);
    }

    // Get collection details (trait-based only)
    const collectionResult = await sql`
      SELECT id, name, description, art_style, border_requirements, custom_rules, colors_description, lighting_description,
             COALESCE(compression_quality, 100) as compression_quality,
             COALESCE(compression_dimensions, 1024) as compression_dimensions,
             compression_target_kb,
             COALESCE(is_pfp_collection, false) as is_pfp_collection,
             facing_direction,
             COALESCE(body_style, 'full') as body_style,
             COALESCE(pixel_perfect, false) as pixel_perfect,
             wireframe_config
      FROM collections
      WHERE id = ${collectionId}
    `;

    const collection = Array.isArray(collectionResult) && collectionResult.length > 0 
      ? collectionResult[0] as any
      : null;
    if (!collection) throw new Error('Collection not found');

    // Parse wireframe_config if it's a string (JSONB from PostgreSQL can come as string)
    if (collection.wireframe_config) {
      if (typeof collection.wireframe_config === 'string') {
        try {
          collection.wireframe_config = JSON.parse(collection.wireframe_config);
          console.log('[Cron] Parsed wireframe_config from string');
        } catch (e) {
          console.error('[Cron] Failed to parse wireframe_config:', e);
          collection.wireframe_config = null;
        }
      } else if (typeof collection.wireframe_config === 'object') {
        console.log('[Cron] wireframe_config is already an object');
      }
    } else {
      console.log('[Cron] No wireframe_config found in collection');
    }

    // Trait-based generation only
    // Get all layers
    const layersResult = await sql`
      SELECT id, name, display_order
      FROM layers
      WHERE collection_id = ${collectionId}
      ORDER BY display_order ASC
    `;

    const layers = Array.isArray(layersResult) ? layersResult : [];
    if (layers.length === 0) throw new Error('No layers found');

    // Select traits for each layer (use overrides or random)
    const traitIds: string[] = [];
    let selectedTraits: Record<string, { name: string; description: string; trait_prompt: string }> = {};
    
    for (const layer of layers) {
      const layerAny = layer as any;
      
      // Check if this layer has a trait override
      const hasOverride = traitOverrides && traitOverrides[layerAny.name];
      
      let traitsResult;
      if (hasOverride) {
        // Use the specified trait from the override
        // IMPORTANT: When user explicitly selects a trait via filters, allow it even if ignored
        // This allows users to generate with ignored traits when they explicitly choose them
        console.log(`[Cron] Using trait override for layer "${layerAny.name}": "${traitOverrides[layerAny.name]}"`);
        traitsResult = await sql`
          SELECT id, name, description, trait_prompt, rarity_weight
          FROM traits
          WHERE layer_id = ${layerAny.id} 
            AND name = ${traitOverrides[layerAny.name]}
          LIMIT 1
        `;
      } else {
        // Weighted random selection based on rarity_weight
        // Get all traits with their weights (excluding ignored traits)
        const allTraitsResult = await sql`
          SELECT id, name, description, trait_prompt, rarity_weight
          FROM traits
          WHERE layer_id = ${layerAny.id}
            AND (is_ignored = false OR is_ignored IS NULL)
        `;
        
        const allTraits = Array.isArray(allTraitsResult) ? allTraitsResult : [];
        if (allTraits.length === 0) {
          throw new Error(`No traits found for layer: ${layerAny.name}`);
        }
        
        // Calculate total weight
        const totalWeight = allTraits.reduce((sum: number, trait: any) => sum + (parseInt((trait as any).rarity_weight) || 1), 0);
        
        // Generate random number
        const random = Math.random() * totalWeight;
        
        // Select trait based on weighted random
        let cumulativeWeight = 0;
        let selectedTrait: any = null;
        for (const trait of allTraits) {
          cumulativeWeight += parseInt((trait as any).rarity_weight) || 1;
          if (random <= cumulativeWeight) {
            selectedTrait = trait;
            break;
          }
        }
        
        // Fallback to last trait if none selected (shouldn't happen but safety check)
        if (!selectedTrait) {
          selectedTrait = allTraits[allTraits.length - 1];
        }
        
        traitsResult = [selectedTrait];
      }

      const traits = Array.isArray(traitsResult) ? traitsResult : [];
      if (traits.length === 0) {
        const message = hasOverride 
          ? `Trait "${traitOverrides[layerAny.name]}" not found for layer: ${layerAny.name}. Note: Ignored traits can still be used when explicitly selected via filters.`
          : `No traits found for layer: ${layerAny.name}`;
        throw new Error(message);
      }

      const selectedTrait = traits[0] as any;
      selectedTraits[layerAny.name] = {
        name: selectedTrait.name,
        description: selectedTrait.description || '',
        trait_prompt: selectedTrait.trait_prompt || ''
      };
      traitIds.push(selectedTrait.id);
    }

    // Check for duplicates (allow duplicates - just log a warning)
    const traitHash = crypto.createHash('sha256').update(traitIds.sort().join('-')).digest('hex');
    const existingResult = await sql`
      SELECT id FROM generated_ordinals
      WHERE collection_id = ${collectionId} AND trait_combination_hash = ${traitHash}
    `;

    if (Array.isArray(existingResult) && existingResult.length > 0) {
      console.log(`[Cron] Duplicate combination detected for job ${jobId} (trait hash: ${traitHash}), but allowing generation to proceed`);
      // Allow duplicates - continue with generation instead of failing
    }

    // Build prompt from traits
    prompt = buildPrompt(collection, selectedTraits);
    
    // Debug: Log prompt version marker to verify code is up to date
    console.log(`[Cron] Generated prompt for job ${jobId} - Code version: 2025-01-27-v2 (with ORIENTATION LOCK format, no -45° rotation)`);

    // Generate image with OpenAI (with timeout)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) throw new Error('OpenAI API key not configured');

    // Classic vs Pro model selection (defaults to Pro)
    const resolvedModel =
      imageModel === 'gpt-image-1' || imageModel === 'gpt-image-1.5' ? imageModel : (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');

    // Create abort controller for timeout (3 minutes for image generation)
    const openaiController = new AbortController();
    const openaiTimeout = setTimeout(() => openaiController.abort(), 180000); // 3 minute timeout

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: resolvedModel,
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'high',
        }),
        signal: openaiController.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(openaiTimeout);
      const errorType = fetchError.name === 'AbortError' ? 'timeout' : 'api_fetch_error';
      const errorMessage = fetchError.name === 'AbortError' 
        ? 'OpenAI API request timed out after 3 minutes'
        : `OpenAI API fetch failed: ${fetchError.message}`;
      
      // Save error before throwing
      await saveGenerationError(
        jobId,
        collectionId,
        ordinalNumber,
        errorType,
        errorMessage,
        { name: fetchError.name, message: fetchError.message, stack: fetchError.stack },
        null,
        prompt
      );
      
      throw new Error(errorMessage);
    } finally {
      clearTimeout(openaiTimeout);
    }

    let imageBlob: Blob;
    let isContentViolation = false;

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: 'Unknown error' } };
      }

      // Check if this is a content violation error
      const errorCode = errorData?.error?.code || '';
      const errorType = errorData?.error?.type || '';
      const errorMessage = (errorData?.error?.message || '').toLowerCase();
      
      const isContentPolicyViolation = 
        errorCode === 'content_policy_violation' ||
        errorCode === 'moderation_blocked' ||
        errorType === 'content_policy_violation' ||
        errorType === 'image_generation_user_error' ||
        errorMessage.includes('content policy') ||
        errorMessage.includes('content violation') ||
        errorMessage.includes('safety') ||
        errorMessage.includes('moderation');

      if (isContentPolicyViolation) {
        console.log(`[Cron] Content violation detected for job ${jobId}, generating placeholder image`);
        isContentViolation = true;
        
        // Save content policy error to generation_errors table
        await saveGenerationError(
          jobId,
          collectionId,
          ordinalNumber,
          'content_policy_violation',
          `OpenAI content policy violation: ${errorData?.error?.message || 'Image generation blocked by content moderation'}`,
          { error_code: errorCode, error_type: errorType },
          errorData,
          prompt
        );
        
        // Generate placeholder image
        const violationBuffer = await createContentViolationImage(1024, 1024);
        imageBlob = new Blob([new Uint8Array(violationBuffer)], { type: 'image/png' });
      } else {
        // Save API error to generation_errors table
        await saveGenerationError(
          jobId,
          collectionId,
          ordinalNumber,
          'api_error',
          `OpenAI API error: ${JSON.stringify(errorData)}`,
          errorData,
          null,
          prompt
        );
        throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
      }
    } else {
      const data = await response.json();
      const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
      if (!imageUrl) throw new Error('No image data returned from OpenAI');

      // Download and upload to Vercel Blob (with timeout)
      if (imageUrl.startsWith('http')) {
        const downloadController = new AbortController();
        const downloadTimeout = setTimeout(() => downloadController.abort(), 60000); // 1 minute timeout
        try {
          const imageResponse = await fetch(imageUrl, { signal: downloadController.signal });
          imageBlob = await imageResponse.blob();
        } catch (downloadError: any) {
          clearTimeout(downloadTimeout);
          const errorType = downloadError.name === 'AbortError' ? 'download_timeout' : 'download_error';
          const errorMessage = downloadError.name === 'AbortError'
            ? 'Image download timed out after 1 minute'
            : `Image download failed: ${downloadError.message}`;
          
          // Save download error
          await saveGenerationError(
            jobId,
            collectionId,
            ordinalNumber,
            errorType,
            errorMessage,
            { name: downloadError.name, message: downloadError.message, stack: downloadError.stack },
            null,
            prompt
          );
          
          throw new Error(errorMessage);
        } finally {
          clearTimeout(downloadTimeout);
        }
      } else {
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        if (!base64Data || base64Data.trim() === '') {
          // Save base64 error
          await saveGenerationError(
            jobId,
            collectionId,
            ordinalNumber,
            'base64_error',
            'Invalid base64 image data: empty or missing',
            { imageUrl: imageUrl ? imageUrl.substring(0, 100) : null },
            null,
            prompt
          );
          throw new Error('Invalid base64 image data: empty or missing');
        }
        const buffer = Buffer.from(base64Data, 'base64');
        imageBlob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
      }
    }

    // Compress image if collection has compression settings
    const collectionAny = collection as any;
    const compressionQuality = collectionAny.compression_quality ?? 100;
    const compressionDimensions = collectionAny.compression_dimensions ?? 1024;
    const compressionTargetKB = collectionAny.compression_target_kb ?? null;
    
    let finalImageBlob = imageBlob;
    let compressedImageUrl: string | null = null;
    
    if (compressionTargetKB || needsCompression(compressionQuality, compressionDimensions, compressionTargetKB)) {
      try {
        if (compressionTargetKB) {
          console.log(`[Compression] Compressing image to target: ${compressionTargetKB} KB`);
        } else {
          console.log(`[Compression] Compressing image: quality=${compressionQuality}%, dimensions=${compressionDimensions}×${compressionDimensions}`);
        }
        finalImageBlob = await compressImage(imageBlob, compressionQuality, compressionDimensions, compressionTargetKB || undefined);
        const originalSize = (await imageBlob.arrayBuffer()).byteLength;
        const compressedSize = (await finalImageBlob.arrayBuffer()).byteLength;
        console.log(`[Compression] Original: ${(originalSize / 1024).toFixed(2)} KB → Compressed: ${(compressedSize / 1024).toFixed(2)} KB`);
        if (compressionTargetKB) {
          const diff = Math.abs(compressedSize - (compressionTargetKB * 1024));
          console.log(`[Compression] Target: ${compressionTargetKB} KB, Actual: ${(compressedSize / 1024).toFixed(2)} KB, Difference: ${(diff / 1024).toFixed(2)} KB`);
        }
      } catch (error) {
        console.error('[Compression] Error compressing image, using original:', error);
        finalImageBlob = imageBlob;
      }
    }

    // Upload original image (with error handling)
    const filename = `ordinal-${collectionId}-${ordinalNumber || Date.now()}.png`;
    let blob;
    try {
      blob = await put(filename, imageBlob, {
        access: 'public',
        addRandomSuffix: false,
      });
      } catch (uploadError: any) {
        // Save upload error
        await saveGenerationError(
          jobId,
          collectionId,
          ordinalNumber,
          'upload_error',
          `Failed to upload original image to blob storage: ${uploadError.message}`,
          { name: uploadError.name, message: uploadError.message, stack: uploadError.stack },
          null,
          prompt
        );
        throw new Error(`Failed to upload original image to blob storage: ${uploadError.message}`);
      }

    // Upload compressed image if compression was applied
    if ((compressionTargetKB || needsCompression(compressionQuality, compressionDimensions, compressionTargetKB)) && finalImageBlob !== imageBlob) {
      const compressedFilename = `compressed-${collectionId}-${ordinalNumber || Date.now()}.webp`;
      try {
        const compressedBlob = await put(compressedFilename, finalImageBlob, {
          access: 'public',
          addRandomSuffix: false,
        });
        compressedImageUrl = compressedBlob.url;
        console.log(`[Compression] Compressed image saved: ${compressedImageUrl}`);
      } catch (compressUploadError: any) {
        console.error(`[Compression] Failed to upload compressed image: ${compressUploadError.message}`);
        // Continue without compressed image - not fatal
      }
    }

    // Create and upload thumbnail (512px, 80% quality)
    let thumbnailBlob;
    let thumbnailBuffer: Buffer;
    try {
      thumbnailBuffer = await createThumbnail(imageBlob, 512, 80);
      const thumbnailFilename = `thumbnail-${collectionId}-${ordinalNumber || Date.now()}.jpg`;
      thumbnailBlob = await put(thumbnailFilename, new Blob([new Uint8Array(thumbnailBuffer)], { type: 'image/jpeg' }), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/jpeg',
      });
      } catch (thumbnailError: any) {
        // Save thumbnail error
        await saveGenerationError(
          jobId,
          collectionId,
          ordinalNumber,
          'thumbnail_error',
          `Failed to create/upload thumbnail: ${thumbnailError.message}`,
          { name: thumbnailError.name, message: thumbnailError.message, stack: thumbnailError.stack },
          null,
          prompt
        );
        throw new Error(`Failed to create/upload thumbnail: ${thumbnailError.message}`);
      }

    // Calculate sizes in KB
    const originalSizeKB = parseFloat(((await imageBlob.arrayBuffer()).byteLength / 1024).toFixed(2));
    const compressedSizeKB = compressedImageUrl ? parseFloat(((await finalImageBlob.arrayBuffer()).byteLength / 1024).toFixed(2)) : null;
    const thumbnailSizeKB = parseFloat((getFileSizeKB(thumbnailBuffer)).toFixed(2));

    console.log(`[Image Optimization] Original: ${originalSizeKB}KB → Compressed: ${compressedSizeKB || 'N/A'}KB → Thumbnail: ${thumbnailSizeKB}KB`);

    // Save metadata
    const metadataFilename = `ordinal-${collectionId}-${ordinalNumber || Date.now()}-metadata.json`;
    const metadataBlob = await put(
      metadataFilename,
      JSON.stringify({
        ordinal_number: ordinalNumber || null,
        imageUrl: blob.url,
        traits: selectedTraits,
        prompt,
        collectionId,
        createdAt: new Date().toISOString(),
        contentViolation: isContentViolation || false,
      }),
      {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
      }
    );

    // Save to database with KB sizes
    // For prompt-based collections, we don't have a trait hash, so use null
    const hashToUse = traitHash;
    const ordinalResult = await sql`
      INSERT INTO generated_ordinals (
        collection_id, ordinal_number, image_url, compressed_image_url, thumbnail_url, metadata_url, prompt, traits, trait_combination_hash,
        original_size_kb, compressed_size_kb, thumbnail_size_kb, art_style
      )
      VALUES (
        ${collectionId}, ${ordinalNumber || null}, ${blob.url}, ${compressedImageUrl || null}, ${thumbnailBlob.url}, ${metadataBlob.url},
        ${prompt}, ${JSON.stringify(selectedTraits)}, ${hashToUse},
        ${originalSizeKB}, ${compressedSizeKB}, ${thumbnailSizeKB}, ${collection.art_style || null}
      )
      RETURNING id
    `;
    
    const ordinal = Array.isArray(ordinalResult) ? ordinalResult[0] as any : ordinalResult as any;

    // Mark job as completed
    await sql`
      UPDATE generation_jobs
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, result_ordinal_id = ${ordinal.id}
      WHERE id = ${jobId}
    `;

    console.log(`[Cron] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`[Cron] Job ${jobId} failed:`, error);
    
    // Determine error type from error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    let errorType = 'unknown';
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      errorType = 'timeout';
    } else if (errorMessage.includes('API') || errorMessage.includes('OpenAI')) {
      errorType = 'api_error';
    } else if (errorMessage.includes('upload')) {
      errorType = 'upload_error';
    } else if (errorMessage.includes('download')) {
      errorType = 'download_error';
    } else if (errorMessage.includes('thumbnail')) {
      errorType = 'thumbnail_error';
    } else if (errorMessage.includes('compression')) {
      errorType = 'compression_error';
    } else if (errorMessage.includes('base64')) {
      errorType = 'base64_error';
    }
    
    // Save error to generation_errors table (if not already saved)
    // Only save if it's a general error that wasn't caught earlier
    if (errorType === 'unknown' || !errorMessage.includes('OpenAI API error')) {
      await saveGenerationError(
        jobId,
        collectionId,
        ordinalNumber,
        errorType,
        errorMessage,
        { 
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error
        },
        null,
        prompt
      );
    }
    
    // Mark job as failed
    await sql`
      UPDATE generation_jobs
      SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = ${errorMessage}
      WHERE id = ${jobId}
    `;
    
    throw error;
  }
}

function buildPrompt(
  collection: {
    name: string;
    description?: string;
    art_style?: string;
    border_requirements?: string;
    custom_rules?: string;
    colors_description?: string;
    lighting_description?: string;
    is_pfp_collection?: boolean;
    facing_direction?: string;
    body_style?: string;
    pixel_perfect?: boolean;
    wireframe_config?: any;
  },
  traits: Record<string, { name: string; description: string; trait_prompt: string }>
): string {
  // Only use actual values from collection (no defaults)
  const artStyle = collection.art_style?.trim();
  const borderReqs = collection.border_requirements?.trim();
  const customRules = collection.custom_rules?.trim();
  const colorsDescription = collection.colors_description?.trim();
  const lightingDescription = collection.lighting_description?.trim();
  const isPfpCollection = collection.is_pfp_collection ?? false;
  const facingDirection = collection.facing_direction || 'front';
  const bodyStyle = collection.body_style || 'full';
  const pixelPerfect = collection.pixel_perfect ?? false;

  // Strong body visibility enforcement to reduce framing mistakes
  const bodyVisibilityBlock = (() => {
    if (!isPfpCollection) return null;
    const style = String(bodyStyle || 'full').toLowerCase();

    if (style === 'headonly') {
      const headOnlyBase = [
        '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): HEAD & SHOULDERS ONLY.',
        'Framing: crop just below shoulders / upper chest. NO torso below chest. NO waist. NO legs.',
        'If any body beyond shoulders would appear, adjust camera/framing to remove it.',
      ];

      // Add pixel-perfect positioning when enabled
      if (pixelPerfect) {
        // Pixel coordinates for 1024x1024 canvas
        // Default values for head & shoulders positioning
        const topOfHead = 150; // pixels from top (approximately 15%)
        const leftMargin = 200; // pixels from left edge
        const rightMargin = 200; // pixels from right edge (character width = 1024 - 200 - 200 = 624px)
        const shoulderLine = 750; // pixels from top (approximately 73%)
        const bottomCrop = 850; // pixels from top (approximately 83%)
        
        headOnlyBase.push(
          '\n\nPIXEL-PERFECT POSITIONING (1024x1024 canvas):',
          `– Top of head frame: ${topOfHead}px from top edge.`,
          `– Left margin: ${leftMargin}px from left edge.`,
          `– Right margin: ${rightMargin}px from right edge.`,
          `– Character frame width: ${1024 - leftMargin - rightMargin}px (centered horizontally).`,
          `– Shoulder line position: ${shoulderLine}px from top edge.`,
          `– Bottom crop: ${bottomCrop}px from top edge.`,
          '\n\nNote: Character facing direction is set separately and takes priority. Frame dimensions apply within the chosen orientation.'
        );
      }

      return headOnlyBase.join(' ');
    }

    if (style === 'half') {
      return [
        '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): UPPER BODY ONLY (WAIST UP).',
        'Framing: include head, shoulders, chest, and waist/hips area. EXCLUDE legs and feet entirely.',
        'If legs/feet would appear, zoom/crop to waist-up.',
      ].join(' ');
    }

    // Full body
    const fullBodyBase = [
      '⚠️ BODY VISIBILITY (NON-NEGOTIABLE): FULL BODY.',
      'Framing: include the entire character from head to feet in-frame. NO cropping of feet or lower legs.',
      'If feet would be cut off, zoom out / reposition to keep full body visible.',
    ];

    // Add pixel-perfect positioning for full body
    if (pixelPerfect) {
      // Pixel coordinates for 1024x1024 canvas
      const topOfHead = 100; // pixels from top (approximately 10%)
      const leftMargin = 150; // pixels from left edge
      const rightMargin = 150; // pixels from right edge
      const shoulderLine = 300; // pixels from top (approximately 29%)
      const waistLine = 550; // pixels from top (approximately 54%)
      const feetBottom = 950; // pixels from top (approximately 93%)
      
      fullBodyBase.push(
        '\n\nPIXEL-PERFECT POSITIONING (1024x1024 canvas):',
        `– Top of head: ${topOfHead}px from top edge.`,
        `– Left margin: ${leftMargin}px from left edge.`,
        `– Right margin: ${rightMargin}px from right edge.`,
        `– Character frame width: ${1024 - leftMargin - rightMargin}px (centered horizontally).`,
        `– Shoulder line: ${shoulderLine}px from top edge.`,
        `– Waist/hips: ${waistLine}px from top edge.`,
        `– Feet soles: ${feetBottom}px from top edge.`,
        '\n\nNote: Character facing direction is set separately and takes priority. Frame dimensions apply within the chosen orientation.'
      );
    }

    return fullBodyBase.join(' ');
  })();

  const traitDescriptions = Object.entries(traits)
    .map(([layerName, trait]) => {
      const desc = trait.description || trait.name;
      return `${layerName}: ${trait.name} - ${desc}`;
    })
    .join('\n');

  // Check if art style is abstract/surreal (needs special handling)
  const isAbstractStyle = artStyle && (
    artStyle.toLowerCase().includes('abstract') ||
    artStyle.toLowerCase().includes('surreal') ||
    artStyle.toLowerCase().includes('non-representational')
  );

  // Build prompt sections conditionally
  const sections: string[] = [];

  // For abstract styles, prioritize the art style and make everything more interpretive
  if (isAbstractStyle && artStyle) {
    sections.push(`🎨 PRIMARY ART STYLE (MOST IMPORTANT): ${artStyle}`);
    sections.push('');
    sections.push('⚠️ ABSTRACT/SURREAL INTERPRETATION: All elements should be interpreted through an abstract, non-representational lens. Traits are INSPIRATIONS, not literal requirements. Use flowing forms, dreamlike aesthetics, and artistic expression over literal representation.');
    sections.push('');
  }

  // CRITICAL: Single character requirement (unless explicitly requested)
  sections.push('⚠️ SINGLE CHARACTER REQUIREMENT: This image must contain EXACTLY ONE character. NO multiple characters, NO two characters, NO group shots, NO companions, NO sidekicks, NO background characters. ONLY ONE main character/subject in the entire image.');
  sections.push('');

  

  // Build illustration format line
  const formatLine = isAbstractStyle 
    ? 'Abstract artistic illustration with non-representational elements.'
    : 'Professional digital illustration.';
  sections.push(formatLine);
  sections.push('');

  if (artStyle && !isAbstractStyle) {
    sections.push(`ART STYLE: ${artStyle}`);
    sections.push('');
  }
  
  if (collection.description?.trim()) {
    sections.push(`DESCRIPTION: ${collection.description.trim()}`);
    sections.push('');
  }

  sections.push('ASSIGNED TRAITS:');
  sections.push(traitDescriptions);
  sections.push('');
  
  // For abstract styles, make trait rendering interpretive
  if (isAbstractStyle) {
    sections.push('TRAIT INTERPRETATION: Use traits as abstract INSPIRATIONS. Interpret colors, textures, and concepts through flowing forms, dreamlike aesthetics, and artistic expression. NO literal representation required - prioritize abstract artistic expression over exact trait matching.');
    sections.push('');
  } else {
    sections.push('TRAIT RENDERING: Each trait must be rendered EXACTLY as specified in the descriptions. NO artistic interpretation, NO variation.');
    sections.push('');
  }

  if (customRules) {
    // Preserve line breaks in custom rules
    const formattedCustomRules = customRules.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`CUSTOM RULES: ${formattedCustomRules}`);
    sections.push('');
  }

  // Check if art style is minimalist or pixel art (styles that should NOT have complex detail instructions)
  const isMinimalistStyle = artStyle && (
    artStyle.toLowerCase().includes('minimalist') || 
    artStyle.toLowerCase().includes('flat design') ||
    artStyle.toLowerCase().includes('simple')
  );
  const isPixelArtStyle = artStyle && artStyle.toLowerCase().includes('pixel');

  // Only add complex detail instructions for styles that benefit from them
  if (isAbstractStyle) {
    sections.push('DETAIL: Flowing forms, dreamlike textures, abstract patterns, artistic expression, vibrant colors, imaginative composition, non-representational elements.');
    sections.push('');
  } else if (!isMinimalistStyle && !isPixelArtStyle) {
    sections.push('DETAIL: Multiple layers, texture, highlights, shadows, material quality rendering.');
    sections.push('');
  } else if (isPixelArtStyle) {
    sections.push('DETAIL: Crisp pixel edges, limited color palette, retro game aesthetic, no anti-aliasing, clean blocky pixels.');
    sections.push('');
  } else if (isMinimalistStyle) {
    sections.push('DETAIL: Clean shapes, limited colors, simple geometric forms, no unnecessary complexity.');
    sections.push('');
  }
  
  if (lightingDescription) {
    // Preserve line breaks in lighting description
    const formattedLighting = lightingDescription.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`LIGHTING: ${formattedLighting}`);
    sections.push('');
  }
  
  if (colorsDescription) {
    // Preserve line breaks in colors description
    const formattedColors = colorsDescription.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`COLORS: ${formattedColors}`);
    sections.push('');
  }

  if (borderReqs) {
    // Preserve line breaks in border requirements
    const formattedBorder = borderReqs.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    sections.push(`BORDER: ${formattedBorder} - PLACEMENT: Outer edge EXACTLY at canvas edge, NO gaps, FULL BLEED.`);
    sections.push('');
  }

  // Adjust quality instructions based on art style
  if (isAbstractStyle) {
    sections.push('QUALITY: Abstract artistic expression, flowing forms, dreamlike aesthetic, vibrant colors, imaginative composition.');
    sections.push('');
    sections.push('FINAL: Abstract surreal style with non-representational elements, artistic expression prioritized over literal representation, dreamlike aesthetic throughout.');
  } else if (isMinimalistStyle) {
    sections.push('QUALITY: Professional flat design, clean edges, consistent color fills, balanced composition.');
    sections.push('');
    sections.push('FINAL: Clean minimalist aesthetic, simple shapes, limited color palette, modern design.');
  } else if (isPixelArtStyle) {
    sections.push('QUALITY: Professional pixel art, crisp edges, consistent pixel size, retro game quality.');
    sections.push('');
    sections.push('FINAL: Authentic pixel art style, no smoothing, consistent blocky aesthetic throughout.');
  } else {
     sections.push('');
  }

  // Include facing direction FIRST (establishes orientation before frame positioning)
  // Only include pose section if PFP collection (body style added at end for emphasis)
  // For abstract styles, make positioning more flexible
  if (isPfpCollection && !isAbstractStyle) {
    const directionMap: Record<string, string> = {
      'left': `ORIENTATION LOCK (CRITICAL):
Character is facing LEFT (←).
Body rotated 70–90° toward the LEFT edge of the image.
Face turned LEFT, nose pointing toward left image boundary.
Left shoulder is closer to the viewer than the right.
Camera positioned left-side of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (left).
Spine aligned with body rotation — no twist.
Chest plane angled 70–90° toward the LEFT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing right.
NOT angled toward right edge.
NOT mirrored.
NOT right-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing right.
NOT shoulders facing right while head faces left.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces LEFT.
Left-facing orientation takes absolute priority over all other pose details.`,
      'left-front': `ORIENTATION LOCK (CRITICAL):
Character is facing FRONT-LEFT (↖).
Body rotated 10–20° toward the LEFT edge of the image.
Face turned slightly LEFT, nose pointing toward left image boundary.
Left shoulder is closer to the viewer than the right.
Camera positioned front-left of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (front-left).
Spine aligned with body rotation — no twist.
Chest plane angled 10–20° toward the LEFT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing right.
NOT angled toward right edge.
NOT mirrored.
NOT right-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing right.
NOT shoulders facing right while head faces left.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces LEFT.
Left-facing orientation takes absolute priority over all other pose details.`,
      'front': `ORIENTATION LOCK (CRITICAL):
Character is facing DIRECTLY FRONT (↑).
Body rotated 0° - perfectly centered and symmetrical.
Face turned directly forward, nose pointing straight at viewer.
Both shoulders equidistant from viewer.
Camera positioned directly in front of the character.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
Torso, chest, AND pelvis all face the SAME direction (directly front).
Spine aligned with body rotation — no twist.
Chest plane perfectly centered, 0° rotation.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing left.
NOT facing right.
NOT angled toward either edge.
NOT rotated.
NOT contrapposto.
NOT torso twisted.
NOT hips rotated.
NOT shoulders angled while head faces front.

If orientation is incorrect, CENTER the character so they face DIRECTLY FRONT.
Front-facing orientation takes absolute priority over all other pose details.`,
      

'right-front': `POSE & ORIENTATION (HARD LOCK):
Character is facing toward the front + RIGHT side of the image.
Nose, gaze, head, chest, and hips are aligned and pointing right.
RIGHT shoulder is closest to the camera and leads the pose.
LEFT shoulder is farther from the camera and slightly receding.
No torso twist or counter-rotation between head and shoulders, no exceptions.`,
 


      'right': `ORIENTATION LOCK (CRITICAL):
Character is facing left (→).
Nose pointing toward right image boundary.
Characters right shoulder is closer to the viewer than the left.
Torso, chest, AND pelvis all face the SAME direction (left).
Camera positioned on characters right shoulder, toward left image boundry.

TORSO & PELVIS ORIENTATION LOCK (CRITICAL):
 
Spine aligned with body rotation — no twist.
Chest plane angled 70–90° toward the RIGHT image edge.
Pelvis square with torso, NOT counter-rotated.
NO contrapposto stance.

NEGATIVE ORIENTATION:
NOT facing left.
NOT angled toward left edge.
NOT mirrored.
NOT left-leaning.
NOT contrapposto.
NOT torso twisted opposite the head.
NOT hips facing left.
NOT shoulders facing left while head faces right.

If orientation is incorrect, FLIP HORIZONTALLY so the character faces RIGHT.
Right-facing orientation takes absolute priority over all other pose details.`
    };
    
    const poseText = directionMap[facingDirection] || directionMap['front'];
    sections.push(poseText);
    sections.push('');
  } else if (isPfpCollection && isAbstractStyle) {
    // For abstract styles, use more flexible positioning
    const directionMap: Record<string, string> = {
      'left': 'General left-facing orientation',
      'left-front': 'General front-left orientation',
      'front': 'General front-facing orientation',
      'right-front': 'General front-right orientation',
      'right': 'General right-facing orientation'
    };
    
    const poseText = directionMap[facingDirection] || directionMap['front'];
    sections.push(`ORIENTATION: ${poseText} (interpreted abstractly)`);
    sections.push('');
    
    if (bodyStyle === 'headonly') {
      sections.push('COMPOSITION: Focus on head and upper area, interpreted through abstract forms.');
      sections.push('');
    }
  }
  
  // Include body visibility/positioning block AFTER facing direction (so orientation is established first)
  if (isPfpCollection && bodyVisibilityBlock) {
    // Always include body visibility block (includes pixel-perfect positioning if enabled)
    if (!isAbstractStyle) {
      sections.push('');
      sections.push(bodyVisibilityBlock);
    } else if (pixelPerfect) {
      // For abstract styles, still include pixel-perfect positioning if enabled
      sections.push('');
      sections.push(bodyVisibilityBlock);
    }
  }
  
  return sections.join('\n');
}

