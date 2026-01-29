import { sql } from '@/lib/database';
import { getOrCreateCredits } from '@/lib/credits/credits';

/**
 * Restore credits to a user when a job fails due to content policy violation
 */
async function restoreCreditsForFailedJob(walletAddress: string, amount: number, reason: string) {
  if (!sql) {
    throw new Error('Database connection not available');
  }

  try {
    // Ensure credits record exists
    await getOrCreateCredits(walletAddress);

    // Restore credits
    await sql`
      UPDATE credits
      SET credits = credits + ${amount}, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ${walletAddress}
    `;

    // Record refund transaction
    await sql`
      INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
      VALUES (${walletAddress}, ${amount}, 'refund', ${reason})
    `;

    console.log(`[Credit Restore] ✅ Restored ${amount} credits to ${walletAddress} - ${reason}`);
  } catch (error: any) {
    console.error(`[Credit Restore] ❌ Failed to restore credits:`, error);
    throw error;
  }
}

/**
 * Handle Kie AI task completion - stores the video URL directly, updates job, saves to history
 * This is shared between the callback endpoint and the cron job fallback
 */
export async function handleKieAiCallback(
  jobId: string,
  state: string,
  resultJson: string | any,
  failMsg: string | null,
  failCode: string | null,
  taskId: string
) {
  if (!sql) {
    throw new Error('Database connection not available');
  }

  if (state === 'success') {
    // Parse resultJson to get video URL
    // Veo 3.1 format: { resultUrls: [...], originUrls: [...], resolution: "1080p" }
    let result: any;
    try {
      result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
    } catch (e) {
      console.error('[Kie AI Callback Handler] Failed to parse resultJson:', e);
      await sql`
        UPDATE promotion_jobs
        SET status = 'failed', error_message = ${'Failed to parse result: ' + String(e)}
        WHERE id = ${jobId}::uuid
      `;
      return;
    }

    // Veo 3.1 format: resultUrls is a direct array in the info object
    // Try resultUrls first (Veo 3.1 format), then fallback to other possible formats
    const videoUrl = (Array.isArray(result.resultUrls) && result.resultUrls.length > 0 ? result.resultUrls[0] : null)
      || result.resultUrl 
      || result.videoUrl
      || result.url
      || null;

    if (!videoUrl) {
      console.error('[Kie AI Callback Handler] No video URL in result. Full result:', JSON.stringify(result, null, 2));
      console.error('[Kie AI Callback Handler] Available keys:', Object.keys(result || {}));
      await sql`
        UPDATE promotion_jobs
        SET status = 'failed', error_message = ${'No video URL in result. Keys: ' + Object.keys(result || {}).join(', ')}
        WHERE id = ${jobId}::uuid
      `;
      return;
    }

    console.log('[Kie AI Callback Handler] Video generated successfully, URL from Kie AI:', videoUrl);

    // Store the Kie AI video URL directly (no download/upload)
    try {
      // Get job details for promotions history
      const jobDetails = await sql`
        SELECT wallet_address, collection_id, flyer_text, subject_count, subject_actions, no_text, subject_type
        FROM promotion_jobs
        WHERE id = ${jobId}::uuid
      ` as any[];
      const job = jobDetails[0];

      // Mark job completed (clear error_message which had the taskId)
      await sql`
        UPDATE promotion_jobs
        SET status = 'completed', 
            completed_at = CURRENT_TIMESTAMP, 
            image_url = ${videoUrl},
            error_message = NULL
        WHERE id = ${jobId}::uuid
      `;

      // Note: Video jobs are NOT saved to promotions table to avoid duplicates.
      // The history endpoint fetches video jobs directly from promotion_jobs table.

      console.log('[Kie AI Callback Handler] Promotion job completed successfully:', jobId);
    } catch (error: any) {
      console.error('[Kie AI Callback Handler] Error saving video URL:', error);
      await sql`
        UPDATE promotion_jobs
        SET status = 'failed', 
            error_message = ${'Failed to save video URL: ' + (error.message || String(error))}
        WHERE id = ${jobId}::uuid
      `;
    }
  } else if (state === 'fail') {
    // Validate error message - don't use if it's just a state value
    let errorMessage = failMsg;
    if (!errorMessage || errorMessage === 'success' || errorMessage === 'fail' || errorMessage.length <= 2) {
      errorMessage = 'Video generation failed';
    }
    console.error('[Kie AI Callback Handler] Task failed:', errorMessage);
    
    // Determine failure reason for refund description
    const errorLower = errorMessage.toLowerCase();
    const isContentPolicyViolation = 
      errorLower.includes('content policy') ||
      errorLower.includes('content violation') ||
      errorLower.includes('violating content policies') ||
      errorLower.includes('flagged') ||
      failCode === '400' ||
      failCode === '422';
    
    const refundReason = isContentPolicyViolation 
      ? 'Content policy violation'
      : errorMessage;
    
    // Get job details to restore credits
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
        
      // Restore credits for ALL video job failures (user paid but didn't get a video)
      if (isVideoJob && walletAddress) {
          const creditAmount = 4; // Video generation costs 4 credits
          try {
            await restoreCreditsForFailedJob(
              walletAddress,
              creditAmount,
            `Refund for video generation failed: ${refundReason}`
            );
          console.log(`[Kie AI Callback Handler] ✅ Restored ${creditAmount} credits - reason: ${refundReason}`);
          } catch (restoreError: any) {
            console.error(`[Kie AI Callback Handler] Failed to restore credits:`, restoreError);
            // Continue with marking as failed even if credit restore fails
        }
      }
    }
    
    // Mark job as failed
    await sql`
      UPDATE promotion_jobs
      SET status = 'failed', 
          error_message = ${errorMessage}
      WHERE id = ${jobId}::uuid
    `;
  } else {
    console.log('[Kie AI Callback Handler] Task still processing, state:', state);
    // Don't update status if still processing - wait for final callback
  }
}

