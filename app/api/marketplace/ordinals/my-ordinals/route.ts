import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/marketplace/ordinals/my-ordinals
 * Fetches ordinals owned by a wallet from Magic Eden API with pagination
 * 
 * Query params:
 * - wallet: The wallet address (required)
 * - limit: Number of items per page (default: 40, max: 100)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort order (default: inscriptionNumberDesc)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const wallet = searchParams.get('wallet')
    const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const sortBy = searchParams.get('sortBy') || 'inscriptionNumberDesc'

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
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

    console.log(`🔍 Fetching ordinals for wallet: ${wallet} (limit: ${limit}, offset: ${offset}, sortBy: ${sortBy})`)

    // Fetch user's ordinals from Magic Eden with pagination
    // API endpoint: GET /v2/ord/btc/tokens?ownerAddress={wallet}
    const params = new URLSearchParams({
      ownerAddress: wallet,
      showAll: 'true',
      limit: limit.toString(),
      offset: offset.toString(),
      sortBy: sortBy,
    })

    const url = `https://api-mainnet.magiceden.dev/v2/ord/btc/tokens?${params.toString()}`

    const response = await fetch(url, {
      headers,
      next: { revalidate: 30 }, // Cache for 30 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Magic Eden API error: ${response.status} - ${errorText}`)
      return NextResponse.json({
        error: `Failed to fetch ordinals from Magic Eden: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()

    // Handle different response formats
    let tokens: any[] = []
    if (Array.isArray(data)) {
      tokens = data
    } else if (data.tokens && Array.isArray(data.tokens)) {
      tokens = data.tokens
    } else if (data.items && Array.isArray(data.items)) {
      tokens = data.items
    }

    console.log(`✅ Found ${tokens.length} total tokens from Magic Eden`)

    // Transform tokens into our format with UTXO info
    const ordinals = tokens.map((token: any) => {
      // Extract UTXO info from location field
      // Magic Eden format: "txid:vout" or "txid:vout:value"
      let utxoTxid: string | null = null
      let utxoVout: number | null = null
      let utxoValue: number = 330 // Default ordinal dust amount

      // Try location field (preferred)
      if (token.location) {
        const parts = token.location.split(':')
        if (parts.length >= 2) {
          utxoTxid = parts[0]
          utxoVout = parseInt(parts[1], 10)
          if (parts[2]) {
            utxoValue = parseInt(parts[2], 10)
          }
        }
      }

      // Try output field (alternative)
      if (!utxoTxid && token.output) {
        const parts = token.output.split(':')
        if (parts.length >= 2) {
          utxoTxid = parts[0]
          utxoVout = parseInt(parts[1], 10)
        }
      }

      // Try outputValue for value
      if (token.outputValue && typeof token.outputValue === 'number') {
        utxoValue = token.outputValue
      }

      // Extract image URL - try multiple fields
      let imageUrl = null
      if (token.contentURI) {
        imageUrl = token.contentURI
      } else if (token.content_url) {
        imageUrl = token.content_url
      } else if (token.imageURI) {
        imageUrl = token.imageURI
      }

      return {
        inscription_id: token.id || token.inscriptionId,
        inscription_number: token.inscriptionNumber || token.number || token.inscriptionNum,
        collection_symbol: token.collectionSymbol || token.collection,
        content_url: imageUrl,
        content_type: token.contentType || token.content_type,
        image_url: imageUrl,
        metadata_url: token.meta?.name ? undefined : token.meta,
        owner: token.owner || token.ownerAddress || wallet,
        utxo: {
          txid: utxoTxid,
          vout: utxoVout,
          value: utxoValue,
        },
        // Include raw data for debugging
        raw: token,
      }
    })

    console.log(`✅ Found ${ordinals.length} ordinals for ${wallet} (offset: ${offset})`)

    // Check if there might be more items (Magic Eden returns up to limit items)
    const hasMore = ordinals.length === limit

    return NextResponse.json({
      success: true,
      wallet,
      count: ordinals.length,
      ordinals,
      pagination: {
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
    })

  } catch (error: any) {
    console.error('Error fetching ordinals:', error)
    return NextResponse.json({
      error: 'Failed to fetch ordinals',
      details: error.message
    }, { status: 500 })
  }
}
