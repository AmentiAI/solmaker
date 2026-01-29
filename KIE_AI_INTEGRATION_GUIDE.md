# Kie.ai Video Generation Integration Guide

This guide documents how to integrate Kie.ai's Veo 3.1 video generation API into your project, based on the implementation in this codebase.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Variables](#environment-variables)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Implementation Steps](#implementation-steps)
7. [Callback Handling](#callback-handling)
8. [Polling Fallback](#polling-fallback)
9. [Error Handling & Credit Refunds](#error-handling--credit-refunds)
10. [Frontend Integration](#frontend-integration)
11. [Testing](#testing)

---

## Overview

Kie.ai provides a video generation API (Veo 3.1) that can create videos from images and text prompts. The integration follows this flow:

```
User Request → Queue Job → Cron Processes Job → Call Kie AI API → Receive Callback → Update Job Status
```

Key features:
- **Image-to-Video**: Generate videos from 1-8 source images
- **Text Prompts**: Describe scenes, actions, and speech
- **Aspect Ratios**: Support for 16:9 (landscape) and 9:16 (portrait)
- **Async Processing**: Jobs are queued and processed via cron, with callback notifications
- **Fallback Polling**: Manual polling endpoint for when callbacks fail

---

## Prerequisites

1. **Kie.ai Account**: Sign up at [kie.ai](https://kie.ai) and get an API key
2. **PostgreSQL Database**: For storing job queue and status
3. **Cron Job Support**: Vercel cron, serverless functions, or similar
4. **Public Callback URL**: Your server must be accessible for callbacks

---

## Environment Variables

Add these to your `.env` or Vercel environment:

```bash
# Required
KIE_AI_API_KEY=your_api_key_here

# Optional (defaults shown)
KIE_AI_API_ENDPOINT=https://api.kie.ai

# Required for callbacks to work
NEXT_PUBLIC_BASE_URL=https://your-domain.com
# OR Vercel auto-provides:
# VERCEL_URL=your-app.vercel.app
```

---

## Database Schema

Create a jobs table to track video generation requests:

```sql
-- Video generation jobs table
CREATE TABLE IF NOT EXISTS video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User/ownership
  wallet_address TEXT NOT NULL,
  
  -- Job status
  status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Input parameters
  prompt TEXT,
  image_urls JSONB,  -- Array of source image URLs
  aspect_ratio VARCHAR(10) DEFAULT '16:9',
  model VARCHAR(20) DEFAULT 'veo3_fast',
  
  -- Additional metadata (optional)
  metadata JSONB,
  
  -- Output
  video_url TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_video_jobs_status_created 
  ON video_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_wallet_created 
  ON video_jobs(wallet_address, created_at DESC);
```

---

## API Endpoints

You'll need these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/video/generate` | POST | Queue a new video job |
| `/api/video/jobs/[id]` | GET | Check job status |
| `/api/video/kie-ai-callback` | POST | Receive Kie AI completion notifications |
| `/api/video/manual-callback` | POST | Manually poll Kie AI for stuck jobs |
| `/api/cron/process-video-jobs` | GET | Cron endpoint to process pending jobs |

---

## Implementation Steps

### Step 1: Create the Job Queue Endpoint

```typescript
// app/api/video/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const {
    wallet_address,
    prompt,
    image_urls,      // Array of image URLs (1-8 images)
    aspect_ratio,    // 'landscape' or 'portrait'
  } = body;

  // Validation
  if (!wallet_address) {
    return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
  }
  if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
    return NextResponse.json({ error: 'image_urls required (1-8 images)' }, { status: 400 });
  }
  if (image_urls.length > 8) {
    return NextResponse.json({ error: 'Maximum 8 images allowed' }, { status: 400 });
  }

  // Map aspect ratio to Kie AI format
  const kieAspectRatio = aspect_ratio === 'portrait' ? '9:16' : '16:9';

  // Queue the job
  const result = await sql`
    INSERT INTO video_jobs (
      wallet_address,
      prompt,
      image_urls,
      aspect_ratio,
      status
    ) VALUES (
      ${wallet_address},
      ${prompt || 'Generate a video'},
      ${JSON.stringify(image_urls)}::jsonb,
      ${kieAspectRatio},
      'pending'
    )
    RETURNING id
  `;

  const jobId = result[0]?.id;
  return NextResponse.json({ job_id: jobId }, { status: 202 });
}
```

### Step 2: Create the Cron Job Processor

```typescript
// app/api/cron/process-video-jobs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Vercel Pro

export async function GET(request: NextRequest) {
  // Verify cron secret (recommended)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kieApiKey = process.env.KIE_AI_API_KEY;
  const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';
  
  if (!kieApiKey) {
    return NextResponse.json({ error: 'KIE_AI_API_KEY not configured' }, { status: 500 });
  }

  // Get pending jobs
  const pendingJobs = await sql`
    SELECT id, prompt, image_urls, aspect_ratio
    FROM video_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 5
  `;

  for (const job of pendingJobs) {
    try {
      // Mark as processing
      await sql`
        UPDATE video_jobs
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE id = ${job.id}
      `;

      // Build callback URL
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
      const callbackUrl = `${baseUrl}/api/video/kie-ai-callback`;

      // Call Kie AI Veo 3.1 API
      const response = await fetch(`${kieApiEndpoint}/api/v1/veo/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`,
        },
        body: JSON.stringify({
          prompt: job.prompt,
          imageUrls: job.image_urls,
          model: 'veo3_fast',           // or 'veo3' for higher quality
          generationType: 'REFERENCE_2_VIDEO',
          aspectRatio: job.aspect_ratio,
          callBackUrl: callbackUrl,
          enableTranslation: true,      // Auto-translate to English
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `API error: ${response.status}`);
      }

      // Store taskId for tracking (Kie AI returns taskId)
      const taskId = data.data?.taskId;
      if (taskId) {
        await sql`
          UPDATE video_jobs
          SET error_message = ${'KIE_AI_TASK_ID:' + taskId}
          WHERE id = ${job.id}
        `;
      }

      console.log(`Job ${job.id} submitted to Kie AI, taskId: ${taskId}`);

    } catch (error: any) {
      console.error(`Failed to process job ${job.id}:`, error);
      await sql`
        UPDATE video_jobs
        SET status = 'failed', error_message = ${error.message}
        WHERE id = ${job.id}
      `;
    }
  }

  return NextResponse.json({ processed: pendingJobs.length });
}
```

### Step 3: Configure Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-video-jobs",
      "schedule": "* * * * *"
    }
  ]
}
```

---

## Callback Handling

Kie AI sends a POST request to your callback URL when generation completes.

```typescript
// app/api/video/kie-ai-callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json();
  console.log('[Kie AI Callback] Received:', JSON.stringify(body, null, 2));

  // Veo 3.1 callback format:
  // Success: { code: 200, data: { taskId, response: { resultUrls: [...] }, successFlag: 1 } }
  // Failure: { code: 400/422/500, msg: "error message", data: { taskId, errorMessage: "..." } }

  const { code, msg, data } = body;
  const taskId = data?.taskId;

  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
  }

  // Find job by taskId
  const jobs = await sql`
    SELECT id, wallet_address
    FROM video_jobs
    WHERE error_message LIKE ${'%' + taskId + '%'}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (jobs.length === 0) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = jobs[0];

  // Determine success or failure
  if (code === 200 && data.successFlag === 1) {
    // Success - extract video URL
    const videoUrl = data.response?.resultUrls?.[0] || 
                     data.info?.resultUrls?.[0];

    if (videoUrl) {
      await sql`
        UPDATE video_jobs
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            video_url = ${videoUrl},
            error_message = NULL
        WHERE id = ${job.id}
      `;
      console.log(`Job ${job.id} completed, video: ${videoUrl}`);
    } else {
      await sql`
        UPDATE video_jobs
        SET status = 'failed',
            error_message = 'No video URL in response'
        WHERE id = ${job.id}
      `;
    }
  } else {
    // Failure
    const errorMessage = data.errorMessage || msg || `Failed with code ${code}`;
    await sql`
      UPDATE video_jobs
      SET status = 'failed',
          error_message = ${errorMessage}
      WHERE id = ${job.id}
    `;
    console.log(`Job ${job.id} failed: ${errorMessage}`);
  }

  return NextResponse.json({ success: true, jobId: job.id });
}

// GET endpoint for testing callback accessibility
export async function GET() {
  return NextResponse.json({ 
    message: 'Kie AI callback endpoint is accessible',
    timestamp: new Date().toISOString()
  });
}
```

---

## Polling Fallback

Sometimes callbacks fail. Add a manual polling endpoint:

```typescript
// app/api/video/manual-callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function POST(request: NextRequest) {
  const { taskId, jobId } = await request.json();

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }

  const kieApiKey = process.env.KIE_AI_API_KEY;
  const kieApiEndpoint = process.env.KIE_AI_API_ENDPOINT || 'https://api.kie.ai';

  // Query Kie AI for task status
  const response = await fetch(
    `${kieApiEndpoint}/api/v1/veo/record-info?taskId=${taskId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
      },
    }
  );

  const data = await response.json();
  console.log('[Manual Callback] Kie AI response:', JSON.stringify(data, null, 2));

  // Check status
  // successFlag: 0 = processing, 1 = success, 2+ = various failures
  if (data.code === 200) {
    if (data.data?.successFlag === 1 && data.data?.response?.resultUrls?.length > 0) {
      // Success
      const videoUrl = data.data.response.resultUrls[0];
      
      // Find and update job
      const jobs = await sql`
        SELECT id FROM video_jobs
        WHERE error_message LIKE ${'%' + taskId + '%'}
        LIMIT 1
      `;
      
      if (jobs.length > 0) {
        await sql`
          UPDATE video_jobs
          SET status = 'completed',
              completed_at = CURRENT_TIMESTAMP,
              video_url = ${videoUrl},
              error_message = NULL
          WHERE id = ${jobs[0].id}
        `;
      }
      
      return NextResponse.json({ success: true, videoUrl });
    } else if (data.data?.successFlag === 0) {
      // Still processing
      return NextResponse.json({ 
        message: 'Task still processing',
        successFlag: 0 
      });
    } else {
      // Failed
      const errorMessage = data.data?.errorMessage || 'Video generation failed';
      return NextResponse.json({ 
        success: false, 
        error: errorMessage 
      });
    }
  }

  return NextResponse.json({ 
    error: 'Failed to check task status',
    details: data 
  }, { status: 400 });
}
```

---

## Error Handling & Credit Refunds

Handle failures gracefully and refund credits when appropriate:

```typescript
// Content policy violations and other failures should trigger refunds
const isContentPolicyViolation = 
  errorMessage.toLowerCase().includes('content policy') ||
  errorMessage.toLowerCase().includes('violating content policies') ||
  errorMessage.toLowerCase().includes('flagged') ||
  statusCode === 400 ||
  statusCode === 422;

