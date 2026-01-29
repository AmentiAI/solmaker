import { NextRequest, NextResponse } from 'next/server'
import { ART_STYLES } from '@/lib/art-styles'

type FutureAnalyzeResponse = {
  art_style_id: string
  custom_art_style?: string
  is_pfp_collection: boolean
  facing_direction?: 'front' | 'left' | 'right'
  body_style?: 'full' | 'half' | 'headonly'
  border_requirements?: string
  colors_description?: string
  lighting_description?: string
  custom_rules?: string
  use_hyper_detailed?: boolean
  description?: string
}

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, collectionName, referenceType } = await request.json()

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

    // Model selection:
    // - "gpt-image-*" models are for image generation/editing and do NOT reliably support vision analysis via chat.completions.
    // - Use a dedicated vision-capable model for analysis.
    const configuredModel = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const model = configuredModel.startsWith('gpt-image') ? 'gpt-4o-mini' : configuredModel

    const styleList = ART_STYLES.map((s) => `${s.id}: ${s.name} — ${s.description}`).join('\n')
    const isPfpReference = referenceType === 'pfp'
    const referenceTypeNote = isPfpReference 
      ? `REFERENCE TYPE: This is a PFP (Profile Picture) reference. Focus on character features, facial structure, and character appearance.`
      : `REFERENCE TYPE: This is an artwork reference. Focus on art style, composition, and visual elements.`
    const pfpInstructions = isPfpReference 
      ? `- FOR PFP: Also describe the character's basic appearance: facial features, gender, age/apparent age, expressions, hair style, body type, clothing style (but not specific colors)`
      : ''
    const descriptionInstructions = isPfpReference
      ? `For PFP: 2-4 sentences describing the character's basic appearance - facial features, gender, age, expressions, hair, body type, clothing style. For Artwork: 1-2 sentences describing the collection for launchpad`
      : `1-2 sentences describing the collection for launchpad`

    const prompt = `Analyze the provided reference image and infer the best settings to create a similar NFT collection.

${referenceTypeNote}

CRITICAL INSTRUCTIONS - Focus on CORE ARTISTIC ELEMENTS that define the style:
- Extract the FUNDAMENTAL artistic/technical elements that would remain consistent even when colors, lighting, clothing, or specific details change
- Focus on: line quality (thin/thick/sketchy/clean), rendering technique (flat/painterly/3D/cel-shaded), composition structure, facial proportions, body structure, artistic approach, edge treatment, texture handling
${pfpInstructions}
- DO NOT focus on: colors (this is set separately in collection settings), lighting (this is set separately in collection settings), specific clothing items, or other variable details that should change between images
- The goal is to capture the "DNA" of the art style - what makes it look the same even when colors, lighting, and subject matter changes

IMPORTANT:
- You must be extremely thorough. Treat this like a "style matching" task: match composition, linework, shading, texture, palette feel, lighting, camera/framing, and background treatment.
- Do NOT be vague. Prefer concrete, actionable instructions that an image model can follow.
- If something is unclear, make the best practical inference, but do not invent unrelated details.
- The most important requirement is CONSISTENT FRAMING across the entire collection: the character should sit in the same place with the same crop every time (head placement, eye line, body scale, margins).
- Think step-by-step internally, but output ONLY valid JSON.

Return ONLY valid JSON (no markdown). The JSON MUST match this schema:
{
  "art_style_id": one of [${ART_STYLES.map((s) => `"${s.id}"`).join(', ')}],
  "custom_art_style": string (only if art_style_id is "custom"),
  "is_pfp_collection": boolean,
  "facing_direction": optional one of ["front","left","right"] (only if is_pfp_collection),
  "body_style": optional one of ["full","half","headonly"] (only if is_pfp_collection),
  "border_requirements": string,
  "colors_description": string (leave empty - colors are set separately in collection settings),
  "lighting_description": string (leave empty - lighting is set separately in collection settings),
  "custom_rules": string (extra generation rules, short),
  "use_hyper_detailed": boolean,
  "description": string (${descriptionInstructions})
}

Available art styles:
${styleList}

If the art style does not match any existing option, set art_style_id to "custom" and write a precise custom_art_style prompt.
Be practical and precise; match the image's vibe and linework/texture.

Checklist (ensure you cover these in the provided fields):
- art style category (or a custom_art_style prompt that captures the exact look)
  - Focus on: line quality (thin lines, thick outlines, sketchy, clean, etc.), rendering approach (flat colors, gradients, cel-shading, painterly, 3D, etc.)
  - Describe the CORE visual language: how shapes are formed, how edges are handled, overall artistic approach
  - Example: "Hyper-realistic rendering with thin, precise linework, exaggerated facial proportions with large expressive eyes, detailed texture work, smooth gradients with subtle shading"
- whether it is clearly a PFP/character (is_pfp_collection) and framing (facing_direction, body_style)
- EXACT FRAMING TEMPLATE (put this in custom_rules as strict instructions):
  - head placement (top-of-head % from top edge)
  - eye line % from top edge
  - subject scale (how much of canvas the character occupies)
  - crop rules (full/upper/head-only) + consistent margins
  - centered vs off-center (must be consistent)
  - facial proportions (eye size relative to face, head shape, feature placement)
- border/edge treatment and any framing device (border_requirements)
- DO NOT analyze colors or lighting - these are set separately in collection settings and should be left empty
- rendering technique (flat, painterly, inked, cel-shaded, glossy 3D, noisy film grain, halftone, etc.)
  - This is CRITICAL - describe the technical rendering approach that defines the style
- composition structure (how elements are arranged, focal point placement, visual hierarchy)
- background treatment (solid/gradient/pattern/environment), depth of field
- facial/body structure (proportions, feature exaggeration, anatomical style - e.g., "large expressive eyes", "elongated features", "exaggerated proportions")
- any "rules" that prevent common generation errors (custom_rules)

Write custom_rules as short bullet-like sentences that are enforceable.
When the image is a character/PFP, include a "CRITICAL FRAMING" block in custom_rules with numeric-ish relative placements (percentages are OK). Example format:
- CRITICAL FRAMING: top of head ~8% from top edge; eyes ~30% from top; chin ~45% from top; shoulders ~55% from top; character centered; consistent scale; consistent crop; no zoom variations.
Also include other rules like: consistent line weight, clean silhouette, no extra limbs, etc.

IMPORTANT FOR ART STYLE DESCRIPTION:
- Focus on the TECHNICAL and STRUCTURAL elements that define the style
- Describe: line quality, rendering technique, composition approach, facial/body proportions, texture handling, edge treatment
- DO NOT describe: specific colors, specific clothing items, or other variable details
- Think: "What makes this look the same even if I change the colors and clothes?"
- Example good description: "Hyper-realistic rendering with thin precise linework, exaggerated facial proportions with large expressive eyes positioned high on the face, detailed texture work with smooth gradients, dramatic lighting with strong contrast, clean edges with subtle anti-aliasing"
- Example bad description: "Green alien with orange hoodie and rainbow background" (too specific, focuses on variables)
`

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
              'You are an expert art director. Return only valid JSON matching the requested schema. No markdown, no commentary.',
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
        temperature: 0.05,
        max_tokens: 1200,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg =
        (err && typeof err === 'object' && (err as any).error?.message) ||
        (err && typeof err === 'object' && (err as any).message) ||
        'Failed to analyze image'
      console.error('[future-analyze] OpenAI error:', err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'No content from AI' }, { status: 500 })
    }

    let parsed: FutureAnalyzeResponse
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
    } catch (e) {
      console.error('[future-analyze] Failed to parse JSON:', content)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Minimal sanity checks
    const validStyleIds = new Set(ART_STYLES.map((s) => s.id))
    if (!parsed.art_style_id || !validStyleIds.has(parsed.art_style_id)) {
      parsed.art_style_id = 'custom'
    }
    if (parsed.art_style_id !== 'custom') {
      delete parsed.custom_art_style
    }

    return NextResponse.json({ result: parsed })
  } catch (e) {
    console.error('[future-analyze] Error:', e)
    const msg = e instanceof Error ? e.message : 'Failed to analyze image'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


