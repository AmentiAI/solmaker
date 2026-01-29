import { NextRequest, NextResponse } from 'next/server'

type CharacterPromptResponse = {
  description: string // Comprehensive character and trait description prompt
  colors_description: string // Color scheme and palette
  lighting_description: string // Lighting setup and mood
  background_description?: string // Background color scheme and style
}

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, collectionName } = await request.json()

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

    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const prompt = `Analyze the provided reference image and generate an EXTREMELY DETAILED, COMPREHENSIVE hardcoded prompt that describes EVERY SINGLE VISIBLE DETAIL of the character, especially facial features. This prompt must be detailed enough that someone could recreate the character exactly from the description alone.

CRITICAL INSTRUCTIONS - BE EXTREMELY THOROUGH BUT ONLY DESCRIBE WHAT IS VISIBLE:
- **MANDATORY: Identify and describe the character's GENDER (male, female) - this is CRITICAL and must be explicitly stated in the description**
- **CRITICAL: ONLY describe features that are ACTUALLY VISIBLE in the image. DO NOT hallucinate or invent details that are not visible.**
- **If hair is covered by a hoodie, hat, helmet, or any head covering, explicitly state "no visible hair" or "hair is completely obscured by [item]". DO NOT describe hair that you cannot see.**
- **If the character is hairless/bald, explicitly state "the character has no hair" or "the character is completely hairless".**
- **If any feature is obscured, covered, or not visible, explicitly state that it is "not visible", "obscured", or "covered by [item]" rather than making up details.**
- Describe EVERY VISIBLE facial feature in EXTREME detail: eye shape, size, color, position, spacing, eyelid details, eyelashes, eyebrows (shape, thickness, color, arch) - ONLY if visible, nose (shape, size, width, nostrils, bridge) - ONLY if visible, mouth (shape, size, lip thickness, corners, expression) - ONLY if visible, cheekbones, jawline, chin shape, forehead size, face shape overall
- Describe EVERY VISIBLE detail of the head: hair style (exact cut, length, texture, part, volume) - ONLY if hair is visible, hair color (specific shades, highlights, gradients) - ONLY if hair is visible, hair direction/flow - ONLY if hair is visible, any hair accessories - ONLY if visible. If hair is not visible, state "no visible hair" or "hair is obscured by [item]"
- Describe skin: tone, texture, any markings, freckles, blemishes, or unique features - ONLY for visible skin areas
- Describe body: type, proportions, pose, stance, any visible body parts, gender characteristics if visible - ONLY what is actually visible
- Describe clothing: EVERY item visible, exact style, fit, colors, patterns, textures, accessories, how it drapes/fits - ONLY what is visible
- Describe accessories: EVERY accessory visible (jewelry, glasses, hats, hoodies, etc.) with exact details - ONLY what is visible
- Describe the EXACT color scheme: specific colors for every VISIBLE element, saturation levels, contrast, brightness, warmth/coolness
- Describe the EXACT lighting: direction, intensity, mood, shadows (location and intensity), highlights (location and intensity), rim lighting, fill light, key light, atmospheric effects
- Describe the EXACT background: colors, style, composition, depth, atmosphere, any environmental elements
- Be EXTREMELY specific - use measurements, percentages, and precise descriptions (e.g., "eyes are 30% of face width, positioned 40% down from top of head, almond-shaped, bright blue with dark pupils, thick black eyelashes, slight upward tilt at outer corners")
- This description must be detailed enough to recreate the character pixel-by-pixel, but ONLY based on what is actually visible in the image

Return ONLY valid JSON (no markdown). The JSON MUST match this schema:
{
  "description": string (EXTREMELY detailed character description - 8-15 sentences describing EVERY visible detail: **GENDER (male/female/non-binary/other) - MUST be explicitly stated**, facial features in extreme detail (eyes, nose, mouth, eyebrows, cheekbones, jaw, chin, forehead, face shape), hair (style, color, texture, direction), skin tone and texture, body type and pose, clothing (every item with exact details), accessories (every item), overall proportions and measurements, unique characteristics - be so detailed that someone could draw it exactly),
  "colors_description": string (detailed color scheme: specific colors for every element, saturation, contrast, brightness, warmth/coolness, color relationships, palette style - be very specific about actual colors seen for skin, hair, eyes, clothing, background),
  "lighting_description": string (detailed lighting setup: light direction, intensity, mood, shadows (exact locations), highlights (exact locations), rim lighting, fill light, key light, atmospheric effects - be very specific),
  "background_description": string (optional - background color scheme, style, composition, depth, atmosphere, any environmental elements)
}

CHARACTER IDENTITY CHECKLIST - Describe ALL of these:
- **GENDER: Explicitly state the character's gender (male, female) - this is MANDATORY and must be clearly identified**

FACIAL FEATURES CHECKLIST - Describe ALL of these in extreme detail:
- EYES: Shape (round, almond, narrow, wide), size (relative to face), color (exact shade, iris pattern), position (spacing between eyes, distance from top/bottom of face), eyelid details (single/double, hooded, crease), eyelashes (length, thickness, color, curl), eyebrows (shape, thickness, color, arch, spacing), eye expression (openness, direction of gaze)
- NOSE: Shape (straight, curved, upturned, downturned), size (relative to face), width, bridge height, nostril size and shape, any unique features
- MOUTH: Shape (width, fullness), lip thickness (upper vs lower), lip color, corners (up/down/neutral), expression (smile, frown, neutral), any visible teeth
- FACE SHAPE: Overall shape (round, oval, square, heart, diamond), proportions (forehead size, cheekbone prominence, jaw width, chin shape), symmetry
- SKIN: Tone (exact shade), texture (smooth, rough, matte, glossy), any markings (freckles, moles, scars, blemishes), any unique features
- HAIR: **ONLY describe if hair is VISIBLE**. If hair is covered by a hoodie, hat, helmet, or any head covering, state "no visible hair" or "hair is completely obscured by [item]". If the character is hairless/bald, state "the character has no hair" or "the character is completely hairless". If hair IS visible: Style (exact cut, length, layers), color (specific shades, highlights, gradients, roots), texture (straight, wavy, curly, coily), direction/flow, part (center, side, none), volume, any accessories. **DO NOT invent or hallucinate hair details if hair is not visible.**
- OTHER FEATURES: Ears (size, shape, position), neck (length, width), any other visible facial/head features

CLOTHING & ACCESSORIES CHECKLIST:
- Describe EVERY visible clothing item: type, style, fit, colors, patterns, textures, how it drapes, any details (buttons, zippers, seams, etc.)
- Describe EVERY accessory: type, style, colors, materials, how it's worn/positioned

IMPORTANT:
- The description must be EXTREMELY detailed - think of it as a forensic description that could be used to recreate the character exactly
- **CRITICAL: Only describe what you can ACTUALLY SEE in the image. DO NOT hallucinate, invent, or assume details that are not visible.**
- **If any feature is obscured, covered, or not visible, explicitly state that it is "not visible", "obscured", or "covered by [item]" rather than making up details.**
- **If hair is covered by clothing/accessories or the character is hairless, explicitly state this. DO NOT describe hair that you cannot see.**
- Use specific measurements and proportions where possible (e.g., "eyes are 1.5x wider than they are tall", "nose is 20% of face width")
- Describe colors with specific shades (e.g., "bright emerald green #00ff88", not just "green")
- Describe lighting with specific locations (e.g., "highlight on left cheekbone at 45-degree angle from top-left")
- Be so detailed that an artist could recreate this character without seeing the original image, but ONLY based on what is actually visible

Be EXTREMELY thorough and specific. This prompt will be used to generate similar characters, so include every single detail that makes this character unique and identifiable.`

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
              'You are an expert character designer and art director. Analyze images in extreme detail and generate comprehensive, specific descriptions. CRITICAL: Only describe features that are ACTUALLY VISIBLE in the image. DO NOT hallucinate or invent details that are not visible. If a feature is obscured or not visible, explicitly state that it is "not visible" or "obscured" rather than making up details. Return only valid JSON matching the requested schema. No markdown, no commentary.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  (collectionName ? `Collection name (optional): "${collectionName}"\n\n` : '') +
                  prompt,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl, detail: 'high' },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000, // Increased for much more detailed descriptions
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg =
        (err && typeof err === 'object' && (err as any).error?.message) ||
        (err && typeof err === 'object' && (err as any).message) ||
        'Failed to generate character prompt'
      console.error('[generate-character-prompt] OpenAI error:', err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'No content from AI' }, { status: 500 })
    }

    let parsed: CharacterPromptResponse
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
    } catch (e) {
      console.error('[generate-character-prompt] Failed to parse JSON:', content)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Validate required fields
    if (!parsed.description || !parsed.colors_description || !parsed.lighting_description) {
      return NextResponse.json(
        { error: 'AI response missing required fields' },
        { status: 500 }
      )
    }

    return NextResponse.json({ result: parsed })
  } catch (e) {
    console.error('[generate-character-prompt] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate character prompt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
