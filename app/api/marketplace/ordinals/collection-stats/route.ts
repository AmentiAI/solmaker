import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/marketplace/ordinals/collection-stats
 * Fetches collection statistics including sales, volume, and metadata
 */
export async function GET(req: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const collection_symbol = searchParams.get('symbol')

    if (!collection_symbol) {
      return NextResponse.json({ error: 'collection symbol is required' }, { status: 400 })
    }

    // Get collection stats from ordinal_listings
    const statsResult = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active')::int as active_listings,
        COUNT(*) FILTER (WHERE status = 'sold')::int as total_sales,
        COALESCE(SUM(price_sats) FILTER (WHERE status = 'sold'), 0)::bigint as total_volume_sats,
        COALESCE(MIN(price_sats) FILTER (WHERE status = 'active'), 0)::bigint as floor_price_sats,
        COALESCE(MAX(image_url) FILTER (WHERE image_url IS NOT NULL), NULL) as sample_image,
        COALESCE(MAX(created_at) FILTER (WHERE status = 'active'), NULL) as last_listed_at
      FROM ordinal_listings
      WHERE collection_symbol = ${collection_symbol}
    ` as any[]

    const stats = statsResult[0] || {
      active_listings: 0,
      total_sales: 0,
      total_volume_sats: 0,
      floor_price_sats: 0,
      sample_image: null,
      last_listed_at: null,
    }

    // Get recent sales (last 30 days)
    const recentSalesResult = await sql`
      SELECT 
        COUNT(*)::int as recent_sales,
        COALESCE(SUM(price_sats), 0)::bigint as recent_volume_sats
      FROM ordinal_listings
      WHERE collection_symbol = ${collection_symbol}
        AND status = 'sold'
        AND sold_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    ` as any[]

    const recentSales = recentSalesResult[0] || {
      recent_sales: 0,
      recent_volume_sats: 0,
    }

    // Get average sale price
    const avgPriceResult = await sql`
      SELECT 
        COALESCE(AVG(price_sats), 0)::bigint as avg_sale_price_sats
      FROM ordinal_listings
      WHERE collection_symbol = ${collection_symbol}
        AND status = 'sold'
    ` as any[]

    const avgSalePrice = avgPriceResult[0]?.avg_sale_price_sats || 0

    // Fetch collection metadata from Magic Eden
    let collectionMetadata: any = null
    try {
      const apiKey = process.env.MAGIC_EDEN_API_KEY
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'OrdMaker/1.0',
      }
      if (apiKey) {
        headers['X-API-Key'] = apiKey
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      // Try Magic Eden collection endpoints
      const endpoints = [
        `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${encodeURIComponent(collection_symbol)}`,
        `https://api-mainnet.magiceden.dev/v2/ord/btc/collections?symbol=${encodeURIComponent(collection_symbol)}`,
      ]

      for (const url of endpoints) {
        try {
          const response = await fetch(url, {
            headers,
            next: { revalidate: 300 },
          })
          if (response.ok) {
            const data = await response.json()
            if (Array.isArray(data)) {
              collectionMetadata = data.find((c: any) => 
                c.symbol?.toLowerCase() === collection_symbol.toLowerCase()
              )
            } else if (data.symbol || data.slug) {
              collectionMetadata = data
            }
            if (collectionMetadata) break
          }
        } catch (e) {
          continue
        }
      }

      // Extract metadata if found
      if (collectionMetadata) {
        collectionMetadata = {
          name: collectionMetadata.name || collectionMetadata.title || collection_symbol,
          description: collectionMetadata.description || collectionMetadata.bio || null,
          image: collectionMetadata.image || collectionMetadata.imageURI || collectionMetadata.logo || null,
          banner: collectionMetadata.banner || collectionMetadata.bannerImage || null,
          website: collectionMetadata.website || collectionMetadata.websiteUrl || null,
          twitter: collectionMetadata.twitter || collectionMetadata.twitterUrl || collectionMetadata.twitterHandle || null,
          discord: collectionMetadata.discord || collectionMetadata.discordUrl || collectionMetadata.discordInvite || null,
          telegram: collectionMetadata.telegram || collectionMetadata.telegramUrl || null,
          instagram: collectionMetadata.instagram || collectionMetadata.instagramUrl || null,
        }
      }
    } catch (e) {
      console.log('Failed to fetch Magic Eden metadata, using fallback')
    }

    // Prioritize Magic Eden collection image, fallback to sample ordinal image
    const collectionImage = collectionMetadata?.image || collectionMetadata?.banner || null
    const sampleImageResult = await sql`
      SELECT image_url
      FROM ordinal_listings
      WHERE collection_symbol = ${collection_symbol}
        AND image_url IS NOT NULL
        AND image_url != ''
      ORDER BY created_at DESC
      LIMIT 1
    ` as any[]
    const sampleImage = sampleImageResult[0]?.image_url || stats.sample_image || null

    return NextResponse.json({
      success: true,
      collection_symbol,
      stats: {
        active_listings: stats.active_listings,
        total_sales: stats.total_sales,
        total_volume_sats: stats.total_volume_sats,
        total_volume_btc: (stats.total_volume_sats / 100000000).toFixed(8),
        floor_price_sats: stats.floor_price_sats,
        floor_price_btc: (stats.floor_price_sats / 100000000).toFixed(8),
        avg_sale_price_sats: avgSalePrice,
        avg_sale_price_btc: (avgSalePrice / 100000000).toFixed(8),
        recent_sales_30d: recentSales.recent_sales,
        recent_volume_sats_30d: recentSales.recent_volume_sats,
        recent_volume_btc_30d: (recentSales.recent_volume_sats / 100000000).toFixed(8),
        collection_image: collectionImage || sampleImage, // Use Magic Eden image first
        last_listed_at: stats.last_listed_at,
      },
      metadata: collectionMetadata ? {
        name: collectionMetadata.name,
        description: collectionMetadata.description,
        website: collectionMetadata.website,
        twitter: collectionMetadata.twitter,
        discord: collectionMetadata.discord,
        telegram: collectionMetadata.telegram,
        instagram: collectionMetadata.instagram,
      } : null,
    })

  } catch (error: any) {
    console.error('Error fetching collection stats:', error)
    return NextResponse.json({
      error: 'Failed to fetch collection stats',
      details: error.message
    }, { status: 500 })
  }
}
