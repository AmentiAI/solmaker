import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { estimateMintCost, lamportsToSol, SOLANA_BASE_FEE, RENT_EXEMPT_MINIMUM } from '@/lib/solana/cost-estimation'

// POST /api/mint/estimate-cost - Estimate minting costs for selected NFTs
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { ordinalIds, collectionId } = body

    if (!ordinalIds || !Array.isArray(ordinalIds) || ordinalIds.length === 0) {
      return NextResponse.json({ error: 'ordinalIds array is required' }, { status: 400 })
    }

    const quantity = ordinalIds.length

    // Get mint phase price if available
    let mintPriceLamports = 0
    if (collectionId) {
      const phases = await sql`
        SELECT mint_price_lamports FROM mint_phases
        WHERE collection_id = ${collectionId}::uuid AND is_active = true
        ORDER BY phase_order ASC LIMIT 1
      ` as any[]
      if (phases.length > 0 && phases[0].mint_price_lamports) {
        mintPriceLamports = parseInt(phases[0].mint_price_lamports)
      }
    }

    // Calculate costs
    const costs = estimateMintCost(quantity)
    const totalMintPrice = mintPriceLamports * quantity
    const totalCost = costs.totalLamports + totalMintPrice

    return NextResponse.json({
      estimate: {
        quantity,
        transactionFee: SOLANA_BASE_FEE,
        rentPerNft: RENT_EXEMPT_MINIMUM,
        totalRent: costs.rentLamports,
        mintPricePerNft: mintPriceLamports,
        totalMintPrice,
        totalCostLamports: totalCost,
        totalCostSol: lamportsToSol(totalCost),
      },
    })
  } catch (error) {
    console.error('Error estimating mint cost:', error)
    return NextResponse.json({
      error: 'Failed to estimate cost',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
