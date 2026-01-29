import { NextRequest, NextResponse } from 'next/server'
import { checkAuthorizationServer } from '@/lib/auth/access-control'
import { sql } from '@/lib/database'
import { put } from '@vercel/blob'

/**
 * POST /api/admin/preset-previews/regenerate - Regenerate image for a preset preview
 */
export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const url = new URL(request.url)
    const walletAddress = url.searchParams.get('wallet_address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 401 })
    }

    const authResult = await checkAuthorizationServer(request, sql)
    if (!authResult.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin access only.' }, { status: 403 })
    }

    const body = await request.json()
    const { preset_id, prompt } = body

    if (!preset_id) {
      return NextResponse.json({ error: 'preset_id is required' }, { status: 400 })
    }

    // Get existing prompt if not provided
    let finalPrompt = prompt
    if (!finalPrompt) {
      const existing = await sql`
        SELECT prompt FROM preset_previews WHERE preset_id = ${preset_id} LIMIT 1
      ` as any[]
      
      if (!existing || existing.length === 0) {
        return NextResponse.json({ error: 'Preset preview not found. Please provide a prompt.' }, { status: 404 })
      }
      
      finalPrompt = existing[0].prompt
    }

    if (!finalPrompt || typeof finalPrompt !== 'string' || finalPrompt.trim().length === 0) {
      return NextResponse.json({ error: 'prompt is required and must be a non-empty string' }, { status: 400 })
    }

    // Generate new preview image
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    console.log(`[Admin Preset Previews] Regenerating preview for preset: ${preset_id}`)

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt.trim(),
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
      const imageResponse = await fetch(imageUrl)
      imageBlob = await imageResponse.blob()
    } else {
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '')
      if (!base64Data || base64Data.trim() === '') {
        throw new Error('Invalid base64 image data: empty or missing')
      }
      const buffer = Buffer.from(base64Data, 'base64')
      imageBlob = new Blob([buffer], { type: 'image/png' })
    }

    // Upload to Vercel Blob Storage
    const filename = `preset-preview-${preset_id}-${Date.now()}.png`
    console.log(`[Admin Preset Previews] Uploading to Vercel Blob: ${filename}`)

    const blob = await put(filename, imageBlob, {
      access: 'public',
      addRandomSuffix: false,
    })

    console.log(`[Admin Preset Previews] Successfully uploaded to: ${blob.url}`)

    // Update database with new image URL and prompt
    const result = await sql`
      INSERT INTO preset_previews (preset_id, image_url, prompt)
      VALUES (${preset_id}, ${blob.url}, ${finalPrompt.trim()})
      ON CONFLICT (preset_id) 
      DO UPDATE SET 
        image_url = EXCLUDED.image_url,
        prompt = EXCLUDED.prompt,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, preset_id, image_url, prompt, created_at, updated_at
    ` as any[]

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Failed to save preview to database' }, { status: 500 })
    }

    console.log(`[Admin Preset Previews] Saved regenerated preview to database for preset: ${preset_id}`)

    return NextResponse.json({
      preview: {
        id: result[0].id,
        preset_id: result[0].preset_id,
        image_url: result[0].image_url,
        prompt: result[0].prompt,
        created_at: result[0].created_at,
        updated_at: result[0].updated_at,
      },
    })
  } catch (error: any) {
    console.error('[Admin Preset Previews API] Regenerate Error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate preset preview', details: error?.message },
      { status: 500 }
    )
  }
}

