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

    // Get all confirmed mints from solana_nft_mints (source of truth)
    // Join to generated_ordinals for image/trait data and mint_phases for phase name
    const mints = await sql`
      SELECT
        go.id as ordinal_id,
        go.ordinal_number,
        go.traits,
        go.image_url,
        go.rarity_score,
        go.rarity_tier,
        go.inscription_id,
        sm.minter_wallet,
        sm.nft_mint_address,
        sm.mint_tx_signature,
        sm.mint_status,
        sm.mint_price_lamports,
        sm.platform_fee_lamports,
        sm.total_paid_lamports,
        sm.confirmed_at,
        sm.created_at as mint_created_at,
        mp.phase_name
      FROM solana_nft_mints sm
      JOIN generated_ordinals go ON sm.ordinal_id = go.id
      LEFT JOIN mint_phases mp ON sm.phase_id = mp.id
      WHERE sm.collection_id = ${collectionId}::uuid
        AND sm.mint_status = 'confirmed'
      ORDER BY sm.confirmed_at ASC NULLS LAST, sm.created_at ASC
    ` as any[]

    // Get summary stats from solana_nft_mints (source of truth)
    const stats = await sql`
      SELECT
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId}) as total_supply,
        (SELECT COUNT(*) FROM solana_nft_mints WHERE collection_id = ${collectionId}::uuid AND mint_status = 'confirmed') as completed,
        (
          (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = ${collectionId})
          -
          (SELECT COUNT(*) FROM solana_nft_mints WHERE collection_id = ${collectionId}::uuid AND mint_status NOT IN ('failed', 'cancelled'))
        ) as available,
        (SELECT COUNT(DISTINCT minter_wallet) FROM solana_nft_mints WHERE collection_id = ${collectionId}::uuid AND mint_status = 'confirmed') as unique_minters
    ` as any[]

    // Get in-flight count (pending, awaiting_signature, broadcasting, confirming)
    const pendingResult = await sql`
      SELECT COUNT(*) as count
      FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
        AND mint_status NOT IN ('confirmed', 'failed', 'cancelled')
    ` as any[]

    // Get failed count
    const failedResult = await sql`
      SELECT COUNT(*) as count
      FROM solana_nft_mints
      WHERE collection_id = ${collectionId}::uuid
        AND mint_status = 'failed'
    ` as any[]

    const summary = stats[0] || { total_supply: 0, completed: 0, available: 0, unique_minters: 0 }
    const completedCount = parseInt(summary.completed) || 0
    const pendingCount = parseInt(pendingResult[0]?.count) || 0
    const failedCount = parseInt(failedResult[0]?.count) || 0

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ordinal_number',
        'minter_wallet',
        'nft_mint_address',
        'mint_tx_signature',
        'mint_status',
        'phase_name',
        'mint_price_lamports',
        'platform_fee_lamports',
        'confirmed_at',
        'traits',
        'rarity_score',
        'rarity_tier',
      ]

      const csvRows = [headers.join(',')]
      for (const mint of mints) {
        const row = [
          mint.ordinal_number || '',
          mint.minter_wallet || '',
          mint.nft_mint_address || '',
          mint.mint_tx_signature || '',
          mint.mint_status || '',
          mint.phase_name || '',
          mint.mint_price_lamports || '',
          mint.platform_fee_lamports || '',
          mint.confirmed_at || '',
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
        total_minted: completedCount,
        available: parseInt(summary.available) || 0,
        unique_minters: parseInt(summary.unique_minters) || 0,
        total_mints: completedCount + pendingCount,
        completed: completedCount,
        failed: failedCount,
        in_flight: pendingCount,
      },
      mints: mints || [],
    })
  } catch (error) {
    console.error('Error fetching mints:', error)
    return NextResponse.json({ error: 'Failed to fetch mints' }, { status: 500 })
  }
}

