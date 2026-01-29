import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { checkAuthorizationServer } from '@/lib/auth/access-control';

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet_address');
    const errorType = searchParams.get('error_type'); // Optional filter
    const collectionId = searchParams.get('collection_id'); // Optional filter
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    // Check authorization
    const authResult = await checkAuthorizationServer(request, sql);
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 });
    }

    // Build query with optional filters
    let errors;
    if (errorType && errorType !== 'all' && collectionId) {
      errors = await sql`
        SELECT 
          ge.id,
          ge.generation_job_id,
          ge.collection_id,
          ge.ordinal_number,
          ge.error_type,
          ge.error_message,
          ge.error_details,
          ge.api_response,
          ge.prompt,
          ge.created_at,
          c.name as collection_name,
          gj.status as job_status
        FROM generation_errors ge
        LEFT JOIN collections c ON ge.collection_id = c.id
        LEFT JOIN generation_jobs gj ON ge.generation_job_id = gj.id
        WHERE ge.error_type = ${errorType}
          AND ge.collection_id = ${collectionId}::uuid
        ORDER BY ge.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[];
    } else if (errorType && errorType !== 'all') {
      errors = await sql`
        SELECT 
          ge.id,
          ge.generation_job_id,
          ge.collection_id,
          ge.ordinal_number,
          ge.error_type,
          ge.error_message,
          ge.error_details,
          ge.api_response,
          ge.prompt,
          ge.created_at,
          c.name as collection_name,
          gj.status as job_status
        FROM generation_errors ge
        LEFT JOIN collections c ON ge.collection_id = c.id
        LEFT JOIN generation_jobs gj ON ge.generation_job_id = gj.id
        WHERE ge.error_type = ${errorType}
        ORDER BY ge.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[];
    } else if (collectionId) {
      errors = await sql`
        SELECT 
          ge.id,
          ge.generation_job_id,
          ge.collection_id,
          ge.ordinal_number,
          ge.error_type,
          ge.error_message,
          ge.error_details,
          ge.api_response,
          ge.prompt,
          ge.created_at,
          c.name as collection_name,
          gj.status as job_status
        FROM generation_errors ge
        LEFT JOIN collections c ON ge.collection_id = c.id
        LEFT JOIN generation_jobs gj ON ge.generation_job_id = gj.id
        WHERE ge.collection_id = ${collectionId}::uuid
        ORDER BY ge.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[];
    } else {
      errors = await sql`
        SELECT 
          ge.id,
          ge.generation_job_id,
          ge.collection_id,
          ge.ordinal_number,
          ge.error_type,
          ge.error_message,
          ge.error_details,
          ge.api_response,
          ge.prompt,
          ge.created_at,
          c.name as collection_name,
          gj.status as job_status
        FROM generation_errors ge
        LEFT JOIN collections c ON ge.collection_id = c.id
        LEFT JOIN generation_jobs gj ON ge.generation_job_id = gj.id
        ORDER BY ge.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ` as any[];
    }

    // Get summary counts
    const summaryQuery = sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE error_type = 'content_policy_violation')::int as content_policy_violations,
        COUNT(*) FILTER (WHERE error_type = 'api_error')::int as api_errors,
        COUNT(*) FILTER (WHERE error_type = 'timeout')::int as timeouts,
        COUNT(*) FILTER (WHERE error_type = 'upload_error')::int as upload_errors,
        COUNT(*) FILTER (WHERE error_type = 'download_error')::int as download_errors,
        COUNT(*) FILTER (WHERE error_type = 'thumbnail_error')::int as thumbnail_errors,
        COUNT(*) FILTER (WHERE error_type = 'compression_error')::int as compression_errors,
        COUNT(*) FILTER (WHERE error_type = 'base64_error')::int as base64_errors,
        COUNT(*) FILTER (WHERE error_type = 'unknown')::int as unknown_errors
      FROM generation_errors
    `;

    const summaryResult = await summaryQuery as any[];
    const summary = summaryResult?.[0] || {
      total: 0,
      content_policy_violations: 0,
      api_errors: 0,
      timeouts: 0,
      upload_errors: 0,
      download_errors: 0,
      thumbnail_errors: 0,
      compression_errors: 0,
      base64_errors: 0,
      unknown_errors: 0,
    };

    return NextResponse.json({
      success: true,
      errors: errors || [],
      summary,
    });
  } catch (error) {
    console.error('Error fetching generation errors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch generation errors', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

