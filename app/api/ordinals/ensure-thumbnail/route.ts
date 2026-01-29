import { NextRequest, NextResponse } from 'next/server'

import { put } from '@vercel/blob'
import { createThumbnail, getFileSizeKB } from '@/lib/image-optimizer'
import { sql } from '@/lib/database';

// POST /api/ordinals/ensure-thumbnail - Generate thumbnail for ordinal if missing
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { ordinal_id } = await request.json()

    if (!ordinal_id) {
      return NextResponse.json({ error: 'ordinal_id is required' }, { status: 400 })
    }

    // Get the ordinal
    const ordinalResult = await sql`
      SELECT id, image_url, thumbnail_url, collection_id, ordinal_number
      FROM generated_ordinals
      WHERE id = ${ordinal_id}
    `

    const ordinals = Array.isArray(ordinalResult) ? ordinalResult : []
    if (ordinals.length === 0) {
      return NextResponse.json({ error: 'Ordinal not found' }, { status: 404 })
    }

    const ordinal = ordinals[0] as any

    // Check if thumbnail already exists
    if (ordinal.thumbnail_url) {
      return NextResponse.json({ 
        message: 'Thumbnail already exists',
        thumbnail_url: ordinal.thumbnail_url 
      })
    }

    console.log(`[Thumbnail] Generating thumbnail for ordinal ${ordinal_id}`)

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

    console.log(
      `[Thumbnail] Original: ${getFileSizeKB(Buffer.from(await imageBlob.arrayBuffer()))}KB → ` +
      `Thumbnail: ${getFileSizeKB(thumbnailBuffer)}KB`
    )

    // Update database
    await sql`
      UPDATE generated_ordinals
      SET thumbnail_url = ${thumbnailBlob.url}
      WHERE id = ${ordinal_id}
    `

    return NextResponse.json({
      message: 'Thumbnail generated successfully',
      thumbnail_url: thumbnailBlob.url,
      original_size_kb: getFileSizeKB(Buffer.from(await imageBlob.arrayBuffer())),
      thumbnail_size_kb: getFileSizeKB(thumbnailBuffer),
    })

  } catch (error) {
    console.error('Error ensuring thumbnail:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate thumbnail',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

