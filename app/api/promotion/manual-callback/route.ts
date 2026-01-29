import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { getOrCreateCredits } from '@/lib/credits/credits';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/promotion/manual-callback - Manually trigger callback processing for a completed Kie AI task
 * 
 * This endpoint allows manually processing a callback when the automatic callback fails.
 * Useful for debugging and recovery.
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    console.log('[Manual Callback] Processing taskId:', taskId);

    // Query Kie AI API to get task status
    const kieApiKey = process.env.KIE_AI_API_KEY;
    if (!kieApiKey) {
      return NextResponse.json({ error: 'KIE_AI_API_KEY not configured' }, { status: 500 });
    }

    const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
    // Try the Veo 3.1 endpoint first: /api/v1/veo/record-info
    // Fallback to old endpoint if needed
    const recordInfoEndpoint = `${kieApiEndpoint}/api/v1/veo/record-info?taskId=${taskId}`;

    console.log('[Manual Callback] Querying Kie AI (Veo 3.1):', recordInfoEndpoint);

    let recordRes = await fetch(recordInfoEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
      },
    });

    // If 404, try the old endpoint format
    if (recordRes.status === 404) {
      const oldEndpoint = `${kieApiEndpoint}/api/v1/jobs/recordInfo?taskId=${taskId}`;
      console.log('[Manual Callback] Veo 3.1 endpoint not found, trying old format:', oldEndpoint);
      recordRes = await fetch(oldEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kieApiKey}`,
        },
      });
    }

    const recordData = await recordRes.json();
    console.log('[Manual Callback] Kie AI response:', JSON.stringify(recordData, null, 2));

    // Check if the API call itself failed
    if (!recordRes.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch task from Kie AI', 
        details: recordData,
        statusCode: recordRes.status
      }, { status: 400 });
    }

    // Handle Veo 3.1 format: { code: 200, data: { taskId, response: { resultUrls: [...] }, successFlag: 1 } }
    // Or old recordInfo format: { code: 200, data: { taskId, state, resultJson, ... } }
    const data = recordData.data || {};
    let state: string;
    let resultInfo: any = null;
    let failMsg: string | null = null;
    
    // Check for explicit failure codes (400, 422, 500, 501, etc.)
    if (recordData.code !== 200) {
      // Explicit failure from Kie AI
      state = 'fail';
      // Validate error message - don't use if it's just a state value
      const rawMsg = data.errorMessage || recordData.msg || recordData.message;
      if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
        failMsg = rawMsg;
      } else {
        failMsg = `Video generation failed with code ${recordData.code}`;
      }
      console.log('[Manual Callback] Task failed with code:', recordData.code, 'message:', failMsg);
    } else if (recordData.code === 200) {
      // Check for Veo 3.1 format with response.resultUrls
      if (data.response && data.response.resultUrls && data.response.resultUrls.length > 0) {
        // Has result URLs - check successFlag
        if (data.successFlag === 1) {
          state = 'success';
          resultInfo = data.response;
        } else {
          // Has resultUrls but successFlag is not 1 - this is a failure with partial results
          state = 'fail';
          console.log('[Manual Callback] Task failed with resultUrls but successFlag:', data.successFlag);
          const rawMsg = data.errorMessage;
          if (rawMsg && rawMsg !== 'success' && rawMsg !== 'fail' && rawMsg.length > 2) {
            failMsg = rawMsg;
          } else {
            failMsg = `Video generation failed (successFlag: ${data.successFlag})`;
          }
        }
      } else if (data.info && data.info.resultUrls && data.info.resultUrls.length > 0) {
        // Alternative Veo 3.1 format with info.resultUrls - assume success if resultUrls exist
        state = 'success';
        resultInfo = data.info;
      } else if (data.state === 'success' || data.state === 'fail') {
        // Old format from recordInfo with explicit state
        state = data.state;
        if (data.resultJson) {
          try {
            resultInfo = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
          } catch (e) {
            return NextResponse.json({ 
              error: 'Failed to parse resultJson', 
              details: String(e) 
            }, { status: 400 });
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
        console.log('[Manual Callback] Task failed with errorMessage:', failMsg);
      } else {
        // code: 200, no resultUrls, no explicit error = still processing
        // successFlag: 0 with no results means "not yet successful", not "failed"
        return NextResponse.json({ 
          message: 'Task still processing', 
          state: 'processing',
          taskId,
          successFlag: data.successFlag,
          hasResultUrls: false,
          data
        });
      }
    } else {
      // Unknown code - treat as failure only if there's a real error message
      const realError = data.errorMessage && data.errorMessage !== 'success' && data.errorMessage.length > 2
        ? data.errorMessage
        : null;
      if (realError) {
        state = 'fail';
        failMsg = realError;
      } else {
        return NextResponse.json({ 
          error: 'Unknown response format from Kie AI',
          details: recordData
        }, { status: 400 });
      }
    }

    // Find the promotion job - don't filter by status, just find by taskId
    let jobRows = await sql`
      SELECT id, collection_id, wallet_address, status, error_message, created_at
      FROM promotion_jobs
      WHERE error_message LIKE ${`%${taskId}%`}
      ORDER BY created_at DESC
      LIMIT 1
    ` as any[];

    // If not found, try exact match
    if (!jobRows || jobRows.length === 0) {
      jobRows = await sql`
        SELECT id, collection_id, wallet_address, status, error_message, created_at
        FROM promotion_jobs
        WHERE error_message = ${`KIE_AI_TASK_ID:${taskId}`}
        ORDER BY created_at DESC
        LIMIT 1
      ` as any[];
    }

    if (!jobRows || jobRows.length === 0) {
      // Try to find any job with this taskId for debugging
      const allJobs = await sql`
        SELECT id, status, error_message, created_at, started_at
        FROM promotion_jobs
        WHERE error_message LIKE ${`%${taskId}%`}
        ORDER BY created_at DESC
        LIMIT 10
      ` as any[];
      
      return NextResponse.json({ 
        error: 'Job not found', 
        taskId,
        searchedPattern: `%${taskId}%`,
        availableJobs: allJobs 
      }, { status: 404 });
    }

    const job = jobRows[0];
    console.log('[Manual Callback] Found job:', job.id, 'status:', job.status);

    // Process the callback
    if (state === 'success') {
      // Veo 3.1 format: resultInfo has resultUrls array directly
      // resultInfo = { resultUrls: [...], originUrls: [...], resolution: "1080p" }
      // Or from response: { resultUrls: [...], originUrls: [...], resolution: "1080p" }
      const videoUrl = resultInfo && (
        (Array.isArray(resultInfo.resultUrls) && resultInfo.resultUrls.length > 0) 
          ? resultInfo.resultUrls[0] 
          : (Array.isArray(resultInfo.originUrls) && resultInfo.originUrls.length > 0)
          ? resultInfo.originUrls[0]
          : null
      );

      if (!videoUrl) {
        // No video URL means it's actually a failure, not a success
        console.log('[Manual Callback] No video URL found - marking as failed');
        const errorMessage = failMsg || 'No video URL in result - task failed';
        await sql`
          UPDATE promotion_jobs
          SET status = 'failed', 
              error_message = ${errorMessage}
          WHERE id = ${job.id}::uuid
        `;
        return NextResponse.json({ 
          success: true, 
          message: 'Job marked as failed - no video URL',
          jobId: job.id,
          error: errorMessage
        });
      }

      console.log('[Manual Callback] Video URL from Kie AI:', videoUrl);

      // Get job details for promotions history
      const jobDetails = await sql`
        SELECT wallet_address, collection_id, flyer_text, subject_count, subject_actions, no_text, subject_type
        FROM promotion_jobs
        WHERE id = ${job.id}::uuid
      ` as any[];
      const jobData = jobDetails[0];

      // Store the Kie AI video URL directly (no download/upload)
      await sql`
        UPDATE promotion_jobs
        SET status = 'completed', 
            completed_at = CURRENT_TIMESTAMP, 
            image_url = ${videoUrl},
            error_message = NULL
        WHERE id = ${job.id}::uuid
      `;

      // Note: Video jobs are NOT saved to promotions table to avoid duplicates.
      // The history endpoint fetches video jobs directly from promotion_jobs table.

      return NextResponse.json({ 
        success: true, 
        message: 'Job completed successfully',
        jobId: job.id,
        videoUrl: videoUrl
      });
    } else if (state === 'fail') {
      // Final validation - ensure error message is meaningful
      let errorMessage = failMsg;
      if (!errorMessage || errorMessage === 'success' || errorMessage === 'fail' || errorMessage.length <= 2) {
        errorMessage = 'Video generation failed';
      }
      
      // Restore credits for failed video jobs
      let creditsRestored = false;
      try {
        const jobDetails = await sql`
          SELECT wallet_address, subject_actions
          FROM promotion_jobs
          WHERE id = ${job.id}::uuid
        ` as any[];
        
        if (jobDetails.length > 0) {
          const jobData = jobDetails[0];
          const walletAddress = jobData.wallet_address;
          const subjectActions = jobData.subject_actions || {};
          const isVideoJob = subjectActions.content_type === 'video';
          
          if (isVideoJob && walletAddress) {
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
              VALUES (${walletAddress}, ${creditAmount}, 'refund', ${`Refund for video generation failed: ${errorMessage}`})
            `;
            
            creditsRestored = true;
            console.log(`[Manual Callback] ✅ Restored ${creditAmount} credits to ${walletAddress}`);
          }
        }
      } catch (restoreError: any) {
        console.error('[Manual Callback] Failed to restore credits:', restoreError);
        // Continue with marking as failed even if credit restore fails
      }
      
      await sql`
        UPDATE promotion_jobs
        SET status = 'failed', 
            error_message = ${errorMessage}
        WHERE id = ${job.id}::uuid
      `;
      return NextResponse.json({ 
        success: true, 
        message: 'Job marked as failed',
        jobId: job.id,
        error: errorMessage,
        creditsRestored,
        kieAiResponse: {
          code: recordData.code,
          msg: recordData.msg,
          successFlag: data?.successFlag,
          errorMessage: data?.errorMessage,
          hasResultUrls: !!(data?.response?.resultUrls || data?.info?.resultUrls),
          state: data?.state
        }
      });
    } else {
      return NextResponse.json({ 
        message: 'Task still processing', 
        state,
        jobId: job.id
      });
    }
  } catch (error: any) {
    console.error('[Manual Callback] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process manual callback' },
      { status: 500 }
    );
  }
}

