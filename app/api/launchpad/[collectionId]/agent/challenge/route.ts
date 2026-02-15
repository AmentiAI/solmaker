import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { createAgentChallenge } from '@/lib/solana/agent-signer'

/**
 * GET /api/launchpad/[collectionId]/agent/challenge?wallet_address=xxx
 * Returns a time-limited HMAC challenge for agent minting.
 * The agent submits this challenge + timestamp to /mint/build.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { collectionId } = await params
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'wallet_address query parameter required' }, { status: 400 })
    }

    // Verify collection exists, is agent-mintable, and is live
    const collections = await sql`
      SELECT id, name, mint_type, collection_status, candy_machine_address
      FROM collections
      WHERE id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]

    if (collection.mint_type !== 'agent_only' && collection.mint_type !== 'agent_and_human') {
      return NextResponse.json({ error: 'This collection does not support agent minting' }, { status: 400 })
    }

    if (collection.collection_status !== 'launchpad_live') {
      return NextResponse.json({ error: 'Collection is not live for minting' }, { status: 400 })
    }

    if (!collection.candy_machine_address) {
      return NextResponse.json({ error: 'Collection has not been deployed yet' }, { status: 400 })
    }

    // Create challenge
    const { challenge, timestamp, expires_at } = createAgentChallenge(walletAddress, collectionId)

    return NextResponse.json({
      challenge,
      timestamp,
      expires_at,
      collection_id: collectionId,
      wallet_address: walletAddress,
    })

  } catch (error: any) {
    console.error('[Agent Challenge] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create challenge' }, { status: 500 })
  }
}
