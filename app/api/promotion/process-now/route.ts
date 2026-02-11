import { NextRequest, NextResponse } from 'next/server'

/**
 * Manual trigger endpoint to process pending promotion jobs immediately
 * Usage: Call this endpoint to manually trigger promotion job processing
 */
export async function POST(request: NextRequest) {
  try {
    // Get the base URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    // Call the cron endpoint
    const response = await fetch(`${baseUrl}/api/cron/process-generation-jobs-v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authorization header if your cron endpoint requires it
        ...(process.env.CRON_SECRET && {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        })
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to process jobs', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Promotion jobs processed successfully',
      data
    })
  } catch (error: any) {
    console.error('[promotion/process-now] Error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger job processing', details: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
