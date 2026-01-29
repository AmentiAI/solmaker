import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'

// POST /api/mint/create-nft - Create NFT mint transaction for user to sign
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { wallet_address, collection_id, ordinal_ids, phase_id } = body

    if (!wallet_address || !collection_id) {
      return NextResponse.json({ error: 'wallet_address and collection_id are required' }, { status: 400 })
    }

    // Verify collection exists
    const collections = await sql`
      SELECT id, name, wallet_address, collection_status, candy_machine_address
      FROM collections WHERE id = ${collection_id}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]

    // Create mint session
    const sessions = await sql`
      INSERT INTO mint_sessions (collection_id, wallet_address, status, session_data)
      VALUES (${collection_id}::uuid, ${wallet_address}, 'pending', ${JSON.stringify({
        ordinal_ids: ordinal_ids || [],
        phase_id,
        created_at: new Date().toISOString(),
      })}::jsonb)
      RETURNING id
    ` as any[]

    const sessionId = sessions[0].id

    // If ordinal_ids provided, create mint_nft records
    if (ordinal_ids && ordinal_ids.length > 0) {
      for (const ordinalId of ordinal_ids) {
        await sql`
          INSERT INTO mint_nfts (session_id, collection_id, ordinal_id, wallet_address, phase_id, mint_status)
          VALUES (${sessionId}::uuid, ${collection_id}::uuid, ${ordinalId}::uuid, ${wallet_address}, ${phase_id || null}::uuid, 'pending')
        `
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Mint session created. Ready for NFT minting.',
      // The frontend will use Metaplex/Candy Machine to create and sign the transaction
      collectionMint: collection.candy_machine_address || null,
    })
  } catch (error: any) {
    console.error('[Create NFT] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create NFT mint' }, { status: 500 })
  }
}
