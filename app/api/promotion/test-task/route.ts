import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { handleKieAiCallback } from '@/lib/promotion/kie-ai-callback-handler';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/promotion/test-task - Test and debug a specific Kie AI taskId
 * Body: { taskId: string, jobId?: string }
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { taskId, jobId } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    console.log('[Test Task] Testing taskId:', taskId);

    // Query Kie AI API to get task status
    const kieApiKey = process.env.KIE_AI_API_KEY;
    if (!kieApiKey) {
      return NextResponse.json({ error: 'KIE_AI_API_KEY not configured' }, { status: 500 });
    }

    const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
    const recordInfoEndpoint = `${kieApiEndpoint}/api/v1/jobs/recordInfo?taskId=${taskId}`;

    console.log('[Test Task] Querying Kie AI:', recordInfoEndpoint);

    const recordRes = await fetch(recordInfoEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
      },
    });

    const recordData = await recordRes.json();
    console.log('[Test Task] Kie AI response:', JSON.stringify(recordData, null, 2));

    // Find the promotion job if jobId not provided
    let targetJobId = jobId;
    if (!targetJobId) {
      const jobRows = await sql`
        SELECT id, collection_id, wallet_address, status, error_message, started_at
        FROM promotion_jobs
        WHERE error_message LIKE ${`%${taskId}%`}
        ORDER BY created_at DESC
        LIMIT 1
      ` as any[];
      
      if (jobRows.length > 0) {
        targetJobId = jobRows[0].id;
        console.log('[Test Task] Found job:', targetJobId, 'Status:', jobRows[0].status);
      } else {
        return NextResponse.json({ 
          error: 'Job not found for this taskId',
          taskId,
          kieAiResponse: recordData
        }, { status: 404 });
      }
    }

    // Analyze the response
    const analysis: any = {
      taskId,
      jobId: targetJobId,
      kieAiResponse: recordData,
      httpStatus: recordRes.status,
      canProcess: false,
      issues: []
    };

    if (!recordRes.ok) {
      analysis.issues.push(`HTTP ${recordRes.status}: ${recordRes.statusText}`);
      return NextResponse.json(analysis, { status: 200 });
    }

    if (recordData.code !== 200) {
      analysis.issues.push(`Kie AI returned code ${recordData.code}: ${recordData.message || recordData.msg || 'Unknown error'}`);
      return NextResponse.json(analysis, { status: 200 });
    }

    if (!recordData.data) {
      analysis.issues.push('No data field in response');
      return NextResponse.json(analysis, { status: 200 });
    }

    // Handle Veo 3.1 format: { code: 200, data: { taskId, info: { resultUrls: [...] } } }
    // Or recordInfo format: { code: 200, data: { taskId, state, resultJson, ... } }
    const data = recordData.data;
    let state: string;
    let resultInfo: any = null;
    let failMsg: string | null = null;
    
    if (recordData.code === 200) {
      // Success - check if it's Veo 3.1 format (has info.resultUrls) or old format (has state/resultJson)
      if (data.info && data.info.resultUrls) {
        // Veo 3.1 format
        state = 'success';
        resultInfo = data.info;
        analysis.format = 'Veo 3.1 callback format';
      } else if (data.state === 'success' || data.state === 'fail') {
        // Old format from recordInfo
        state = data.state;
        analysis.format = 'recordInfo format';
        if (data.resultJson) {
          try {
            resultInfo = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
          } catch (e) {
            analysis.issues.push(`Failed to parse resultJson: ${e}`);
          }
        }
        failMsg = data.failMsg || null;
      } else {
        analysis.state = data.state || 'unknown';
        analysis.issues.push(`Task still processing, state: ${data.state || 'unknown'}`);
        return NextResponse.json(analysis, { status: 200 });
      }
    } else {
      // Failed
      state = 'fail';
      failMsg = recordData.msg || recordData.message || `Failed with code ${recordData.code}`;
      analysis.format = 'error format';
    }
    
    analysis.state = state;
    analysis.resultInfo = resultInfo;
    analysis.failMsg = failMsg;

    // Check if we can extract video URL
    if (resultInfo) {
      const videoUrl = (Array.isArray(resultInfo.resultUrls) && resultInfo.resultUrls.length > 0)
        ? resultInfo.resultUrls[0]
        : null;
      analysis.videoUrl = videoUrl;
      if (!videoUrl) {
        analysis.issues.push('No video URL found in resultInfo');
        analysis.availableKeys = Object.keys(resultInfo);
      }
    }

    // If state is success or fail, try to process it
    if (state === 'success' || state === 'fail') {
      analysis.canProcess = true;
      
      // Actually process it if requested
      if (body.process === true) {
        try {
          console.log('[Test Task] Processing callback for job:', targetJobId);
          // Convert to format handler expects
          const resultJson = resultInfo ? JSON.stringify(resultInfo) : null;
          await handleKieAiCallback(targetJobId, state, resultJson, failMsg, null, taskId);
          
          // Check job status after processing
          const updatedJob = await sql`
            SELECT id, status, image_url, error_message, completed_at
            FROM promotion_jobs
            WHERE id = ${targetJobId}::uuid
          ` as any[];
          
          analysis.processed = true;
          analysis.updatedJob = updatedJob[0];
        } catch (processError: any) {
          analysis.processError = processError.message;
          analysis.processed = false;
        }
      }
    } else {
      analysis.issues.push(`Task still in state: ${state}`);
    }

    return NextResponse.json(analysis, { status: 200 });
  } catch (error: any) {
    console.error('[Test Task] Error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to test task',
        stack: error.stack
      },
      { status: 500 }
    );
  }
}

