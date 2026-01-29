import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { handleKieAiCallback } from '@/lib/promotion/kie-ai-callback-handler';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/promotion/kie-ai-callback - Callback endpoint for Kie AI Veo 3.1 task completion
 * 
 * This endpoint receives notifications from Kie AI when Veo 3.1 video generation tasks complete.
 * It updates the promotion_jobs table with the result.
 */
// GET endpoint for testing if callback URL is accessible
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Kie AI callback endpoint is accessible',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
}

export async function POST(request: NextRequest) {
  console.log('[Kie AI Veo 3.1 Callback] ===== CALLBACK RECEIVED =====');
  console.log('[Kie AI Veo 3.1 Callback] Timestamp:', new Date().toISOString());
  console.log('[Kie AI Veo 3.1 Callback] Headers:', Object.fromEntries(request.headers.entries()));
  
  if (!sql) {
    console.error('[Kie AI Veo 3.1 Callback] Database connection not available');
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    console.log('[Kie AI Veo 3.1 Callback] Received callback body:', JSON.stringify(body, null, 2));

    // Veo 3.1 callback format: { code: 200, msg: "...", data: { taskId, info: { resultUrls: [...] } } }
    // Success: code 200, data.info.resultUrls contains video URLs
    // Failure: code 400/422/500/501, msg contains error message
    
    const code = body.code;
    const msg = body.msg;
    const data = body.data;
    
    if (!data || !data.taskId) {
      console.error('[Kie AI Callback] Invalid callback structure - missing data or taskId:', body);
      return NextResponse.json({ error: 'Invalid callback data - missing data.taskId', received: body }, { status: 400 });
    }
    
    const taskId = data.taskId;
    let state: string;
    let resultInfo: any = null;
    let failMsg: string | null = null;
    
    if (code === 200) {
      // code 200 means API call succeeded, but need to check successFlag for actual result
      // successFlag: 1 = success, 0 = still processing, 2+ = various failures (3 = content policy)
      
      // First check for explicit failure via successFlag (e.g., 3 = content policy violation)
      if (data.successFlag !== undefined && data.successFlag !== 0 && data.successFlag !== 1) {
        // Explicit failure (successFlag: 2, 3, etc.)
        state = 'fail';
        const rawMsg = data.errorMessage || msg;
        if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
          failMsg = rawMsg;
        } else {
          failMsg = `Video generation failed (successFlag: ${data.successFlag})`;
        }
        console.log('[Kie AI Callback] Task failed with successFlag:', data.successFlag, 'errorMessage:', failMsg);
      } else if (data.response && data.response.resultUrls && data.response.resultUrls.length > 0) {
        // Has result URLs - check successFlag
        if (data.successFlag === 1) {
          state = 'success';
          resultInfo = data.response;
        } else {
          // Has resultUrls but successFlag is not 1 - treat as failure with partial results
          state = 'fail';
          const rawMsg = data.errorMessage || msg;
          if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
            failMsg = rawMsg;
          } else {
            failMsg = `Video generation failed (successFlag: ${data.successFlag})`;
          }
        }
      } else if (data.info && data.info.resultUrls && data.info.resultUrls.length > 0) {
        // Alternative format with info.resultUrls
        state = 'success';
        resultInfo = data.info;
      } else if (data.errorMessage && data.errorMessage !== 'success' && data.errorMessage.length > 2) {
        // Has explicit error message - this is a failure
        state = 'fail';
        failMsg = data.errorMessage;
        console.log('[Kie AI Callback] Task failed with errorMessage:', failMsg);
      } else {
        // code: 200, no resultUrls, no explicit error = still processing (shouldn't happen in callback but handle it)
        console.log('[Kie AI Callback] Task still processing - unexpected in callback. successFlag:', data.successFlag);
        return NextResponse.json({ 
          message: 'Task still processing', 
          taskId, 
          successFlag: data.successFlag,
          received: body 
        });
      }
    } else {
      // Failure - code 400, 422, 500, or 501
      state = 'fail';
      // Validate error message - don't use if it's just a state value
      const rawMsg = data.errorMessage || msg;
      if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
        failMsg = rawMsg;
      } else {
        failMsg = `Video generation failed with code ${code}`;
      }
    }
    
    // Pass the error code to the handler for content policy detection
    const failCode = code !== 200 ? String(code) : null;
    
    console.log('[Kie AI Veo 3.1 Callback] Parsed:', { taskId, state, code, hasResultUrls: !!resultInfo?.resultUrls });

    if (!taskId) {
      console.error('[Kie AI Callback] Missing taskId in callback');
      return NextResponse.json({ error: 'Missing taskId', received: body }, { status: 400 });
    }

    // Find the promotion job by taskId stored in error_message with prefix "KIE_AI_TASK_ID:"
    // Use LIKE to be more flexible in case of whitespace or formatting issues
    // Don't filter by status - job might be in any state if callback is delayed
    const taskIdPattern = `KIE_AI_TASK_ID:${taskId}`;
    let jobRows = await sql`
      SELECT id, collection_id, wallet_address, status, error_message
      FROM promotion_jobs
      WHERE error_message LIKE ${`%${taskId}%`}
      ORDER BY created_at DESC
      LIMIT 1
    ` as any[];
    
    // If not found, try exact match
    if (!jobRows || jobRows.length === 0) {
      jobRows = await sql`
        SELECT id, collection_id, wallet_address, status, error_message
        FROM promotion_jobs
        WHERE error_message = ${`KIE_AI_TASK_ID:${taskId}`}
        ORDER BY created_at DESC
        LIMIT 1
      ` as any[];
    }

    if (!jobRows || jobRows.length === 0) {
      console.error('[Kie AI Callback] No promotion job found for taskId:', taskId);
      // Log all jobs with error_message containing taskId for debugging
      const allJobs = await sql`
        SELECT id, status, error_message, created_at
        FROM promotion_jobs
        WHERE error_message LIKE ${`%${taskId}%`}
        ORDER BY created_at DESC
        LIMIT 10
      ` as any[];
      console.error('[Kie AI Callback] Jobs with similar taskId:', allJobs);
      return NextResponse.json({ error: 'Job not found', searchedTaskId: taskId, similarJobs: allJobs }, { status: 404 });
    }

    const job = jobRows[0];
    console.log('[Kie AI Veo 3.1 Callback] Found job:', job.id, 'status:', job.status);
    
    // Convert Veo 3.1 format to handler format
    // Handler expects resultJson, but Veo 3.1 gives us data.info directly
    const resultJson = resultInfo ? JSON.stringify(resultInfo) : null;
    console.log('[Kie AI Veo 3.1 Callback] Calling handleKieAiCallback with:', { 
      jobId: job.id, 
      state, 
      hasResultJson: !!resultJson,
      failMsg 
    });
    
    await handleKieAiCallback(job.id, state, resultJson, failMsg, failCode, taskId);
    
    console.log('[Kie AI Veo 3.1 Callback] ===== CALLBACK PROCESSED SUCCESSFULLY =====');
    return NextResponse.json({ success: true, message: 'Callback processed', jobId: job.id, taskId });
  } catch (error: any) {
    console.error('[Kie AI Veo 3.1 Callback] ===== ERROR PROCESSING CALLBACK =====');
    console.error('[Kie AI Veo 3.1 Callback] Error:', error);
    console.error('[Kie AI Veo 3.1 Callback] Error message:', error?.message);
    console.error('[Kie AI Veo 3.1 Callback] Error stack:', error?.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to process callback', details: String(error) },
      { status: 500 }
    );
  }
}


