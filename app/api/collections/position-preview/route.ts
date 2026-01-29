import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { sql } from '@/lib/database'

/**
 * GET /api/collections/position-preview - Get all existing preset previews
 * Returns a map of preset_id -> image_url for all cached previews
 */
export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ previews: {} })
    }

    try {
      const results = await sql`
        SELECT preset_id, image_url 
        FROM preset_previews
        ORDER BY preset_id
      ` as any[]

      if (results && Array.isArray(results)) {
        const previews: Record<string, string> = {}
        for (const row of results) {
          const presetRow = row as { preset_id?: string; image_url?: string }
          if (presetRow.preset_id && presetRow.image_url) {
            previews[presetRow.preset_id] = presetRow.image_url
          }
        }
        console.log(`[Position Preview] Loaded ${Object.keys(previews).length} cached previews`)
        return NextResponse.json({ previews })
      }
    } catch (dbError: any) {
      // Table might not exist yet - that's okay
      console.log('[Position Preview] Database query failed (table may not exist):', dbError.message)
    }

    return NextResponse.json({ previews: {} })
  } catch (error: any) {
    console.error('[Position Preview] Error loading previews:', error)
    return NextResponse.json({ previews: {} })
  }
}

/**
 * POST /api/collections/position-preview - Generate a preview image for character positioning presets
 * Checks database first to avoid regenerating existing previews
 */
export async function POST(request: NextRequest) {
  try {
    const { prompt, presetId } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    if (!presetId) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 })
    }

    // Check if preview already exists in database
    if (sql) {
      try {
        const existing = await sql`
          SELECT image_url FROM preset_previews 
          WHERE preset_id = ${presetId}
          LIMIT 1
        `
        
        if (existing && Array.isArray(existing) && existing.length > 0) {
          const firstResult = existing[0] as { image_url?: string }
          if (firstResult?.image_url) {
            console.log(`[Position Preview] Found existing preview for preset: ${presetId}`)
            return NextResponse.json({ imageUrl: firstResult.image_url })
          }
        }
      } catch (dbError: any) {
        // If table doesn't exist yet, continue with generation
        console.log('[Position Preview] Database check failed (table may not exist):', dbError.message)
      }
    }

    // Generate new preview
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    console.log(`[Position Preview] Generating new preview for preset: ${presetId}`)
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { error: `OpenAI API error: ${JSON.stringify(error)}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image data returned' }, { status: 500 })
    }

    // Convert to blob (handle both URL and base64)
    let imageBlob: Blob
    if (imageUrl.startsWith('http')) {
      // URL response - download it
      const imageResponse = await fetch(imageUrl)
      imageBlob = await imageResponse.blob()
    } else {
      // Base64 response - convert to blob
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '')
      if (!base64Data || base64Data.trim() === '') {
        throw new Error('Invalid base64 image data: empty or missing')
      }
      const buffer = Buffer.from(base64Data, 'base64')
      imageBlob = new Blob([buffer], { type: 'image/png' })
    }

    // Upload to Vercel Blob Storage
    const filename = `preset-preview-${presetId}-${Date.now()}.png`
    console.log(`[Position Preview] Uploading to Vercel Blob: ${filename}`)
    
    const blob = await put(filename, imageBlob, {
      access: 'public',
      addRandomSuffix: false,
    })

    console.log(`[Position Preview] Successfully uploaded to: ${blob.url}`)

    // Save to database for future use
    if (sql) {
      try {
        await sql`
          INSERT INTO preset_previews (preset_id, image_url, prompt)
          VALUES (${presetId}, ${blob.url}, ${prompt})
          ON CONFLICT (preset_id) 
          DO UPDATE SET 
            image_url = EXCLUDED.image_url,
            prompt = EXCLUDED.prompt,
            updated_at = CURRENT_TIMESTAMP
        `
        console.log(`[Position Preview] Saved preview to database for preset: ${presetId}`)
      } catch (dbError: any) {
        // Log but don't fail - the image is still uploaded and usable
        console.warn('[Position Preview] Failed to save to database (table may not exist):', dbError.message)
      }
    }

    return NextResponse.json({ imageUrl: blob.url })
  } catch (error: any) {
    console.error('[Position Preview] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate preview' },
      { status: 500 }
    )
  }
}
