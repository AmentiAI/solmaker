import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { buildCollectionNftTransaction } from '@/lib/solana/collection-nft'
import { buildCollectionMetadata } from '@/lib/solana/metadata-builder'
import { uploadMetadata } from '@/lib/solana/storage'

/**
 * POST /api/collections/[id]/deploy/create-collection-nft
 * Step 2: Create the Collection NFT on-chain
 * Returns transaction for user to sign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { wallet_address } = body

    // Verify collection exists and user owns it or is a collaborator
    const collections = await sql`
      SELECT * FROM collections
      WHERE id = ${collectionId}::uuid
    ` as any[]

    if (!collections.length) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collection = collections[0]
    const isOwner = collection.wallet_address === wallet_address

    // Check if user is a collaborator with editor/owner role
    let isCollaborator = false
    if (!isOwner) {
      const collaboratorResult = await sql`
        SELECT role FROM collection_collaborators
        WHERE collection_id = ${collectionId}::uuid
          AND wallet_address = ${wallet_address.trim()}
          AND status = 'accepted'
          AND role IN ('owner', 'editor')
      ` as any[]
      isCollaborator = Array.isArray(collaboratorResult) && collaboratorResult.length > 0
    }

    // User must be owner or collaborator
    if (!isOwner && !isCollaborator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check metadata is uploaded
    if (!collection.metadata_uploaded) {
      return NextResponse.json({ 
        error: 'Upload metadata first',
        message: 'Complete metadata upload before creating collection NFT'
      }, { status: 400 })
    }

    // Check if already created
    if (collection.collection_mint_address) {
      return NextResponse.json({
        error: 'Collection NFT already exists',
        collectionMint: collection.collection_mint_address,
      }, { status: 400 })
    }

    // Update status
    await sql`
      UPDATE collections 
      SET deployment_status = 'deploying_collection_nft'
      WHERE id = ${collectionId}::uuid
    `

    // Build collection metadata
    const collectionMetadata = buildCollectionMetadata({
      name: collection.name,
      symbol: collection.symbol || collection.name.substring(0, 10).toUpperCase(),
      description: collection.description || `${collection.name} Collection`,
      imageUri: collection.banner_image_url || collection.image_url || '',
      externalUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/collections/${collectionId}`,
      sellerFeeBasisPoints: collection.royalty_percentage ? collection.royalty_percentage * 100 : 500,
      creators: [{
        address: wallet_address,
        share: 100,
      }],
    })

    // Upload collection metadata
    console.log('📤 Uploading collection metadata...')
    const metadataResult = await uploadMetadata(
      collectionMetadata,
      `collection-${collectionId}`,
      'vercel-blob'
    )

    // Build Core Collection transaction
    console.log('🏗️ Building Core Collection transaction...')
    const result = await buildCollectionNftTransaction({
      name: collection.name,
      uri: metadataResult.uri,
      royaltyBasisPoints: collection.royalty_percentage ? collection.royalty_percentage * 100 : 500,
      authority: wallet_address,
      creators: [{
        address: wallet_address,
        share: 100,
      }],
    })

    // Log deployment step
    await sql`
      INSERT INTO candy_machine_deployments (
        collection_id,
        step,
        status,
        step_data
      ) VALUES (
        ${collectionId}::uuid,
        'create_collection_nft',
        'pending',
        ${JSON.stringify({
          collectionMint: result.collectionMint,
          metadataUri: metadataResult.uri,
        })}::jsonb
      )
    `

    return NextResponse.json({
      success: true,
      collectionMint: result.collectionMint,
      transaction: result.transaction,
      signerSecretKey: result.signerSecretKey,
      message: 'Sign this transaction in your wallet to create the collection NFT',
    })

  } catch (error: any) {
    console.error('[Create Collection NFT] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to create collection NFT transaction',
      details: error.toString()
    }, { status: 500 })
  }
}

/**
 * PUT /api/collections/[id]/deploy/create-collection-nft
 * Confirm collection NFT creation after user signs
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { collection_mint_address, tx_signature, wallet_address } = body

    if (!collection_mint_address || !tx_signature) {
      return NextResponse.json({ 
        error: 'collection_mint_address and tx_signature required' 
      }, { status: 400 })
    }

    // Update collection
    await sql`
      UPDATE collections
      SET 
        collection_mint_address = ${collection_mint_address},
        deployment_status = 'deploying_candy_machine'
      WHERE id = ${collectionId}::uuid
    `

    // Update deployment log
    await sql`
      UPDATE candy_machine_deployments
      SET 
        status = 'completed',
        tx_signature = ${tx_signature},
        completed_at = NOW()
      WHERE collection_id = ${collectionId}::uuid
      AND step = 'create_collection_nft'
      AND status = 'pending'
    `

    console.log('✅ Collection NFT created:', collection_mint_address)

    return NextResponse.json({
      success: true,
      collectionMint: collection_mint_address,
      txSignature: tx_signature,
      message: 'Collection NFT created successfully',
    })

  } catch (error: any) {
    console.error('[Confirm Collection NFT] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to confirm collection NFT',
    }, { status: 500 })
  }
}
