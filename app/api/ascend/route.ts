import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { generatePrompt } from "@/lib/traits"
import { list } from "@vercel/blob"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, maxRetries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          const waitTime = Math.pow(2, attempt) * 1000
          await delay(waitTime)
          continue
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const text = await response.text()
      if (!text || text.startsWith("Too Many")) {
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000
          await delay(waitTime)
          continue
        }
        return null
      }
      return JSON.parse(text)
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error
      }
      const waitTime = Math.pow(2, attempt) * 500
      await delay(waitTime)
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { ordinalId, transformationType } = await request.json()

    if (!ordinalId || !transformationType) {
      return NextResponse.json(
        { error: "ordinalId and transformationType are required" },
        { status: 400 }
      )
    }

    if (transformationType !== 'monster' && transformationType !== 'angel') {
      return NextResponse.json(
        { error: "transformationType must be 'monster' or 'angel'" },
        { status: 400 }
      )
    }

    // Get OpenAI API key from environment
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      )
    }

    // Fetch the ordinal metadata
    // ordinalId could be a metadata URL or a blob pathname
    let metadata: any = null

    // If it's a URL, fetch it directly
    if (ordinalId.startsWith('http')) {
      metadata = await fetchWithRetry(ordinalId) as any
    } else {
      // Otherwise, search through blob storage
      const { blobs } = await list({
        prefix: "ordinal-",
      })

      // Try to find by pathname first
      let metadataBlob = blobs.find((blob) => 
        blob.pathname === ordinalId || 
        blob.pathname === `${ordinalId}-metadata.json` ||
        blob.pathname.endsWith(`${ordinalId}-metadata.json`)
      )

      // If not found, search all metadata files
      if (!metadataBlob) {
        const metadataBlobs = blobs.filter((blob) => blob.pathname.endsWith("-metadata.json"))
        for (const blob of metadataBlobs) {
          try {
            const fetchedMetadata = await fetchWithRetry(blob.url) as any
            if (fetchedMetadata && (fetchedMetadata.id === ordinalId || blob.pathname === ordinalId)) {
              metadata = fetchedMetadata
              break
            }
          } catch (error) {
            continue
          }
        }
      } else {
        metadata = await fetchWithRetry(metadataBlob.url) as any
      }
    }

    if (!metadata || !metadata.traits) {
      return NextResponse.json(
        { error: "Ordinal not found or invalid metadata" },
        { status: 404 }
      )
    }

    const traits = metadata.traits
    const number = metadata.number || Date.now()
    const originalImageUrl = metadata.imageUrl || metadata.image_url

    if (!originalImageUrl) {
      return NextResponse.json(
        { error: "Original image URL not found in metadata" },
        { status: 404 }
      )
    }

    console.log("[Ascend] Analyzing original image:", originalImageUrl)

    // STEP 1: Analyze the original image using vision API
    const analysisPrompt = `You are analyzing a chibi character image. Your task is to describe EVERY SINGLE DETAIL with EXTREME PRECISION. This analysis will be used to recreate the character EXACTLY, so you must capture EVERYTHING.

ANALYZE THE IMAGE SYSTEMATICALLY - GO THROUGH EACH ELEMENT:

1. BACKGROUND - Describe in EXTREME detail:
   - What is the background scene? Describe EVERY object, element, decoration visible
   - List ALL background objects (candles, skulls, bones, tombstones, etc.) - their exact positions, sizes, colors
   - What are the EXACT colors? Describe each color area specifically (dark blue, purple, etc.)
   - Are there patterns or textures? Describe them precisely
   - What is the lighting? Where does light come from? What areas are lit vs shadowed?
   - What is the mood/atmosphere? Gothic? Spooky? Describe it
   - Are there any decorative borders or frames? Describe them exactly
   - List EVERYTHING visible in the background - nothing should be missed

2. CHARACTER TYPE & BASE FEATURES:
   - What type of character is this? (pumpkin, skull, zombie, vampire, witch, etc.)
   - Describe the head shape and material (pumpkin texture? bone? skin?)
   - What color is the head/face? Exact shades
   - Describe any unique base features (pumpkin stem, bone structure, etc.)

3. ACCESSORIES - Describe EVERY accessory:
   - List EVERY accessory visible on the character
   - For EACH accessory: exact shape, exact colors, exact position (left side? right side? top? bottom?), exact size relative to character, material (metal? fabric? bone?), any patterns or details, how it's attached or positioned

4. EYES - Describe in ULTRA detail:
   - What type of eyes? (glowing? hollow? normal?)
   - EXACT colors (yellow? red? white? etc.)
   - EXACT size and shape (large? small? round? oval?)
   - EXACT position on face (where exactly?)
   - Any special effects? (glow? sparkle? texture?)
   - Spacing between eyes
   - Any reflections or highlights?

5. MOUTH - Describe with maximum detail:
   - What style? (wide grin? fangs? stitched? etc.)
   - EXACT colors
   - EXACT size and shape
   - EXACT position
   - Are teeth visible? How many? What do they look like?
   - What expression? (smiling? snarling? etc.)
   - Any effects around the mouth?

6. HEADWEAR - Describe with extreme precision:
   - Is there headwear? (hat? crown? etc.)
   - If yes: exact design, exact colors, exact positioning, exact size, material, any decorations
   - If no headwear, state "NO HEADWEAR"

7. OUTFIT/CLOTHING - Describe with ULTRA detail:
   - What is the character wearing? Describe EVERY piece
   - EXACT design and style
   - EXACT colors for each part
   - Any patterns? Describe them exactly
   - Fabric texture appearance
   - All visible details (buttons, seams, decorations, etc.)
   - How does it fit?
   - Any rips, tears, or damage?
   - Any accessories attached to outfit?

8. PROPS/ITEMS HELD - Describe with extreme detail:
   - Is the character holding anything? (lantern? scythe? etc.)
   - If yes: EXACT item type and design, EXACT colors, EXACT size, which hand (left or right?), how it's held (grip style, angle), positioning relative to body, any details or decorations on the prop, material appearance
   - If no props, state "NO PROPS HELD"

9. HANDS/ARMS:
   - Describe the hands - are they visible? What do they look like?
   - Any special features? (blood? claws? gloves? etc.)
   - What color are the hands/arms?
   - Position of arms/hands

10. ART STYLE:
    - Proportions (head to body ratio - is head huge?)
    - Linework style (thick black outlines? thin lines?)
    - Color palette used
    - Shading style
    - Overall aesthetic (cute? spooky? etc.)

11. POSITIONING & COMPOSITION:
    - Exact pose (facing forward? side? etc.)
    - Head size relative to body
    - Body positioning
    - Overall composition

12. COLORS - List ALL specific colors:
    - Background colors (list each one)
    - Character colors (head, body, etc.)
    - Accessory colors
    - Prop colors
    - Be VERY specific about shades and tones

13. SURROUNDING ELEMENTS:
    - What objects/elements are around the character? (candles? skulls? bones? etc.)
    - Describe EACH one: what it is, exact position, exact size, exact colors
    - How many of each element?

14. BORDER/FRAME:
    - Is there a decorative border or frame around the image?
    - Describe it exactly: design, colors, patterns, style

CRITICAL: Be EXTREMELY thorough. Describe EVERYTHING you see. Every object, every color, every detail, every position. Nothing should be omitted. This analysis must be complete enough to recreate the character EXACTLY.`

    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: analysisPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: originalImageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    })

    if (!analysisResponse.ok) {
      const error = await analysisResponse.json().catch(() => ({ error: "Failed to analyze image" }))
      console.error("[Ascend] Image analysis error:", error)
      return NextResponse.json({ error: "Failed to analyze original image", details: error }, { status: analysisResponse.status })
    }

    const analysisData = await analysisResponse.json()
    const imageAnalysis = analysisData.choices?.[0]?.message?.content || ""

    console.log("[Ascend] Image analysis completed, length:", imageAnalysis.length)

    // Extract trait information for explicit preservation
    const characterType = traits.characterType || 'unknown'
    const background = traits.background || 'unknown'
    const accessories = traits.accessories || 'unknown'
    const eyes = traits.eyes || 'unknown'
    const mouth = traits.mouth || 'unknown'
    const headwear = traits.headwear || 'unknown'
    const outfits = traits.outfits || 'unknown'
    const props = traits.props || 'unknown'

    // STEP 2: Generate transformation prompt using the analysis
    const uniqueSeed = `ascend-${number}-${transformationType}-${Date.now()}`
    const basePrompt = await generatePrompt(traits, uniqueSeed)
    
    let transformationPrompt = basePrompt

    if (transformationType === 'monster') {
      // Replace character description but keep chibi style
      transformationPrompt = basePrompt.replace(
        /HYPER-DETAILED professional digital illustration, cute cartoonish spooky Halloween character/,
        'HYPER-DETAILED professional digital illustration, INSANE BEAST MONSTER character in chibi style'
      )
      // Keep chibi proportions but add beast-like features
      transformationPrompt = transformationPrompt.replace(
        /ART STYLE: Professional vector-like quality, chibi proportions with HUGE head, ENORMOUS eyes/,
        'ART STYLE: Professional vector-like quality, CHIBI proportions with HUGE head, ENORMOUS eyes, but with INSANE BEAST features: massive muscular chibi body, twisted limbs, sharp claws, fangs, glowing menacing eyes, demonic beast features, INSANE and TERRIFYING presence, still maintaining cute chibi aesthetic but with beast-like horror elements'
      )
      
      // Enhance the trait preservation section
      transformationPrompt = transformationPrompt.replace(
        /TRAIT CONSISTENCY: Same traits = IDENTICAL design\/color\/size\/positioning across all characters. NO variation./,
        'TRAIT CONSISTENCY: CRITICAL - ALL TRAITS MUST BE PRESERVED EXACTLY: Same traits = IDENTICAL design/color/size/positioning. The monster transformation MUST keep the EXACT same background, accessories, eyes, mouth, headwear, outfits, and props. NO variation in traits.'
      )
      
      // Add image analysis and transformation instructions
      transformationPrompt += `\n\nORIGINAL IMAGE ANALYSIS:
${imageAnalysis}

FERAL BEAST MONSTER TRANSFORMATION: Based on the EXTREMELY DETAILED analysis above, transform this character into an INTENSE, MENACING, FERAL BEAST MONSTER in CHIBI STYLE while PRESERVING ALL TRAITS EXACTLY AS DESCRIBED IN THE ANALYSIS. The beast should be fierce, wild, and intimidating - covered in dark energy, weathered texture, and corruption effects.

FERAL BEAST TRANSFORMATION DETAILS - CREATE A MENACING, INTENSE BEAST:
The character becomes a FERAL, MENACING BEAST CHIBI with:
- MASSIVE muscular chibi body (still chibi proportions but POWERFUL and INTENSE) - broad shoulders, bulging muscles, exaggerated proportions, twisted physique
- TWISTED, DYNAMIC limbs showing beast-like strength - arms bent at aggressive angles, bulging muscles, visible sinews and tendons, powerful proportions
- RAZOR-SHARP MENACING claws on hands and feet - long, curved, weathered claws with dark stains, cracked and jagged, menacing, with dark marks, visible detail on each claw
- INTENSE fangs and MENACING beast-like teeth - multiple sharp, darkened, jagged teeth visible, drooling dark saliva, menacing snarl, powerful jaw, visible gums
- GLOWING menacing eyes - intense red/orange glow, fierce, with visible energy/glow effects, menacing expression, wild and feral look
- DARK ENERGY aura - visible dark energy waves, shadowy particles, infernal glow, corrupted energy, dark mist effects (visually represented)
- SHADOWY TENDRILS - dark energy tendrils extending from the character, dripping with dark energy, dynamic and menacing
- CORRUPTED BEAST appearance - dark veins visible pulsing, corrupted and weathered skin texture, dark markings, demonic patterns, patches of fur/skin showing wear, exposed areas with dark energy
- MENACING features - matted fur/hair, visible scars and dark marks, dark energy effects, exposed teeth through weathered areas, drooling dark energy, weathered appearance
- WEATHERED skin texture - mottled, darkened, with patches showing wear, visible texture details, dark growths, intense texture
- INSANE and TERRIFYING presence - wild, feral expression, aggressive posture, powerful stance, completely unhinged
- WILD FERAL expression - snarling, drooling dark energy, menacing, intense, showing beast nature, completely savage
- MENACING BEAST-LIKE posture - hunched, ready to pounce, powerful, dynamic, intense, showing raw animalistic ferocity
- WEATHERED APPEARANCE - visible dark stains, grime effects, matted fur/hair, intense weathered look

QUALITY REQUIREMENTS - INTENSE AND MENACING:
- HYPER-DETAILED rendering - every claw, every tooth, every intense detail visible - dark marks, weathered areas, dark energy effects, weathered texture
- PROFESSIONAL quality - gallery-worthy, polished, but INTENSE and MENACING
- DRAMATIC lighting - multiple light sources, rim lighting on claws and fangs, dramatic shadows highlighting menacing features
- RICH COLORS - deep, saturated colors, high contrast, vibrant effects, with INTENSE tones - dark greens, deep oranges, dark reds, mottled dark browns
- INTENSE DETAIL - visible weathered texture on skin (dark marks, weathered areas, dark energy), detailed weathered claws, intricate energy effects, visible dark energy and weathered appearance
- CINEMATIC QUALITY - movie-quality rendering, impressive and amazing, but INTENSE and MENACING
- MENACING ELEMENTS - dark energy drool, dark mist effects, dark stains, weathered texture, dark energy effects, exposed areas with dark energy, matted fur/hair, all rendered in detail

MAINTAIN CHIBI AESTHETIC: huge head, enormous eyes, cute but SCARY chibi proportions, bold black outlines, chibi-style rendering, but with AMAZING beast features.

CRITICAL REQUIREMENTS - PRESERVE FROM ANALYSIS (EXACT MATCH - READ THE ANALYSIS CAREFULLY):

CHARACTER TYPE: The character type from the analysis MUST be preserved. If it's a pumpkin head, it stays a pumpkin head (just beast-like). If it's a skull, it stays a skull (just beast-like). The base character type does NOT change - only the form becomes beast-like.

SURROUNDING ELEMENTS: ALL surrounding elements from the analysis MUST appear - candles, skulls, bones, etc. Each element must be in the SAME position, SAME size, SAME colors as described in the analysis. If the analysis says "2 candles on left, 3 skulls on right", you must include exactly that.

BACKGROUND: Use the EXACT background described in the analysis. Same scene, same elements, same composition, same colors, same lighting, same atmospheric effects, same patterns, same textures. EVERY detail must match exactly.

BORDER/FRAME: If the analysis describes a border or frame, it must appear EXACTLY as described - same design, same colors, same style.

ACCESSORIES: Use the EXACT accessories described in the analysis. Same design, same colors, same positioning (left/right/top/bottom as specified), same size, same material appearance (just maybe darker/corrupted with dark energy but clearly recognizable as the same).

EYES: Use the EXACT eyes described in the analysis. Same eye type, same design, same colors, same positioning, same size (just enhanced with menacing glow/energy but recognizable as the same eye type from analysis).

MOUTH: Use the EXACT mouth described in the analysis. Same mouth style, same design, same positioning, same expression (just transformed with beast fangs/teeth but recognizable as the same mouth style from analysis).

HEADWEAR: Use the EXACT headwear described in the analysis (or if analysis says "NO HEADWEAR", then no headwear). Same design, same colors, same appearance, positioned identically, same size (maybe with dark energy effects but clearly the same).

OUTFIT: Use the EXACT outfit described in the analysis. Same design, same style, same colors, same details, same patterns (just corrupted/torn with dark energy but clearly recognizable as the same outfit).

PROPS: Use the EXACT props described in the analysis (or if analysis says "NO PROPS HELD", then no props). Same prop design, same colors, same appearance, held identically in the same hand (left or right as specified), same positioning (maybe with dark energy effects but clearly the same prop).

HANDS/ARMS: Use the EXACT hands/arms described in the analysis. Same appearance, same colors, same features (blood? claws? etc.), same positioning.

The beast must be recognizable as the SAME chibi character with ALL the same traits from the analysis, just transformed into an AMAZING, HIGH-QUALITY monster beast form while keeping chibi style. The character type, surrounding elements, background, and ALL traits must match the analysis EXACTLY.`
      
      // Add final reinforcement with explicit trait list
      transformationPrompt += `\n\nCRITICAL REMINDER: Reference the ORIGINAL IMAGE ANALYSIS above. The transformed image MUST match ALL traits described in that analysis EXACTLY. Background="${background}", Accessories="${accessories}", Eyes="${eyes}", Mouth="${mouth}", Headwear="${headwear}", Outfit="${outfits}", Props="${props}". 

CREATE AN INTENSE, MENACING, FERAL BEAST: The transformation should be INCREDIBLE, IMPRESSIVE, INTENSE, and MENACING. Every detail should be rendered with maximum quality - weathered sharp claws, detailed drooling dark energy fangs, impressive but intense muscles, dramatic lighting highlighting menacing features, rich but dark colors, cinematic quality. This should look like a PROFESSIONAL, GALLERY-WORTHY piece of art that is also INTENSE and MENACING. The beast should be fierce, wild, and intimidating - matted fur, dark energy effects, weathered areas, dark energy drool, weathered texture, dark energy effects, all rendered in high detail.

MAINTAIN CHIBI STYLE throughout: huge head, enormous eyes, chibi proportions, bold black outlines. The transformation only changes the CHARACTER FORM to an AMAZING beast-like form in chibi style, but ALL TRAITS from the analysis remain exactly the same.`
      
    } else if (transformationType === 'angel') {
      // Replace character description but keep chibi style
      transformationPrompt = basePrompt.replace(
        /HYPER-DETAILED professional digital illustration, cute cartoonish spooky Halloween character/,
        'HYPER-DETAILED professional digital illustration, DIVINE ANGELIC character in chibi style'
      )
      // Keep chibi proportions but add angelic features
      transformationPrompt = transformationPrompt.replace(
        /ART STYLE: Professional vector-like quality, chibi proportions with HUGE head, ENORMOUS eyes/,
        'ART STYLE: Professional vector-like quality, CHIBI proportions with HUGE head, ENORMOUS eyes, but with DIVINE ANGELIC features: graceful chibi proportions, glowing heavenly eyes, ethereal features, angelic presence, divine light, still maintaining cute chibi aesthetic but with celestial divine elements'
      )
      
      // Enhance the trait preservation section
      transformationPrompt = transformationPrompt.replace(
        /TRAIT CONSISTENCY: Same traits = IDENTICAL design\/color\/size\/positioning across all characters. NO variation./,
        'TRAIT CONSISTENCY: CRITICAL - ALL TRAITS MUST BE PRESERVED EXACTLY: Same traits = IDENTICAL design/color/size/positioning. The angel transformation MUST keep the EXACT same background, accessories, eyes, mouth, headwear, outfits, and props. NO variation in traits.'
      )
      
      // Add image analysis and transformation instructions
      transformationPrompt += `\n\nORIGINAL IMAGE ANALYSIS:
${imageAnalysis}

AMAZING HIGH-QUALITY DIVINE ANGEL TRANSFORMATION: Based on the EXTREMELY DETAILED analysis above, transform this character into an INCREDIBLE, AMAZING, HIGH-QUALITY DIVINE ANGEL in CHIBI STYLE while PRESERVING ALL TRAITS EXACTLY AS DESCRIBED IN THE ANALYSIS.

ANGEL TRANSFORMATION DETAILS - CREATE AN AMAZING, IMPRESSIVE ANGEL:
Add these INCREDIBLE angelic features:
- LARGE FEATHERED WINGS (chibi-style) - beautiful, detailed feathers, graceful curve, impressive size, visible feather texture, soft glow
- DIVINE HALO (glowing above head) - bright, radiant, circular or ornate design, visible light rays, heavenly glow
- GLOWING AURA - soft, ethereal light surrounding the character, gentle particles, divine energy visible
- HEAVENLY LIGHT - warm, golden light from above, soft rays, atmospheric lighting
- GRACEFUL CHIBI features - elegant, divine, ethereal appearance
- ETHEREAL APPEARANCE - otherworldly, divine, beautiful

QUALITY REQUIREMENTS:
- HYPER-DETAILED rendering - every feather visible, detailed halo, intricate light effects
- PROFESSIONAL quality - gallery-worthy, polished, impressive
- DRAMATIC lighting - heavenly light sources, soft rim lighting on wings, dramatic but gentle shadows
- RICH COLORS - warm, golden colors, soft pastels, vibrant but gentle effects
- INTENSE DETAIL - visible feather texture, detailed halo design, intricate light particles
- CINEMATIC QUALITY - movie-quality rendering, impressive and amazing

MAINTAIN CHIBI AESTHETIC: huge head, enormous eyes, cute chibi proportions, bold black outlines, chibi-style rendering, but with AMAZING angelic features.

CRITICAL REQUIREMENTS - PRESERVE FROM ANALYSIS (EXACT MATCH - READ THE ANALYSIS CAREFULLY):

CHARACTER TYPE: The character type from the analysis MUST be preserved. If it's a pumpkin head, it stays a pumpkin head (just angelic). If it's a skull, it stays a skull (just angelic). The base character type does NOT change - only gains angelic features.

SURROUNDING ELEMENTS: ALL surrounding elements from the analysis MUST appear - candles, skulls, bones, etc. Each element must be in the SAME position, SAME size, SAME colors as described in the analysis. If the analysis says "2 candles on left, 3 skulls on right", you must include exactly that.

BACKGROUND: Use the EXACT background described in the analysis. Same scene, same elements, same composition, same colors, same lighting, same atmospheric effects, same patterns, same textures. EVERY detail must match exactly.

BORDER/FRAME: If the analysis describes a border or frame, it must appear EXACTLY as described - same design, same colors, same style.

ACCESSORIES: Use the EXACT accessories described in the analysis. Same design, same colors, same positioning (left/right/top/bottom as specified), same size, same material appearance (just enhanced with divine glow/light but clearly recognizable as the same).

EYES: Use the EXACT eyes described in the analysis. Same eye type, same design, same colors, same positioning, same size (just enhanced with heavenly glow/light but recognizable as the same eye type from analysis).

MOUTH: Use the EXACT mouth described in the analysis. Same mouth style, same design, same positioning, same expression (maybe with gentle divine glow but clearly the same mouth style from analysis).

HEADWEAR: Use the EXACT headwear described in the analysis (or if analysis says "NO HEADWEAR", then no headwear). Same design, same colors, same appearance, positioned identically, same size (maybe with divine light effects but clearly the same).

OUTFIT: Use the EXACT outfit described in the analysis. Same design, same style, same colors, same details, same patterns (just enhanced with lighter/divine appearance but clearly recognizable as the same outfit).

PROPS: Use the EXACT props described in the analysis (or if analysis says "NO PROPS HELD", then no props). Same prop design, same colors, same appearance, held identically in the same hand (left or right as specified), same positioning (maybe with divine glow but clearly the same prop).

HANDS/ARMS: Use the EXACT hands/arms described in the analysis. Same appearance, same colors, same features, same positioning.

The angel must be recognizable as the SAME chibi character with ALL the same traits from the analysis, just transformed into an AMAZING, HIGH-QUALITY angelic form while keeping chibi style. The character type, surrounding elements, background, and ALL traits must match the analysis EXACTLY.`
      
      // Add final reinforcement with explicit trait list
      transformationPrompt += `\n\nCRITICAL REMINDER: Reference the ORIGINAL IMAGE ANALYSIS above. The transformed image MUST match ALL traits described in that analysis EXACTLY. Background="${background}", Accessories="${accessories}", Eyes="${eyes}", Mouth="${mouth}", Headwear="${headwear}", Outfit="${outfits}", Props="${props}". 

CREATE AN AMAZING, IMPRESSIVE, HIGH-QUALITY ANGEL: The transformation should be INCREDIBLE, IMPRESSIVE, and AMAZING. Every detail should be rendered with maximum quality - detailed feathers, beautiful halo, soft light effects, dramatic lighting, rich colors, cinematic quality. This should look like a PROFESSIONAL, GALLERY-WORTHY piece of art.

MAINTAIN CHIBI STYLE throughout: huge head, enormous eyes, chibi proportions, bold black outlines. The transformation only adds AMAZING angelic features (wings, halo, aura) in chibi style, but ALL TRAITS from the analysis remain exactly the same.`
    }

    // Generate the image
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: transformationPrompt,
        n: 1,
        size: "1024x1024",
        quality: "high",
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to generate image" }))
      return NextResponse.json({ error: "Failed to generate image", details: error }, { status: response.status })
    }

    const data = await response.json()
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json

    if (!imageUrl) {
      return NextResponse.json({ error: "No image data returned" }, { status: 500 })
    }

    // Download and upload image
    let imageBlob: Blob
    if (imageUrl.startsWith("http")) {
      const imageResponse = await fetch(imageUrl)
      imageBlob = await imageResponse.blob()
    } else {
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "")
      if (!base64Data || base64Data.trim() === "") {
        throw new Error("Invalid base64 image data: empty or missing")
      }
      const buffer = Buffer.from(base64Data, "base64")
      imageBlob = new Blob([buffer], { type: "image/png" })
    }

    const filename = `ascend-${transformationType}-${number}-${Date.now()}.png`
    const blob = await put(filename, imageBlob, {
      access: "public",
      addRandomSuffix: false,
    })

    return NextResponse.json({
      imageUrl: blob.url,
      transformationType,
      originalTraits: traits,
      prompt: transformationPrompt,
    })
  } catch (error) {
    console.error("[Ascend] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to transform ordinal",
      },
      { status: 500 }
    )
  }
}

