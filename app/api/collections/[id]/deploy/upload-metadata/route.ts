import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { uploadCollectionAssets } from '@/lib/solana/storage'
import { buildNftMetadata, convertOrdinalAttributesToMetadata } from '@/lib/solana/metadata-builder'

/**
 * POST /api/collections/[id]/deploy/upload-metadata
 * Upload all NFT images and metadata to storage
 * This is step 1 of Candy Machine deployment
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

    // Check if already uploaded - if so, return existing metadata
    if (collection.metadata_uploaded) {
      console.log('📦 Metadata already uploaded, returning existing URIs...')
      
      // Get existing metadata URIs
      const existingUris = await sql`
        SELECT metadata_uri
        FROM nft_metadata_uris
        WHERE collection_id = ${collectionId}::uuid
        ORDER BY nft_number
      ` as any[]

      if (existingUris.length > 0) {
        return NextResponse.json({
          success: true,
          message: `Using existing metadata (${existingUris.length} NFTs already uploaded)`,
          count: existingUris.length,
          metadataUris: existingUris.map(u => u.metadata_uri),
          alreadyUploaded: true,
        })
      }
      
      // If metadata_uploaded is true but no URIs found, continue with upload
      console.log('⚠️  metadata_uploaded is true but no URIs found, proceeding with upload...')
    }

    // Update status
    await sql`
      UPDATE collections 
      SET deployment_status = 'uploading_metadata'
      WHERE id = ${collectionId}::uuid
    `

    // Get all generated ordinals for this collection
    const ordinals = await sql`
      SELECT 
        id,
        image_url,
        compressed_image_url,
        art_settings,
        attributes
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}::uuid
      ORDER BY created_at
    ` as any[]

    if (!ordinals.length) {
      return NextResponse.json({ 
        error: 'No NFTs found in collection',
        message: 'Generate NFTs first before deploying'
      }, { status: 400 })
    }

    console.log(`📤 Uploading metadata for ${ordinals.length} NFTs...`)

    // Prepare NFT data for upload
    const nftsToUpload = []
    
    for (let i = 0; i < ordinals.length; i++) {
      const ordinal = ordinals[i]
      const imageUrl = ordinal.compressed_image_url || ordinal.image_url

      // Fetch image data
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image for ordinal ${ordinal.id}`)
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

      // Build metadata
      const attributes = convertOrdinalAttributesToMetadata(ordinal.attributes || {})
      const metadata = buildNftMetadata({
        name: `${collection.name} #${i + 1}`,
        symbol: collection.symbol || collection.name.substring(0, 10).toUpperCase(),
        description: collection.description || `NFT #${i + 1} from ${collection.name}`,
        imageUri: '', // Will be filled after upload
        attributes,
        sellerFeeBasisPoints: collection.royalty_percentage ? collection.royalty_percentage * 100 : 500,
        collectionName: collection.name,
        collectionFamily: collection.name,
        creators: [{
          address: wallet_address,
          share: 100,
        }],
      })

      nftsToUpload.push({
        id: ordinal.id,
        name: `${collection.name} #${i + 1}`,
        imageData: imageBuffer,
        metadata,
        nftNumber: i + 1,
      })
    }

    // Upload all assets with structured paths for short metadata URIs
    console.log('📦 Uploading to storage...')
    const uploadResults = await uploadCollectionAssets({
      nfts: nftsToUpload,
      collectionId,
      provider: 'vercel-blob',
    })

    // Save metadata URIs to database
    console.log('💾 Saving metadata URIs...')
    for (const result of uploadResults) {
      const ordinal = ordinals.find(o => o.id === result.nftId)
      if (!ordinal) continue

      await sql`
        INSERT INTO nft_metadata_uris (
          collection_id,
          ordinal_id,
          image_uri,
          metadata_uri,
          storage_provider,
          nft_name,
          nft_number
        ) VALUES (
          ${collectionId}::uuid,
          ${result.nftId}::uuid,
          ${result.imageUri},
          ${result.metadataUri},
          'vercel-blob',
          ${nftsToUpload.find(n => n.id === result.nftId)?.name},
          ${ordinals.findIndex(o => o.id === result.nftId) + 1}
        )
        ON CONFLICT (ordinal_id) 
        DO UPDATE SET
          image_uri = EXCLUDED.image_uri,
          metadata_uri = EXCLUDED.metadata_uri
      `

      // Mark ordinal as having metadata uploaded
      await sql`
        UPDATE generated_ordinals
        SET metadata_uploaded = true
        WHERE id = ${result.nftId}::uuid
      `
    }

    // Update collection status
    await sql`
      UPDATE collections
      SET 
        metadata_uploaded = true,
        deployment_status = 'metadata_uploaded'
      WHERE id = ${collectionId}::uuid
    `

    console.log('✅ Metadata upload complete!')

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${uploadResults.length} NFT metadata`,
      count: uploadResults.length,
      metadataUris: uploadResults.map(r => r.metadataUri),
    })

  } catch (error: any) {
    console.error('[Upload Metadata] Error:', error)
    
    // Revert deployment status
    try {
      const { id } = await params
      await sql`
        UPDATE collections
        SET deployment_status = 'not_deployed'
        WHERE id = ${id}::uuid
      `
    } catch {}

    return NextResponse.json({ 
      error: error.message || 'Failed to upload metadata',
      details: error.toString()
    }, { status: 500 })
  }
}
