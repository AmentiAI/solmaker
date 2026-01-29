import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database';


// Helper to fetch file size from URL
async function fetchFileSize(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      return parseInt(contentLength)
    }
  } catch (error) {
    console.error(`Error fetching file size for ${url}:`, error)
  }
  return null
}

// POST /api/ordinals/batch-file-sizes - Calculate and store file sizes for ordinals
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { ordinal_ids } = body

    if (!ordinal_ids || !Array.isArray(ordinal_ids) || ordinal_ids.length === 0) {
      return NextResponse.json({ error: 'ordinal_ids array is required' }, { status: 400 })
    }

    console.log(`[FileSize] Processing ${ordinal_ids.length} ordinals...`)

    // Fetch ordinals from database
    const result = await sql`
      SELECT id, image_url, thumbnail_url, file_size_bytes
      FROM generated_ordinals
      WHERE id = ANY(${ordinal_ids})
    `

    const ordinals = Array.isArray(result) ? result : []

    let successful = 0
    let skipped = 0
    let failed = 0

    // Process each ordinal
    for (const ordinal of ordinals) {
      const ordinalData = ordinal as any
      
      // Skip if already has file size
      if (ordinalData.file_size_bytes && ordinalData.file_size_bytes > 0) {
        skipped++
        continue
      }

      // Try thumbnail first (smaller, faster), then fall back to full image
      const urlToCheck = ordinalData.thumbnail_url || ordinalData.image_url

      if (!urlToCheck) {
        console.log(`[FileSize] No URL available for ordinal ${ordinalData.id}`)
        failed++
        continue
      }

      const fileSize = await fetchFileSize(urlToCheck)

      if (fileSize && fileSize > 0) {
        // Update database with file size
        try {
          await sql`
            UPDATE generated_ordinals
            SET file_size_bytes = ${fileSize}
            WHERE id = ${ordinalData.id}
          `
          successful++
          console.log(`[FileSize] ✓ ${ordinalData.id}: ${fileSize} bytes`)
        } catch (updateError) {
          console.error(`[FileSize] Failed to update ordinal ${ordinalData.id}:`, updateError)
          failed++
        }
      } else {
        console.log(`[FileSize] ✗ Failed to fetch size for ${ordinalData.id}`)
        failed++
      }
    }

    console.log(`[FileSize] Batch complete: ${successful} successful, ${skipped} skipped, ${failed} failed`)

    return NextResponse.json({
      success: true,
      successful,
      skipped,
      failed,
      total: ordinal_ids.length,
    })
  } catch (error) {
    console.error('[FileSize] Batch processing error:', error)
    return NextResponse.json({ 
      error: 'Failed to process file sizes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

