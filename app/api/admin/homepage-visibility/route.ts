import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database';

// Ensure hidden_from_homepage column exists for both tables
async function ensureColumnsExist() {
  if (!sql) return
  
  try {
    // Ensure generated_ordinals column exists
    await sql`
      ALTER TABLE generated_ordinals 
      ADD COLUMN IF NOT EXISTS hidden_from_homepage BOOLEAN DEFAULT FALSE
    `
    
    // Ensure collections column exists
    await sql`
      ALTER TABLE collections 
      ADD COLUMN IF NOT EXISTS hidden_from_homepage BOOLEAN DEFAULT FALSE
    `

    // Ensure collections force_show_on_homepage_ticker exists
    await sql`
      ALTER TABLE collections
      ADD COLUMN IF NOT EXISTS force_show_on_homepage_ticker BOOLEAN DEFAULT FALSE
    `
    
    console.log('[Homepage Visibility] Ensured columns exist')
  } catch (error) {
    console.error('[Homepage Visibility] Error ensuring columns exist:', error)
  }
}

// GET - List ordinals with their visibility status
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const collectionId = searchParams.get('collection_id')
    const hiddenOnly = searchParams.get('hidden_only') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const authResult = await checkAuthorizationServer(walletAddress, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    await ensureColumnsExist()

    let query = sql`
      SELECT 
        go.id,
        go.collection_id,
        go.ordinal_number,
        go.image_url,
        go.thumbnail_url,
        go.hidden_from_homepage,
        c.name as collection_name,
        c.hidden_from_homepage as collection_hidden
      FROM generated_ordinals go
      INNER JOIN collections c ON go.collection_id = c.id
      WHERE go.image_url IS NOT NULL
        AND go.image_url != ''
    `

    if (collectionId) {
      query = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.thumbnail_url,
          go.hidden_from_homepage,
          c.name as collection_name,
          c.hidden_from_homepage as collection_hidden
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.image_url IS NOT NULL
          AND go.image_url != ''
          AND go.collection_id = ${collectionId}
      `
    }

    if (hiddenOnly) {
      query = sql`
        SELECT 
          go.id,
          go.collection_id,
          go.ordinal_number,
          go.image_url,
          go.thumbnail_url,
          go.hidden_from_homepage,
          c.name as collection_name,
          c.hidden_from_homepage as collection_hidden
        FROM generated_ordinals go
        INNER JOIN collections c ON go.collection_id = c.id
        WHERE go.image_url IS NOT NULL
          AND go.image_url != ''
          AND (go.hidden_from_homepage = TRUE OR c.hidden_from_homepage = TRUE OR (go.hidden_from_homepage IS NULL AND FALSE))
      `
      if (collectionId) {
        query = sql`
          SELECT 
            go.id,
            go.collection_id,
            go.ordinal_number,
            go.image_url,
            go.thumbnail_url,
            go.hidden_from_homepage,
            c.name as collection_name,
            c.hidden_from_homepage as collection_hidden
          FROM generated_ordinals go
          INNER JOIN collections c ON go.collection_id = c.id
          WHERE go.image_url IS NOT NULL
            AND go.image_url != ''
            AND go.collection_id = ${collectionId}
            AND (go.hidden_from_homepage = TRUE OR c.hidden_from_homepage = TRUE OR (go.hidden_from_homepage IS NULL AND FALSE))
        `
      }
    }

    const ordinals = await sql`
      ${query}
      ORDER BY go.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    ` as any[]

    // Get total count
    let countQuery = sql`
      SELECT COUNT(*) as total
      FROM generated_ordinals go
      WHERE go.image_url IS NOT NULL
        AND go.image_url != ''
    `
    
    if (collectionId) {
      countQuery = sql`
        SELECT COUNT(*) as total
        FROM generated_ordinals go
        WHERE go.image_url IS NOT NULL
          AND go.image_url != ''
          AND go.collection_id = ${collectionId}
      `
    }
    
    if (hiddenOnly) {
      countQuery = sql`
        SELECT COUNT(*) as total
        FROM generated_ordinals go
        WHERE go.image_url IS NOT NULL
          AND go.image_url != ''
          AND (go.hidden_from_homepage = TRUE OR go.hidden_from_homepage IS NULL AND FALSE)
      `
      if (collectionId) {
        countQuery = sql`
          SELECT COUNT(*) as total
          FROM generated_ordinals go
          WHERE go.image_url IS NOT NULL
            AND go.image_url != ''
            AND go.collection_id = ${collectionId}
            AND (go.hidden_from_homepage = TRUE OR go.hidden_from_homepage IS NULL AND FALSE)
        `
      }
    }

    const countResult = await countQuery as any[]
    const total = Array.isArray(countResult) && countResult[0] ? parseInt(countResult[0].total) : 0
    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      ordinals: Array.isArray(ordinals) ? ordinals : [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    })
  } catch (error: any) {
    console.error('[Homepage Visibility API] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch ordinals',
      details: error?.message 
    }, { status: 500 })
  }
}

// POST/PATCH - Toggle visibility status for ordinals or collections
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, ordinal_ids, collection_ids, hidden, ticker_enabled } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }
    const postAuthResult = await checkAuthorizationServer(wallet_address, sql)
    if (!postAuthResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const hasHidden = typeof hidden === 'boolean'
    const hasTickerEnabled = typeof ticker_enabled === 'boolean'
    if (!hasHidden && !hasTickerEnabled) {
      return NextResponse.json({ error: 'hidden boolean or ticker_enabled boolean is required' }, { status: 400 })
    }

    await ensureColumnsExist()

    // Handle collection visibility
    if (Array.isArray(collection_ids) && collection_ids.length > 0) {
      if (hasTickerEnabled) {
        const result = await sql`
          UPDATE collections
          SET force_show_on_homepage_ticker = ${ticker_enabled}
          WHERE id = ANY(${collection_ids})
        `
        const updatedCount = Array.isArray(result) ? result.length : 0
        return NextResponse.json({
          success: true,
          updated_count: updatedCount,
          message: `Updated ${updatedCount} collection(s) to ${ticker_enabled ? 'included' : 'not included'} in homepage ticker`,
        })
      }

      const result = await sql`
        UPDATE collections
        SET hidden_from_homepage = ${hidden}
        WHERE id = ANY(${collection_ids})
      `
      const updatedCount = Array.isArray(result) ? result.length : 0
      return NextResponse.json({
        success: true,
        updated_count: updatedCount,
        message: `Updated ${updatedCount} collection(s) to ${hidden ? 'hidden' : 'visible'} on homepage`,
      })
    }

    // Handle ordinal visibility
    if (Array.isArray(ordinal_ids) && ordinal_ids.length > 0) {
      const result = await sql`
        UPDATE generated_ordinals
        SET hidden_from_homepage = ${hidden}
        WHERE id = ANY(${ordinal_ids})
      `
      const updatedCount = Array.isArray(result) ? result.length : 0
      return NextResponse.json({
        success: true,
        updated_count: updatedCount,
        message: `Updated ${updatedCount} ordinal(s) to ${hidden ? 'hidden' : 'visible'} on homepage`,
      })
    }

    return NextResponse.json({ error: 'Either ordinal_ids or collection_ids array is required' }, { status: 400 })
  } catch (error: any) {
    console.error('[Homepage Visibility API] Error updating visibility:', error)
    return NextResponse.json({ 
      error: 'Failed to update visibility',
      details: error?.message 
    }, { status: 500 })
  }
}
