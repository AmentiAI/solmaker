import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/marketplace/collections-eligibility - Get user's collections with eligibility status
 */
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    // Get all collections owned by the user
    const collectionsResult = await sql`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.collection_status,
        c.marketplace_listing_id,
        c.marketplace_status,
        (SELECT COUNT(*) FROM generated_ordinals WHERE collection_id = c.id) as ordinal_count,
        (SELECT COUNT(*) FROM mint_phases WHERE collection_id = c.id) as phase_count,
        (SELECT COUNT(*) FROM mint_inscriptions 
         WHERE collection_id = c.id 
           AND commit_tx_id IS NOT NULL 
           AND LENGTH(TRIM(commit_tx_id)) > 0
           AND is_test_mint = false) as minted_count,
        (SELECT compressed_image_url FROM generated_ordinals 
         WHERE collection_id = c.id 
         ORDER BY created_at ASC 
         LIMIT 1) as sample_image
      FROM collections c
      WHERE c.wallet_address = ${walletAddress}
      ORDER BY c.created_at DESC
    ` as any[]

    const collections = Array.isArray(collectionsResult) ? collectionsResult : []

    // Check eligibility for each collection
    const collectionsWithEligibility = collections.map((collection: any) => {
      const reasons: string[] = []
      let isEligible = true

      // Check if already listed
      if (collection.marketplace_listing_id) {
        isEligible = false
        reasons.push('Already listed on marketplace')
      }

      // Check collection status - cannot list self_inscribe or launchpad collections
      const collectionStatus = collection.collection_status || 'draft'
      if (collectionStatus === 'self_inscribe') {
        isEligible = false
        reasons.push('Cannot list self-inscribe collections')
      }

      if (collectionStatus === 'launchpad') {
        isEligible = false
        reasons.push('Cannot list launchpad collections')
      }

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        ordinal_count: parseInt(collection.ordinal_count || '0', 10),
        phase_count: parseInt(collection.phase_count || '0', 10),
        minted_count: parseInt(collection.minted_count || '0', 10),
        is_eligible: isEligible,
        reasons: reasons,
        already_listed: !!collection.marketplace_listing_id,
        sample_image: collection.sample_image || null,
      }
    })

    return NextResponse.json({ collections: collectionsWithEligibility })
  } catch (error: any) {
    console.error('[Marketplace Collections Eligibility] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch collections eligibility', details: error?.message },
      { status: 500 }
    )
  }
}

