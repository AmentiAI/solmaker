import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// GET /api/collections/[id]/jobs/status - Get job queue status for this collection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;

    // Get counts by status
    const result = await sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM generation_jobs
      WHERE collection_id = ${collectionId}
      AND status IN ('pending', 'processing')
      GROUP BY status
    `;

    const statusCounts: Record<string, number> = {};
    if (Array.isArray(result)) {
      result.forEach(row => {
        statusCounts[row.status] = parseInt(String(row.count));
      });
    }

    return NextResponse.json({
      pending: statusCounts.pending || 0,
      processing: statusCounts.processing || 0,
      total: (statusCounts.pending || 0) + (statusCounts.processing || 0)
    });

  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json({ error: 'Failed to fetch job status' }, { status: 500 });
  }
}