if (isContentPolicyViolation) {
  // Refund credits to user
  await sql`
    UPDATE credits
    SET credits = credits + ${creditAmount}
    WHERE wallet_address = ${walletAddress}
  `;
  
  // Log the refund
  await sql`
    INSERT INTO credit_transactions (wallet_address, amount, transaction_type, description)
    VALUES (${walletAddress}, ${creditAmount}, 'refund', ${'Video generation failed: ' + errorMessage})
  `;
}
```

---

## Frontend Integration

### React Hook for Video Generation

```typescript
// hooks/useVideoGeneration.ts
import { useState, useCallback } from 'react';

interface VideoJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error_message?: string;
}

export function useVideoGeneration() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoJob['status'] | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (params: {
    wallet_address: string;
    prompt: string;
    image_urls: string[];
    aspect_ratio?: 'landscape' | 'portrait';
  }) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setJobId(data.job_id);
      setStatus('pending');
      
      // Start polling
      pollJobStatus(data.job_id);
      
    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
    }
  }, []);

  const pollJobStatus = useCallback(async (id: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/video/jobs/${id}`);
        const data = await res.json();
        
        setStatus(data.job?.status);
        
        if (data.job?.status === 'completed') {
          setVideoUrl(data.job.video_url);
          setIsGenerating(false);
          return;
        }
        
        if (data.job?.status === 'failed') {
          setError(data.job.error_message);
          setIsGenerating(false);
          return;
        }
        
        // Continue polling
        setTimeout(poll, 2000);
      } catch (err) {
        setTimeout(poll, 5000);
      }
    };
    
    poll();
  }, []);

  return {
    generate,
    jobId,
    status,
    videoUrl,
    error,
    isGenerating,
  };
}
```

### Usage Example

```tsx
function VideoGenerator() {
  const { generate, status, videoUrl, error, isGenerating } = useVideoGeneration();
  
  const handleGenerate = () => {
    generate({
      wallet_address: currentAddress,
      prompt: 'A character dancing in the rain',
      image_urls: [selectedImageUrl],
      aspect_ratio: 'landscape',
    });
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate Video'}
      </button>
      
      {status && <p>Status: {status}</p>}
      {error && <p className="error">{error}</p>}
      {videoUrl && (
        <video src={videoUrl} controls autoPlay loop />
      )}
    </div>
  );
}
```

---

## Testing

### Test Script

```javascript
// scripts/test-video-generation.js
const BASE_URL = 'http://localhost:3000';

async function testVideoGeneration() {
  console.log('Testing video generation...');
  
  // 1. Queue a job
  const queueRes = await fetch(`${BASE_URL}/api/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: 'test_wallet_123',
      prompt: 'A character waving hello',
      image_urls: ['https://example.com/image.png'],
      aspect_ratio: 'landscape',
    }),
  });
  
  const { job_id } = await queueRes.json();
  console.log('Job queued:', job_id);
  
  // 2. Poll for completion
  let attempts = 0;
  while (attempts < 150) { // 5 minutes max
    const statusRes = await fetch(`${BASE_URL}/api/video/jobs/${job_id}`);
    const { job } = await statusRes.json();
    
    console.log(`Status: ${job.status}`);
    
    if (job.status === 'completed') {
      console.log('Video URL:', job.video_url);
      break;
    }
    if (job.status === 'failed') {
      console.log('Error:', job.error_message);
      break;
    }
    
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
}

