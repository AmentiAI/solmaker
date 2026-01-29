import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

/**
 * GET /api/marketplace/ordinals/collection-metadata
 * Fetches collection metadata from Magic Eden API by symbol/slug
 * Also saves/updates the collection in ordinal_collections table
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol')

    if (!symbol) {
      return NextResponse.json({ error: 'Collection symbol is required' }, { status: 400 })
    }

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

    console.log(`🔍 Fetching collection metadata for: ${symbol}`)

    // Try multiple Magic Eden API endpoints for collection data
    let collectionData: any = null

    // Endpoint 1: Try /v2/ord/btc/collections/{symbol}
    try {
      const url1 = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections/${encodeURIComponent(symbol)}`
      const response1 = await fetch(url1, {
        headers,
        next: { revalidate: 300 }, // Cache for 5 minutes
      })

      if (response1.ok) {
        collectionData = await response1.json()
        console.log(`✅ Found collection data from /collections endpoint`)
      }
    } catch (e) {
      console.log(`⚠️ /collections endpoint failed, trying alternatives...`)
    }

    // Endpoint 2: Try /v2/ord/btc/collections?symbol={symbol}
    if (!collectionData) {
      try {
        const url2 = `https://api-mainnet.magiceden.dev/v2/ord/btc/collections?symbol=${encodeURIComponent(symbol)}`
        const response2 = await fetch(url2, {
          headers,
          next: { revalidate: 300 },
        })

        if (response2.ok) {
          const data2 = await response2.json()
          // If it's an array, find the matching collection
          if (Array.isArray(data2)) {
            collectionData = data2.find((c: any) => 
              c.symbol?.toLowerCase() === symbol.toLowerCase() || 
              c.slug?.toLowerCase() === symbol.toLowerCase()
            )
          } else if (data2.symbol || data2.slug) {
            collectionData = data2
          }
          if (collectionData) {
            console.log(`✅ Found collection data from /collections?symbol endpoint`)
          }
        }
      } catch (e) {
        console.log(`⚠️ /collections?symbol endpoint failed`)
      }
    }

    // Endpoint 3: Try getting from a sample token (fallback)
    if (!collectionData) {
      try {
        const url3 = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?collectionSymbol=${encodeURIComponent(symbol)}&limit=1`
        const response3 = await fetch(url3, {
          headers,
          next: { revalidate: 300 },
        })

        if (response3.ok) {
          const data3 = await response3.json()
          const tokens = Array.isArray(data3) ? data3 : (data3.tokens || [])
          if (tokens.length > 0 && tokens[0].collection) {
            collectionData = tokens[0].collection
            console.log(`✅ Found collection data from token collection field`)
          }
        }
      } catch (e) {
        console.log(`⚠️ Token collection field fallback failed`)
      }
    }

    if (!collectionData) {
      return NextResponse.json({
        success: false,
        symbol,
        message: 'Collection not found on Magic Eden',
      })
    }

    // Extract collection metadata
    const collectionSymbol = collectionData.symbol || symbol
    const metadata = {
      symbol: collectionSymbol,
      name: collectionData.name || collectionData.title || symbol,
      description: collectionData.description || collectionData.bio || null,
      image: collectionData.image || collectionData.imageURI || collectionData.logo || null,
      banner: collectionData.banner || collectionData.bannerImage || null,
      website: collectionData.website || collectionData.websiteUrl || collectionData.websiteLink || null,
      twitter: collectionData.twitter || collectionData.twitterUrl || collectionData.twitterHandle || collectionData.twitterLink || null,
      discord: collectionData.discord || collectionData.discordUrl || collectionData.discordInvite || collectionData.discordLink || null,
      telegram: collectionData.telegram || collectionData.telegramUrl || null,
      instagram: collectionData.instagram || collectionData.instagramUrl || null,
      floorPrice: collectionData.floorPrice || collectionData.floor_price || null,
      totalSupply: collectionData.totalSupply || collectionData.total_supply || collectionData.supply || null,
      volume: collectionData.volume || collectionData.totalVolume || null,
    }

    // Save/update collection in database
    try {
      await sql`
        INSERT INTO ordinal_collections (
          symbol,
          name,
          description,
          image_uri,
          chain,
          supply,
          min_inscription_number,
          max_inscription_number,
          website_link,
          twitter_link,
          discord_link,
          magic_eden_created_at
        ) VALUES (
          ${collectionSymbol},
          ${metadata.name || null},
          ${metadata.description || null},
          ${metadata.image || null},
          ${collectionData.chain || 'btc'},
          ${metadata.totalSupply || null},
          ${collectionData.min_inscription_number || null},
          ${collectionData.max_inscription_number || null},
          ${metadata.website || null},
          ${metadata.twitter || null},
          ${metadata.discord || null},
          ${collectionData.createdAt ? new Date(collectionData.createdAt) : null}
        )
        ON CONFLICT (symbol) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          image_uri = EXCLUDED.image_uri,
          chain = EXCLUDED.chain,
          supply = EXCLUDED.supply,
          min_inscription_number = EXCLUDED.min_inscription_number,
          max_inscription_number = EXCLUDED.max_inscription_number,
          website_link = EXCLUDED.website_link,
          twitter_link = EXCLUDED.twitter_link,
          discord_link = EXCLUDED.discord_link,
          magic_eden_created_at = EXCLUDED.magic_eden_created_at,
          updated_at = CURRENT_TIMESTAMP
      `
      console.log(`✅ Saved/updated collection ${collectionSymbol} in database`)
    } catch (dbError: any) {
      console.error(`⚠️ Error saving collection to database:`, dbError.message)
      // Don't fail the request if database save fails
    }

    return NextResponse.json({
      success: true,
      symbol: metadata.symbol,
      metadata,
    })

  } catch (error: any) {
    console.error('Error fetching collection metadata:', error)
    return NextResponse.json({
      error: 'Failed to fetch collection metadata',
      details: error.message
    }, { status: 500 })
  }
}
