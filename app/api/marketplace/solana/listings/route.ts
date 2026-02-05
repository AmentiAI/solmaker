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

    // Build WHERE conditions
    const whereConditions: any[] = []

    // Status filter
    whereConditions.push(sql`status = ${status}`)

    // Collection filter
    if (collection) {
      whereConditions.push(sql`metadata->'collection'->>'key' = ${collection}`)
    }

    // Price range filter
    if (priceMin) {
      whereConditions.push(sql`price_lamports >= ${parseInt(priceMin)}`)
    }

    if (priceMax) {
      whereConditions.push(sql`price_lamports <= ${parseInt(priceMax)}`)
    }

    // Search filter
    if (search) {
      const searchPattern = `%${search}%`
      whereConditions.push(sql`(
        title ILIKE ${searchPattern}
        OR description ILIKE ${searchPattern}
        OR mint_address ILIKE ${searchPattern}
      )`)
    }

    // Build WHERE clause
    let whereClause = sql``
    if (whereConditions.length > 0) {
      whereClause = sql`WHERE ${whereConditions[0]}`
      for (let i = 1; i < whereConditions.length; i++) {
        whereClause = sql`${whereClause} AND ${whereConditions[i]}`
      }
    }

    // Build ORDER BY clause
    let orderClause = sql``
    switch (sortBy) {
      case 'price_low':
        orderClause = sql`ORDER BY price_lamports ASC`
        break
      case 'price_high':
        orderClause = sql`ORDER BY price_lamports DESC`
        break
      case 'recent':
      default:
        orderClause = sql`ORDER BY created_at DESC`
        break
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM nft_listings
      ${whereClause}
    `

    const total = countResult && countResult[0] ? parseInt(countResult[0].total) : 0

    // Get listings
    const listings = await sql`
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
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({
      success: true,
      listings: listings || [],
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