testVideoGeneration();
```

### Verify Callback URL

```bash
# Test that your callback URL is accessible
curl -X GET https://your-domain.com/api/video/kie-ai-callback
# Should return: {"message":"Kie AI callback endpoint is accessible",...}
```

---

## API Reference

### Kie AI Veo 3.1 Generate Endpoint

**POST** `https://api.kie.ai/api/v1/veo/generate`

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "prompt": "Description of the video",
  "imageUrls": ["https://...image1.png", "https://...image2.png"],
  "model": "veo3_fast",
  "generationType": "REFERENCE_2_VIDEO",
  "aspectRatio": "16:9",
  "callBackUrl": "https://your-domain.com/api/video/kie-ai-callback",
  "enableTranslation": true
}
```

**Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "abc123..."
  }
}
```

### Kie AI Record Info Endpoint

**GET** `https://api.kie.ai/api/v1/veo/record-info?taskId=abc123`

**Response (Processing):**
```json
{
  "code": 200,
  "data": {
    "taskId": "abc123",
    "successFlag": 0
  }
}
```

**Response (Success):**
```json
{
  "code": 200,
  "data": {
    "taskId": "abc123",
    "successFlag": 1,
    "response": {
      "resultUrls": ["https://...video.mp4"],
      "resolution": "1080p"
    }
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Callbacks not received | Verify `NEXT_PUBLIC_BASE_URL` or `VERCEL_URL` is set correctly |
| 401 Authentication error | Check `KIE_AI_API_KEY` is valid |
| 402 Insufficient credits | Add credits to your Kie.ai account |
| Jobs stuck in "processing" | Use manual-callback endpoint to poll |
| Content policy violation | Modify prompt/images to comply with policies |

---

## Cost Considerations

- **veo3_fast**: Lower cost, faster generation (~2-3 minutes)
- **veo3**: Higher quality, higher cost (~3-5 minutes)

Video generation typically costs 4 credits per video in this implementation. Adjust based on your Kie.ai pricing tier.

---

## Security Notes

1. **Never expose** `KIE_AI_API_KEY` in frontend code
2. **Verify cron requests** using `CRON_SECRET`
3. **Validate ownership** before allowing job creation
4. **Rate limit** the generate endpoint to prevent abuse
