import { NextRequest, NextResponse } from 'next/server'

import { put } from '@vercel/blob'
import { createThumbnail, getFileSizeKB } from '@/lib/image-optimizer'
import { sql } from '@/lib/database';

// POST /api/ordinals/batch-thumbnails - Generate thumbnails for multiple ordinals
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { ordinal_ids } = await request.json()

    if (!ordinal_ids || !Array.isArray(ordinal_ids)) {
      return NextResponse.json({ error: 'ordinal_ids array is required' }, { status: 400 })
    }

    if (ordinal_ids.length === 0) {
      return NextResponse.json({ message: 'No ordinals to process', processed: 0 })
    }

    console.log(`[Thumbnail Batch] Processing ${ordinal_ids.length} ordinals`)

    const results = await Promise.allSettled(
      ordinal_ids.map((id: string) => generateThumbnailForOrdinal(id))
    )

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    const skipped = results.filter(
      r => r.status === 'fulfilled' && (r.value as any)?.skipped
    ).length

    return NextResponse.json({
      message: 'Batch processing complete',
      total: ordinal_ids.length,
      successful: successful - skipped,
      skipped,
      failed,
    })

  } catch (error) {
    console.error('Error in batch thumbnail generation:', error)
    return NextResponse.json(
      {
        error: 'Failed to process batch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

async function generateThumbnailForOrdinal(ordinal_id: string) {
  if (!sql) throw new Error('Database not available')

  // Get the ordinal
  const ordinalResult = await sql`
    SELECT id, image_url, thumbnail_url, collection_id, ordinal_number
    FROM generated_ordinals
    WHERE id = ${ordinal_id}
  `

  const ordinals = Array.isArray(ordinalResult) ? ordinalResult : []
  if (ordinals.length === 0) {
    throw new Error(`Ordinal ${ordinal_id} not found`)
  }

  const ordinal = ordinals[0] as any

  // Skip if thumbnail already exists
  if (ordinal.thumbnail_url) {
    return { skipped: true, ordinal_id }
  }

  console.log(`[Thumbnail Batch] Generating for ordinal #${ordinal.ordinal_number}`)

  // Download the original image
  const imageResponse = await fetch(ordinal.image_url)
  if (!imageResponse.ok) {
    throw new Error('Failed to download original image')
  }

  const imageBlob = await imageResponse.blob()

  // Create thumbnail
  const thumbnailBuffer = await createThumbnail(imageBlob, 512, 80)
  const thumbnailFilename = `thumbnail-${ordinal.collection_id}-${ordinal.ordinal_number || Date.now()}.jpg`
  
  const thumbnailBlob = await put(
    thumbnailFilename,
    new Blob([new Uint8Array(thumbnailBuffer)], { type: 'image/jpeg' }),
    {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'image/jpeg',
    }
  )

  // Update database
  await sql`
    UPDATE generated_ordinals
    SET thumbnail_url = ${thumbnailBlob.url}
    WHERE id = ${ordinal_id}
  `

  const originalSize = getFileSizeKB(Buffer.from(await imageBlob.arrayBuffer()))
  const thumbnailSize = getFileSizeKB(thumbnailBuffer)

  console.log(
    `[Thumbnail Batch] Ordinal #${ordinal.ordinal_number}: ${originalSize}KB → ${thumbnailSize}KB`
  )

  return {
    ordinal_id,
    thumbnail_url: thumbnailBlob.url,
    original_size_kb: originalSize,
    thumbnail_size_kb: thumbnailSize,
  }
}

