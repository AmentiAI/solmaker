import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Filters
    const status = searchParams.get('status') || 'active'
    const collection = searchParams.get('collection')
    const priceMin = searchParams.get('priceMin')
    const priceMax = searchParams.get('priceMax')
    const search = searchParams.get('search')
    const sortBy = searchParams.get('sortBy') || 'recent'

    // Pagination
    const offset = parseInt(searchParams.get('offset') || '0')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Build query
    let whereConditions: string[] = []
    let params: any[] = []
    let paramIndex = 1

    // Status filter
    whereConditions.push(`status = $${paramIndex}`)
    params.push(status)
    paramIndex++

    // Collection filter
    if (collection) {
      whereConditions.push(`metadata->>'collection'->>'key' = $${paramIndex}`)
      params.push(collection)
      paramIndex++
    }

    // Price range filter
    if (priceMin) {
      whereConditions.push(`price_lamports >= $${paramIndex}`)
      params.push(parseInt(priceMin))
      paramIndex++
    }

    if (priceMax) {
      whereConditions.push(`price_lamports <= $${paramIndex}`)
      params.push(parseInt(priceMax))
      paramIndex++
    }

    // Search filter
    if (search) {
      whereConditions.push(`(
        title ILIKE $${paramIndex}
        OR description ILIKE $${paramIndex}
        OR mint_address ILIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // Sort clause
    let orderClause = ''
    switch (sortBy) {
      case 'price_low':
        orderClause = 'ORDER BY price_lamports ASC'
        break
      case 'price_high':
        orderClause = 'ORDER BY price_lamports DESC'
        break
      case 'recent':
      default:
        orderClause = 'ORDER BY created_at DESC'
        break
    }

    // Get total count
    const countResult = await sql.unsafe(`
      SELECT COUNT(*) as total
      FROM nft_listings
      ${whereClause}
    `, params)

    const total = parseInt(countResult[0].total)

    // Get listings
    const listings = await sql.unsafe(`
      SELECT
        id,
        mint_address,
        seller_wallet,
        price_lamports,
        price_sol,
        title,
        description,
        image_url,
        metadata,
        status,
        created_at,
        platform_fee_lamports
      FROM nft_listings
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset])

    return NextResponse.json({
      success: true,
      listings,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error in GET /api/marketplace/solana/listings:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
