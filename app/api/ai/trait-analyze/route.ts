import { NextRequest, NextResponse } from 'next/server'

type TraitAnalyzeResponse = {
  name: string
  description: string
}

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, layerName } = await request.json()

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 })
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'imageDataUrl must be a data:image/* URL' }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // Use vision-capable model for analysis
    const configuredModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const model = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel

    const prompt = `Analyze the provided reference image and generate a name and description for a trait that matches this visual style.

IMPORTANT:
- This image represents a single trait for the "${layerName || 'trait'}" layer of an ordinal collection
- The name should be short, descriptive, and memorable (1-3 words)
- The description should capture the key visual elements, style, colors, and unique characteristics
- Be specific and actionable - the description will be used to generate similar images
- Focus on what makes this trait distinct and recognizable

Return ONLY valid JSON (no markdown). The JSON MUST match this schema:
{
  "name": string (short, memorable name for this trait, 1-3 words),
  "description": string (detailed description of visual characteristics, style, colors, and unique elements)
}

Think step-by-step internally, but output ONLY valid JSON.`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert art director specializing in ordinal traits. Return only valid JSON matching the requested schema. No markdown, no commentary.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl, detail: 'high' },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg =
        (err && typeof err === 'object' && (err as any).error?.message) ||
        (err && typeof err === 'object' && (err as any).message) ||
        'Failed to analyze image'
      console.error('[trait-analyze] OpenAI error:', err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'No content from AI' }, { status: 500 })
    }

    let parsed: TraitAnalyzeResponse
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
    } catch (e) {
      console.error('[trait-analyze] Failed to parse JSON:', content)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Validate required fields
    if (!parsed.name || !parsed.description) {
      return NextResponse.json({ error: 'Invalid AI response - missing name or description' }, { status: 500 })
    }

    return NextResponse.json({ result: parsed })
  } catch (e) {
    console.error('[trait-analyze] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to analyze image'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
