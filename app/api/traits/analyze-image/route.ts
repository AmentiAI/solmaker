import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { deductCredits, hasEnoughCredits } from '@/lib/credits/credits'

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const image = formData.get('image') as File | null
    const name = formData.get('name') as string | null
    const layerId = formData.get('layer_id') as string | null
    const walletAddress = formData.get('wallet_address') as string | null
    const rarityWeight = parseInt(formData.get('rarity_weight') as string || '40')

    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!layerId) {
      return NextResponse.json({ error: 'Layer ID is required' }, { status: 400 })
    }
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Check credits (costs 0.5 credit for image analysis)
    const cost = 0.5
    const hasCredits = await hasEnoughCredits(walletAddress, cost)
    if (!hasCredits) {
      return NextResponse.json({ error: 'Not enough credits. Image analysis costs 0.5 credits.' }, { status: 402 })
    }

    // Verify layer exists and get collection info
    const layerRes = await sql`
      SELECT l.id, l.name, l.collection_id, c.name as collection_name, c.art_style
      FROM layers l
      JOIN collections c ON l.collection_id = c.id
      WHERE l.id = ${layerId}
    `
    if (!Array.isArray(layerRes) || layerRes.length === 0) {
      return NextResponse.json({ error: 'Layer not found' }, { status: 404 })
    }
    const layer = layerRes[0] as any

    // Convert image to base64
    const imageBuffer = await image.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString('base64')
    const mimeType = image.type || 'image/png'
    const dataUrl = `data:${mimeType};base64,${base64Image}`

    // Use OpenAI Vision to analyze the image
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing artwork for NFT/ordinal collections. 
Your job is to describe a trait image in detail so it can be recreated by an AI image generator.

The user is uploading a trait for the "${layer.name}" layer of their "${layer.collection_name}" collection.
${layer.art_style ? `The collection's art style is: ${layer.art_style}` : ''}

Provide:
1. A detailed visual description (2-3 sentences) focusing on colors, shapes, style, and unique features
2. A trait prompt that could be used to generate this exact trait with an AI image generator

Be specific about art style (pixel art, anime, realistic, cartoon, etc.), colors, lighting, and distinctive features.
Keep the trait prompt concise but detailed enough to recreate the visual.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this trait image named "${name.trim()}". Describe it in detail and create a trait prompt for AI generation.

Return your response in this exact JSON format:
{
  "description": "Your detailed visual description here",
  "trait_prompt": "Your AI generation prompt here",
  "detected_style": "The art style you detected (e.g., pixel art, anime, cartoon, realistic, etc.)"
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData?.error?.message || 'Failed to analyze image with OpenAI')
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''
    
    // Parse the JSON response
    let analysisResult: { description: string; trait_prompt: string; detected_style: string }
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content)
      // Fallback: use the raw content as description
      analysisResult = {
        description: content.slice(0, 500),
        trait_prompt: `${name.trim()} - ${content.slice(0, 200)}`,
        detected_style: 'unknown'
      }
    }

    // Deduct credits
    const deducted = await deductCredits(walletAddress, cost, `Image analysis for trait: ${name.trim()}`)
    if (!deducted) {
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 })
    }

    // Create the trait in the database
    const traitRes = await sql`
      INSERT INTO traits (layer_id, name, description, trait_prompt, rarity_weight)
      VALUES (${layerId}, ${name.trim()}, ${analysisResult.description}, ${analysisResult.trait_prompt}, ${rarityWeight})
      RETURNING id, name, description, trait_prompt, rarity_weight, created_at
    `

    if (!Array.isArray(traitRes) || traitRes.length === 0) {
      return NextResponse.json({ error: 'Failed to create trait' }, { status: 500 })
    }

    // Trigger credit refresh
    return NextResponse.json({
      success: true,
      trait: traitRes[0],
      analysis: {
        description: analysisResult.description,
        trait_prompt: analysisResult.trait_prompt,
        detected_style: analysisResult.detected_style
      },
      credits_used: cost
    })

  } catch (error) {
    console.error('[Analyze Image API] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to analyze image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

