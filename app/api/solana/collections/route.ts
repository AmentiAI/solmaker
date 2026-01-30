import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    // Fetch Solana collections from database
    const collections = await sql`
      SELECT * FROM solana_collections
      ORDER BY created_at DESC
    `

    return NextResponse.json(collections || [])
  } catch (error) {
    console.error('Error fetching Solana collections:', error)
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()

    const {
      name,
      description,
      image_url,
      total_supply,
      mint_price,
      wallet_address,
      metadata
    } = body

    // Validate required fields
    if (!name || !total_supply || !mint_price || !wallet_address) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Insert new collection
    const collection = await sql`
      INSERT INTO solana_collections (
        name,
        description,
        image_url,
        total_supply,
        mint_price,
        wallet_address,
        metadata,
        deployment_status,
        is_live,
        minted_count
      ) VALUES (
        ${name},
        ${description},
        ${image_url},
        ${total_supply},
        ${mint_price},
        ${wallet_address},
        ${metadata ? JSON.stringify(metadata) : null},
        'pending',
        false,
        0
      )
      RETURNING *
    `

    return NextResponse.json(collection[0], { status: 201 })
  } catch (error) {
    console.error('Error creating Solana collection:', error)
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 })
  }
}
