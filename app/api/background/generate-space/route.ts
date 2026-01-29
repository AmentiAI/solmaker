import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Generate a cosmic space background
    const prompt = `A stunning cosmic space background with:
- Deep dark space with rich purples and blues (#0a0e27, #1a1f3a, #0f172a)
- Thousands of sparkling stars scattered throughout
- Glowing translucent purple and blue cubic shapes floating in space
- Subtle nebula clouds in purple (#8b5cf6) and blue (#00d4ff) tones
- Mysterious cosmic atmosphere with depth and dimension
- No text, no objects, just pure cosmic space background
- High quality, detailed, 4K resolution, cinematic lighting
- Perfect for web background, seamless and tileable if possible`

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
      const error = await response.json().catch(() => ({ error: 'Failed to generate image' }))
      console.error('[Space Background] Generation error:', error)
      return NextResponse.json(
        { error: 'Failed to generate space background', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()
    const imageUrl = data.data?.[0]?.url

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'No image URL returned from OpenAI' },
        { status: 500 }
      )
    }

    // Download the image and upload to Vercel Blob
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download generated image' },
        { status: 500 }
      )
    }

    const imageBlob = await imageResponse.blob()
    const filename = `backgrounds/space-${Date.now()}.png`
    const uploaded = await put(filename, imageBlob, {
      access: 'public',
      addRandomSuffix: false,
    })

    return NextResponse.json({
      success: true,
      url: uploaded.url,
    })
  } catch (error: any) {
    console.error('[Space Background] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate space background' },
      { status: 500 }
    )
  }
}

