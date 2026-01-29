import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { checkAuthorizationServer } from '@/lib/auth/access-control'

/**
 * POST /api/admin/launchpad/reset-collection
 * Reset a collection's mint status to remove it from "Recently Minted"
 * - Marks all phases as not completed
 * - Optionally deletes test mint inscriptions
 * - Optionally resets phase end times
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const authResult = await checkAuthorizationServer(request)
    if (!authResult.isAuthorized || !authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const body = await request.json()
    const { collection_id, delete_test_mints = false, reset_phase_times = false } = body

    if (!collection_id) {
      return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
    }

    // Verify collection exists
    const collectionCheck = await sql`
      SELECT id, name, is_locked
      FROM collections
      WHERE id = ${collection_id}
    ` as any[]

    if (!collectionCheck || collectionCheck.length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collectionCheck[0]

    // Mark all phases as not completed
    await sql`
      UPDATE mint_phases
      SET is_completed = false
      WHERE collection_id = ${collection_id}
    `

    // Optionally reset phase end times to future dates (1 year from now)
    if (reset_phase_times) {
      await sql`
        UPDATE mint_phases
        SET end_time = NOW() + INTERVAL '1 year'
        WHERE collection_id = ${collection_id}
          AND end_time IS NOT NULL
          AND end_time < NOW()
      `
    }

    // Optionally delete test mint inscriptions
    if (delete_test_mints) {
      // First, get all test mint inscription IDs to clean up blob storage if needed
      const testMints = await sql`
        SELECT id, image_url, compressed_image_url, thumbnail_url, metadata_url
        FROM mint_inscriptions
        WHERE collection_id = ${collection_id}
          AND is_test_mint = true
      ` as any[]

      // Delete test mint inscriptions
      await sql`
        DELETE FROM mint_inscriptions
        WHERE collection_id = ${collection_id}
          AND is_test_mint = true
      `

      // Note: We're not deleting blob storage images here as they might be shared
      // If you want to delete them, you'd need to add blob deletion logic
    }

    // Clear mint_ended_at timestamp if it exists
    await sql`
      UPDATE collections
      SET mint_ended_at = NULL
      WHERE id = ${collection_id}
    `

    // Get updated phase count
    const phaseCount = await sql`
      SELECT COUNT(*)::int as count
      FROM mint_phases
      WHERE collection_id = ${collection_id}
    ` as any[]

    return NextResponse.json({
      success: true,
      message: `Collection "${collection.name}" mint status has been reset`,
      collection_id,
      phases_reset: phaseCount[0]?.count || 0,
      test_mints_deleted: delete_test_mints,
      phase_times_reset: reset_phase_times,
    })
  } catch (error: any) {
    console.error('Error resetting collection mint status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reset collection mint status' },
      { status: 500 }
    )
  }
}

