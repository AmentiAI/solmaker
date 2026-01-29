import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/promotion/test-task-id?taskId=xxx - Test fetching a specific taskId from Kie AI
 * This is for debugging purposes to test if we can fetch video data for a specific task
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId query parameter is required' }, { status: 400 });
    }

    const kieApiKey = process.env.KIE_AI_API_KEY;
    if (!kieApiKey) {
      return NextResponse.json({ error: 'KIE_AI_API_KEY not configured' }, { status: 500 });
    }

    const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
    
    // Try Veo 3.1 endpoint first
    const veoEndpoint = `${kieApiEndpoint}/api/v1/veo/record-info?taskId=${taskId}`;
    console.log('[Test Task ID] Querying Veo 3.1 endpoint:', veoEndpoint);

    let recordRes = await fetch(veoEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
      },
    });

    let recordData: any = null;
    let usedEndpoint = veoEndpoint;

    // If 404, try the old endpoint format
    if (recordRes.status === 404) {
      const oldEndpoint = `${kieApiEndpoint}/api/v1/jobs/recordInfo?taskId=${taskId}`;
      console.log('[Test Task ID] Veo 3.1 endpoint returned 404, trying old format:', oldEndpoint);
      usedEndpoint = oldEndpoint;
      recordRes = await fetch(oldEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kieApiKey}`,
        },
      });
    }

    recordData = await recordRes.json();
    console.log('[Test Task ID] Response status:', recordRes.status);
    console.log('[Test Task ID] Response data:', JSON.stringify(recordData, null, 2));

    if (!recordRes.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch task from Kie AI',
        status: recordRes.status,
        statusText: recordRes.statusText,
        endpoint: usedEndpoint,
        response: recordData
      }, { status: recordRes.status });
    }

    // Parse the response
    const data = recordData.data || {};
    let videoUrl: string | null = null;
    let state: string = 'unknown';
    let resultInfo: any = null;

    if (recordData.code === 200) {
      // Check for Veo 3.1 format with response.resultUrls
      if (data.response && data.response.resultUrls) {
        state = data.successFlag === 1 ? 'success' : 'fail';
        resultInfo = data.response;
        videoUrl = Array.isArray(data.response.resultUrls) && data.response.resultUrls.length > 0
          ? data.response.resultUrls[0]
          : null;
      } else if (data.info && data.info.resultUrls) {
        state = 'success';
        resultInfo = data.info;
        videoUrl = Array.isArray(data.info.resultUrls) && data.info.resultUrls.length > 0
          ? data.info.resultUrls[0]
          : null;
      } else if (data.state === 'success' || data.state === 'fail') {
        state = data.state;
        if (data.resultJson) {
          try {
            resultInfo = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
            videoUrl = resultInfo?.resultUrls?.[0] || resultInfo?.resultUrl || resultInfo?.videoUrl || null;
          } catch (e) {
            console.error('[Test Task ID] Failed to parse resultJson:', e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      endpoint: usedEndpoint,
      response: recordData,
      parsed: {
        state,
        videoUrl,
        resultInfo,
        hasVideoUrl: !!videoUrl,
        dataStructure: {
          hasResponse: !!data.response,
          hasInfo: !!data.info,
          hasState: !!data.state,
          successFlag: data.successFlag,
          errorMessage: data.errorMessage
        }
      }
    });
  } catch (error: any) {
    console.error('[Test Task ID] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to test task', details: String(error) },
      { status: 500 }
    );
  }
}
