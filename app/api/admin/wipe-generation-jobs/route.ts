import { NextRequest, NextResponse } from 'next/server'

import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database';

// POST /api/admin/wipe-generation-jobs - Wipe all generation jobs
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    // Check admin authorization
    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    // Get counts before deletion
    const jobsCount = await sql`
      SELECT COUNT(*) as count FROM generation_jobs
    ` as any[]

    const jobsCountNum = (Array.isArray(jobsCount) && jobsCount[0]?.count) || 0

    // Delete all generation jobs
    await sql`DELETE FROM generation_jobs`

    return NextResponse.json({
      success: true,
      message: `Wiped all generation jobs successfully`,
      deleted: {
        generation_jobs: jobsCountNum
      }
    })
  } catch (error: any) {
    console.error('Error wiping generation jobs:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to wipe generation jobs' },
      { status: 500 }
    )
  }
}

