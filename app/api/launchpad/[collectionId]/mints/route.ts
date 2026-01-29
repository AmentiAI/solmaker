import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/launchpad/[collectionId]/mints
 * Returns all mints for a collection (for metadata export)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    
    // Validate UUID format to prevent database errors from invalid IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!collectionId || !uuidRegex.test(collectionId)) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json' // 'json' or 'csv'

    // Get all successfully minted ordinals
    // Use generated_ordinals.is_minted = true as source of truth
    // Join to get the successful mint record for additional data (minter, phase, etc.)
    const mints = await sql`
      SELECT 
        go.id as ordinal_id,
        go.ordinal_number,
        go.traits,
        go.image_url,
        go.rarity_score,
        go.rarity_tier,
        go.inscription_id,
        go.minter_address,
        go.mint_tx_id,
        go.minted_at,
        mi.minter_wallet,
        mi.receiving_wallet,
        mi.commit_tx_id,
        mi.reveal_tx_id,
        mi.mint_status,
        mi.fee_rate,
        mi.mint_price_paid,
        mi.commit_broadcast_at,
        mi.reveal_broadcast_at,
        mi.completed_at,
        mi.created_at as mint_created_at,
        mp.phase_name
      FROM generated_ordinals go
      LEFT JOIN LATERAL (
        SELECT * FROM mint_inscriptions mi2
        WHERE mi2.ordinal_id = go.id
          AND mi2.is_test_mint = false
          AND mi2.mint_status NOT IN ('failed', 'expired')
        ORDER BY mi2.completed_at DESC NULLS LAST, mi2.created_at DESC
        LIMIT 1
      ) mi ON true
      LEFT JOIN mint_phases mp ON mi.phase_id = mp.id
      WHERE go.collection_id = ${collectionId}
        AND go.is_minted = true
      ORDER BY 
        COALESCE(go.minted_at, mi.completed_at, mi.created_at) ASC
    ` as any[]

    // Get summary stats - use generated_ordinals.is_minted as source of truth
    // Based on test scripts: check-minted-count.js and investigate-mint-discrepancy.js
    const stats = await sql`
      SELECT 
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId}) as total_supply,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId} AND is_minted = true) as completed,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId} AND is_minted = false) as available,
        (SELECT COUNT(DISTINCT minter_address) FROM generated_ordinals WHERE collection_id = ${collectionId} AND is_minted = true AND minter_address IS NOT NULL) as unique_minters
    ` as any[]
    
    // Get pending count - DISTINCT ordinal_ids where is_minted=false but has active mint attempt
    const pendingResult = await sql`
      SELECT COUNT(DISTINCT mi.ordinal_id) as count
      FROM mint_inscriptions mi
      JOIN generated_ordinals go ON mi.ordinal_id = go.id
      WHERE mi.collection_id = ${collectionId} 
        AND mi.is_test_mint = false 
        AND go.is_minted = false
        AND mi.mint_status IN ('pending', 'commit_broadcast', 'commit_confirmed', 'reveal_broadcast')
    ` as any[]
    
    // Get failed count - ordinals that ONLY have failed/expired mints (no successful or pending)
    const failedResult = await sql`
      SELECT COUNT(DISTINCT ordinal_id) as count
      FROM mint_inscriptions mi
      WHERE mi.collection_id = ${collectionId}
        AND mi.is_test_mint = false
        AND mi.mint_status IN ('failed', 'expired')
        AND mi.ordinal_id NOT IN (
          SELECT DISTINCT ordinal_id FROM mint_inscriptions 
          WHERE collection_id = ${collectionId}
            AND is_test_mint = false
            AND mint_status NOT IN ('failed', 'expired')
            AND ordinal_id IS NOT NULL
        )
    ` as any[]

    const summary = stats[0] || { total_supply: 0, completed: 0, available: 0, unique_minters: 0 }
    const completedCount = parseInt(summary.completed) || 0
    const pendingCount = parseInt(pendingResult[0]?.count) || 0
    const failedCount = parseInt(failedResult[0]?.count) || 0

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ordinal_number',
        'inscription_id', 
        'minter_wallet',
        'receiving_wallet',
        'commit_tx_id',
        'reveal_tx_id',
        'mint_status',
        'phase_name',
        'fee_rate',
        'mint_price_paid',
        'completed_at',
        'traits',
        'rarity_score',
        'rarity_tier',
      ]
      
      const csvRows = [headers.join(',')]
      for (const mint of mints) {
        const row = [
          mint.ordinal_number || '',
          mint.inscription_id || '',
          mint.minter_wallet || '',
          mint.receiving_wallet || '',
          mint.commit_tx_id || '',
          mint.reveal_tx_id || '',
          mint.mint_status || '',
          mint.phase_name || '',
          mint.fee_rate || '',
          mint.mint_price_paid || '',
          mint.completed_at || '',
          mint.traits ? JSON.stringify(mint.traits).replace(/,/g, ';') : '',
          mint.rarity_score || '',
          mint.rarity_tier || '',
        ]
        csvRows.push(row.map(v => `"${v}"`).join(','))
      }
      
      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="mints-${collectionId}.csv"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_supply: parseInt(summary.total_supply) || 0,
        total_minted: completedCount, // is_minted = true from generated_ordinals
        available: parseInt(summary.available) || 0,
        unique_minters: parseInt(summary.unique_minters) || 0,
        // Detailed mint stats for UI (using generated_ordinals.is_minted as source of truth)
        total_mints: completedCount + pendingCount, // completed + in-progress (can never exceed total_supply)
        completed: completedCount, // is_minted = true
        failed: failedCount, // unique ordinals with ONLY failed/expired mints
        pending_reveal: pendingCount, // unique ordinals in progress (is_minted=false but has active mint)
      },
      mints: mints || [],
    })
  } catch (error) {
    console.error('Error fetching mints:', error)
    return NextResponse.json({ error: 'Failed to fetch mints' }, { status: 500 })
  }
}

