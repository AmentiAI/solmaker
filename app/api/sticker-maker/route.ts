import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { hasEnoughCredits, deductCredits, secureAddCreditsForRefund } from "@/lib/credits/credits"

const MAX_FILE_SIZE = 12 * 1024 * 1024 // 12MB
const MAX_IMAGES = 4 // Maximum number of images that can be uploaded
const CREDITS_PER_STICKER = 1.5 // Credits required per sticker generation

function bufferToBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64")
}

async function downloadImageToBlob(urlOrBase64: string) {
  if (!urlOrBase64 || urlOrBase64.trim() === "") {
    throw new Error("Invalid image URL or base64 data: empty or missing")
  }
  
  if (urlOrBase64.startsWith("http")) {
    const response = await fetch(urlOrBase64)
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.statusText}`)
    }
    return await response.blob()
  }

  const base64Data = urlOrBase64.replace(/^data:image\/\w+;base64,/, "")
  if (!base64Data || base64Data.trim() === "") {
    throw new Error("Invalid base64 image data: empty or missing")
  }
  const buffer = Buffer.from(base64Data, "base64")
  return new Blob([buffer], { type: "image/png" })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const walletAddress = formData.get("wallet_address") as string | null
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required." },
        { status: 400 }
      )
    }

    // Check credit cost
    const creditsNeeded = CREDITS_PER_STICKER

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(walletAddress, creditsNeeded)
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate a sticker. Please purchase credits.` },
        { status: 402 } // 402 Payment Required
      )
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY." },
        { status: 500 },
      )
    }
    
    const imageCount = parseInt(formData.get("imageCount") as string) || 1
    
    // Enforce maximum image limit
    if (imageCount > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES} images allowed. You selected ${imageCount} images.` },
        { status: 400 }
      )
    }
    
    // Get all images
    const files: File[] = []
    if (imageCount > 1) {
      for (let i = 0; i < imageCount; i++) {
        const file = formData.get(`image${i}`)
        if (file && file instanceof File) {
          files.push(file)
        }
      }
    } else {
      const file = formData.get("image") || formData.get("image0")
      if (file && file instanceof File) {
        files.push(file)
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "At least one image file is required." }, { status: 400 })
    }

    // Validate all files
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: `"${file.name}" is not a valid image file.` }, { status: 400 })
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" is too large. Maximum supported size is 12MB.` },
          { status: 400 },
        )
      }
    }

    console.log("[sticker-maker] Received images:", files.length)

    // Deduct credits IMMEDIATELY before generation starts
    const creditDeducted = await deductCredits(
      walletAddress,
      creditsNeeded,
      `Generating sticker with ${files.length} image${files.length > 1 ? 's' : ''}`
    )

    if (!creditDeducted) {
      return NextResponse.json(
        { error: "Failed to deduct credits. Please try again." },
        { status: 500 }
      )
    }

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const baseFile = files[0]
    const extension = baseFile.name?.split(".").pop()?.toLowerCase() || "png"

    const instructions = formData.get("instructions")
    const instructionText =
      typeof instructions === "string"
        ? instructions.trim()
        : instructions instanceof File
          ? await instructions.text().then((text) => text.trim())
          : ""

    const backgroundModeRaw = formData.get("backgroundMode")
    const backgroundMode =
      backgroundModeRaw === "transparent" ? "transparent" : "original"

    // Prepare base file for upload (first image)
    const baseArrayBuffer = await baseFile.arrayBuffer()
    const baseUint8 = new Uint8Array(baseArrayBuffer)
    const baseOriginalFileForUpload = new File(
      [baseUint8],
      baseFile.name || `upload-${uniqueSuffix}.${extension}`,
      { type: baseFile.type },
    )

    const originalUpload = await put(`sticker-maker/original-${uniqueSuffix}.${extension}`, baseOriginalFileForUpload, {
      access: "public",
      addRandomSuffix: false,
    })

    // STEP 1: Analyze all images individually using OpenAI vision - ONE BY ONE
    console.log(`[sticker-maker] Analyzing ${files.length} image(s) individually, one by one...`)
    const analysisPromises = files.map(async (file, index) => {
      console.log(`[sticker-maker] Analyzing image ${index + 1} of ${files.length}...`)
      const arrayBuffer = await file.arrayBuffer()
      const base64 = bufferToBase64(arrayBuffer)
      const dataUrl = `data:${file.type};base64,${base64}`

      const analysisPrompt = `CRITICAL: Analyze THIS SPECIFIC IMAGE (Image ${index + 1}${files.length > 1 ? ` of ${files.length}` : ''}) in EXTREME, PAINSTAKING, EXHAUSTIVE detail with MAXIMUM PRECISION. 

IMPORTANT: You are analyzing ONE image at a time. Focus ONLY on this specific image. Analyze it completely and thoroughly before moving on. This image will be analyzed separately from other images, so capture EVERY detail of THIS image. 

${files.length > 1 ? `CRITICAL: This is Image ${index + 1} of ${files.length} total images. Each image is being analyzed SEPARATELY, ONE BY ONE. You are currently analyzing ONLY this image. Analyze it with MAXIMUM detail and precision. Every character, every detail, every element in THIS image must be captured completely. After all images are analyzed separately, they will be combined. For now, focus ONLY on analyzing THIS image perfectly.` : ''}

MANDATE: Describe EVERYTHING you see with ABSOLUTE MAXIMUM precision. This analysis will be used to recreate elements with PIXEL-PERFECT ACCURACY, so be EXTREMELY, EXHAUSTIVELY thorough. NO detail is too small to mention. NO element should be overlooked. NO feature should be omitted. Describe EVERY pixel-level detail, EVERY color variation, EVERY texture nuance, EVERY proportion, EVERY positioning detail.

1. ART STYLE - Describe in EXHAUSTIVE, EXTREME detail:
   - What type of art style? (realistic? cartoon? chibi? digital art? painting? vector? illustration? anime? western? etc.) - Be SPECIFIC
   - What are the specific characteristics? (thick outlines? thin lines? smooth? textured? cel-shaded? soft-shaded? etc.) - Describe EXACTLY
   - How is it rendered? (flat colors? gradients? shading style? cell shading? soft shading? etc.) - Be PRECISE
   - What makes this style unique? - List ALL unique characteristics
   - Describe the linework in EXTREME detail: line thickness, line style, line color, line quality
   - Describe brush strokes/rendering technique: stroke direction, stroke size, stroke texture, rendering method
   - Describe any stylistic effects: glows, shadows, highlights, filters, effects
   - What is the overall rendering quality? (high detail? low detail? etc.)

2. COLORS - List EVERY SINGLE color with ABSOLUTE SPECIFIC details:
   - What is the overall color palette? (warm? cool? bright? muted? pastel? vibrant? etc.) - Be SPECIFIC
   - What colors dominate? List EVERY SPECIFIC color with hex codes if possible (e.g., "bright red #FF0000", "deep blue #000080", "pale yellow #FFFF99")
   - For EACH character/subject: List EVERY color used - skin tone (exact shade), hair color (exact shade), eye color (exact shade), clothing colors (EACH piece separately), accessory colors (EACH item separately)
   - What colors are used for background? List EVERY color - primary background color, secondary colors, accent colors, gradient colors
   - What colors are used for details/accessories? List EVERY color for EVERY detail
   - Are there any color schemes or patterns? Describe EXACTLY
   - Describe color gradients: where they appear, what colors transition, direction of gradient
   - Describe shadows: shadow colors, shadow intensity, shadow placement
   - Describe highlights: highlight colors, highlight intensity, highlight placement
   - List ALL color variations, tints, shades, tones used throughout the image

3. COMPOSITION - Describe with ABSOLUTE PRECISION:
   - What is the layout? (centered? off-center? rule of thirds? etc.) - Give EXACT positioning
   - What is the focal point? Where is it positioned? (exact X/Y coordinates or percentage from edges)
   - How are elements arranged? (symmetrical? asymmetrical? balanced? etc.) - Describe EXACTLY
   - What is the perspective? (front view? side view? 3/4 view? top-down? etc.) - Be SPECIFIC
   - What is the camera angle? (eye level? bird's eye? worm's eye? tilted? etc.) - Give EXACT angle if possible
   - What is the aspect ratio? (square? wide/landscape? tall/portrait? etc.) - Give EXACT ratio
   - How much empty space is around the character/subject? (exact measurements or percentages)
   - What is the depth of field? (shallow? deep? etc.)
   - What is the framing? (tight? loose? etc.)

4. CHARACTERS/SUBJECTS - Describe EVERY SINGLE DETAIL (CRITICAL - THIS IS THE MOST IMPORTANT SECTION):
   ${files.length > 1 ? `   - CRITICAL: This character will be combined with other characters. Describe EVERY SINGLE DETAIL so this character can be recreated with PIXEL-PERFECT ACCURACY.` : ''}
   - What characters or main subjects are visible? List EACH one separately with FULL details.
   - For EACH character: Describe in EXHAUSTIVE, EXTREME detail:
     * FACE (describe EVERY facial feature):
       - Eye color (EXACT shade), eye shape (almond? round? etc.), eye size (relative to face), eye position, eye spacing, eyelid details, eyelash details, iris details, pupil details
       - Eyebrow shape, eyebrow color, eyebrow thickness, eyebrow position, eyebrow style
       - Nose shape, nose size, nose position, nose details (nostrils, bridge, etc.)
       - Mouth shape, mouth size, mouth position, lip color, lip thickness, expression details
       - Face shape (round? oval? square? etc.), face proportions, face size relative to body
       - Skin tone (EXACT shade), skin texture, skin details (freckles? blemishes? etc.)
       - Any facial markings, scars, tattoos, piercings - describe EXACTLY
       - Cheek details, chin details, jawline details
       - Any facial hair - describe EXACTLY
     * HAIR (describe EVERY hair detail):
       - Color (EXACT shade), style (EXACT description), length (EXACT measurement or relative), texture, volume
       - Hair part (where? how styled?), hair direction, hair flow
       - Any accessories in hair (clips? bands? etc.) - describe EACH one
       - Hair highlights/shadows - describe EXACTLY where and what colors
       - Hair details: bangs? layers? curls? waves? etc. - describe EXACTLY
     * BODY (describe EVERY body detail):
       - Body type (slim? muscular? etc.), height (relative to image), proportions (head to body ratio, etc.)
       - Pose (EXACT description), stance, body position, body angle
       - Arm position, hand position, finger details, leg position, foot position
       - Body proportions: shoulder width, waist size, hip size, limb lengths - describe EXACTLY
       - Any body markings, scars, tattoos - describe EXACTLY
     * CLOTHING (describe EVERY piece of clothing in EXTREME detail):
       - Shirt/top: color (EXACT), style, fit, texture, patterns, designs, logos, text, buttons, zippers, pockets, sleeves, collar, etc.
       - Pants/bottom: color (EXACT), style, fit, texture, patterns, designs, pockets, cuffs, etc.
       - Shoes/footwear: color (EXACT), style, type, details, laces, soles, etc.
       - Outerwear: color (EXACT), style, texture, details, etc.
       - Underwear/underlayers: if visible, describe EXACTLY
       - Describe EVERY pattern, design, logo, text, graphic on clothing
       - Describe clothing fit: tight? loose? etc.
       - Describe clothing wrinkles, folds, creases - where they appear
     * ACCESSORIES (List EVERY accessory with FULL details):
       - Jewelry: type, material, color, size, position, details
       - Bags/purses: type, color, material, size, position, details
       - Weapons/tools: type, color, material, size, position, details
       - Props: EVERY prop, color, material, size, position, details
       - Hats/caps: type, color, style, position, details
       - Glasses/sunglasses: type, color, style, position, details
       - ANY other accessories - describe EACH one in FULL detail
     * POSITIONING: Where is the character positioned? (left? right? center? exact coordinates or percentages)
     * SIZE: How large is the character relative to the image? (exact percentage or measurements)
     * EXPRESSION: Facial expression (EXACT description), body language, mood, emotion
     * UNIQUE FEATURES: ANY unique characteristics, markings, scars, tattoos, piercings, etc. - describe EXACTLY
     * ANATOMY: Describe any visible anatomy details - muscle definition, body structure, etc.
   - List EVERY visible detail about each character/subject - NOTHING should be omitted. Describe even the smallest details.

5. BACKGROUND - Describe EVERY SINGLE element:
   - What is the background? Describe it in EXHAUSTIVE detail
   - What elements are visible? (objects, scenery, patterns, textures, etc.) - List EVERYTHING, even small details
   - What colors is the background? List EVERY color with EXACT shades
   - How detailed is the background? (high detail? simple? etc.)
   - List EVERYTHING visible in the background - NO detail is too small
   - Describe background objects: type, color, size, position, details
   - Describe background patterns: type, color, size, repetition, details
   - Describe background textures: type, appearance, details
   - Describe any background effects: fog, particles, light rays, etc.

6. LIGHTING - Describe with ABSOLUTE PRECISION:
   - Where does light come from? (top? side? front? back? etc.) - Be SPECIFIC about angle and direction
   - What is the lighting style? (dramatic? soft? harsh? natural? etc.) - Be SPECIFIC
   - What areas are lit? Describe EXACTLY which parts are lit and how bright
   - What areas are shadowed? Describe EXACTLY which parts are shadowed and how dark
   - Describe shadow shapes: EXACT shape, position, intensity, color, softness/hardness
   - Describe highlight shapes: EXACT shape, position, intensity, color
   - What is the mood created by lighting? - Be SPECIFIC
   - Are there multiple light sources? Describe EACH one: position, color, intensity, type
   - Describe any rim lighting, back lighting, fill lighting - EXACT details
   - Describe light falloff: how light fades across surfaces

7. TEXTURE/DETAILS - Describe in EXHAUSTIVE detail:
   - What textures are visible? (smooth? rough? fabric? metal? skin? etc.) - Describe EACH texture EXACTLY
   - How detailed is the image? (high detail? simple? etc.) - Be SPECIFIC
   - What specific details are visible? List them ALL - NO detail is too small
   - Describe surface details: scratches, wear, patterns, etc.
   - Describe material properties: reflectivity, roughness, smoothness, etc.
   - Describe any visible imperfections, wear, aging, etc.
   - Describe any fine details: stitching, seams, edges, borders, etc.

8. PROPORTIONS & MEASUREMENTS:
   - Describe EXACT proportions: head size relative to body, limb lengths, feature sizes, etc.
   - Describe EXACT measurements if possible: character height relative to image, object sizes, etc.
   - Describe EXACT spacing: between elements, margins, padding, etc.

9. EDGES & OUTLINES:
   - Describe edge quality: sharp? soft? etc.
   - Describe outline style: thick? thin? colored? etc.
   - Describe edge details: anti-aliasing, pixelation, etc.

10. OVERALL AESTHETIC:
   - What is the overall feel/mood? - Be SPECIFIC
   - What makes this image unique? - List ALL unique characteristics
   - Any other notable characteristics? - List EVERYTHING
   - Describe the overall quality: professional? amateur? etc.

${files.length > 1 ? `CRITICAL REMINDER: This character will be combined with ${files.length - 1} other character(s). Your analysis must be EXHAUSTIVELY detailed enough to recreate this character with PIXEL-PERFECT ACCURACY, with ALL its unique features, colors, clothing, accessories, proportions, textures, and details preserved. Every detail matters equally. NO detail should be omitted.` : ''}

FINAL MANDATE: Be EXTREMELY, EXHAUSTIVELY detailed and specific. Capture EVERYTHING. This analysis must be COMPLETE enough to recreate elements with PIXEL-PERFECT ACCURACY. NO detail should be omitted. NO feature should be overlooked. Describe even the smallest, most minute details. The more detail, the better.`

      const descriptionRequest = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a professional art director and visual analyst with exceptional attention to detail. Your task is to produce EXHAUSTIVE, COMPREHENSIVE scene breakdowns with ABSOLUTE MAXIMUM attention to every single detail. Be EXTREMELY thorough, descriptive, and precise. NO detail is too small to mention. NO element should be overlooked. Your analysis must be complete enough to recreate the image with pixel-perfect accuracy. Describe every color, every texture, every proportion, every positioning detail, every feature, every accessory, every element visible in the image.",
            },
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
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 4000,
        }),
      })

      if (!descriptionRequest.ok) {
        const errorData = await descriptionRequest.json().catch(() => null)
        throw new Error(`Failed to analyze image ${index + 1}: ${errorData?.error?.message || 'Unknown error'}`)
      }

      const descriptionData = await descriptionRequest.json()
      const analysisChoice = descriptionData?.choices?.[0]?.message?.content

      let analysis = ""
      if (Array.isArray(analysisChoice)) {
        analysis = analysisChoice
          .map((item: { type?: string; text?: string }) => (item.type === "text" ? item.text : ""))
          .filter(Boolean)
          .join("\n\n")
      } else if (typeof analysisChoice === "string") {
        analysis = analysisChoice
      }

      if (!analysis || !analysis.trim()) {
        throw new Error(`Failed to extract description from image ${index + 1}`)
      }

      return {
        index: index + 1,
        analysis: analysis.trim(),
        file,
      }
    })

    // Analyze all images ONE BY ONE - wait for each analysis to complete
    console.log(`[sticker-maker] Processing ${files.length} image(s) - analyzing each one individually...`)
    const analyses = await Promise.all(analysisPromises)
    const baseAnalysis = analyses[0].analysis
    
    console.log(`[sticker-maker] All ${analyses.length} images analyzed individually. Combining analyses...`)
    
    // Combine all analyses with clear separators - ensure equal importance
    // Each image was analyzed separately, so each analysis is complete and detailed
    const allAnalysesText = analyses.map(a => {
      return `\n${"=".repeat(80)}\nIMAGE ${a.index} ANALYSIS (Analyzed Separately - Complete Details)\n${files.length > 1 ? `This image was analyzed individually as Image ${a.index} of ${files.length} total images.` : 'This is the reference image.'}\n${"=".repeat(80)}\n\n${a.analysis}\n\n${"=".repeat(80)}\nEND OF IMAGE ${a.index} ANALYSIS (Complete)\n${"=".repeat(80)}\n`
    }).join("\n\n")

    console.log("[sticker-maker] All individual analyses complete. Total analyses:", analyses.length)

    // If multiple images are provided, ALWAYS use multi-character mode to analyze all images
    // Only use single-image mode if exactly 1 image is provided
    const isMultiCharacter = files.length > 1
    
    console.log(`[sticker-maker] Multi-character mode: ${isMultiCharacter} (${files.length} image(s) provided)`)
    
    if (isMultiCharacter) {
      console.log(`[sticker-maker] Will combine ALL ${files.length} images into one sticker`)
    }

    // STEP 2: Generate sticker using image generation API
    const chromaticPrompt = [
      "CRITICAL: ABSOLUTELY NO WHITE OUTLINES OR BORDERS - Characters must have ZERO outlines, borders, white borders, white outlines, or any type of border/outline of any color. Use ONLY natural color transitions and anti-aliasing for edges.",
      "",
      isMultiCharacter 
        ? `MULTI-CHARACTER MODE: Create ONE SUPER HIGH-QUALITY sticker image containing ALL characters from ALL ${files.length} reference images. Each character must be recognizable and match their original analysis with PIXEL-PERFECT ACCURACY. Remake each character EXACTLY as they appear in their reference image - no alterations, no simplifications. NO white outlines, NO white borders, NO outlines of any kind.`
        : "STICKER MODE: Recreate the supplied reference image as a SUPER HIGH-QUALITY, PROFESSIONAL-GRADE sticker with MAXIMUM ACCURACY. Accurately remake the character(s) EXACTLY as they appear in the reference - matching their appearance, features, colors, clothing, accessories, proportions, poses, and every detail with PIXEL-PERFECT PRECISION. Match composition, framing, camera angle, poses, props, lighting direction, colors, textures, and overall scene layout with PIXEL-PERFECT PRECISION. NO white outlines, NO white borders, NO outlines of any kind.",
      isMultiCharacter
        ? `CRITICAL ACCURACY REQUIREMENT: Include EVERY character described in the analyses below with ABSOLUTE PRECISION. Each character must maintain their ORIGINAL design, features, colors, clothing, accessories, proportions, and details EXACTLY as described in their respective analysis. ALL characters are EQUALLY IMPORTANT - preserve each one with IDENTICAL levels of detail, quality, and accuracy. NO SIMPLIFICATION, NO APPROXIMATION - ONLY EXACT REPLICATION.`
        : "ABSOLUTE ACCURACY MANDATE: Do NOT invent, alter, approximate, or simplify any elements unless explicitly requested. No new objects, no removed objects, no pose changes, no camera shifts, no color shifts, no detail loss. Keep the entire silhouette, environment, arrangement, proportions, colors, textures, and every detail IDENTICAL to the original with MAXIMUM FIDELITY.",
      isMultiCharacter
        ? `EQUAL PRESERVATION RULE: Each character from each analysis must be preserved with EQUAL attention to detail and QUALITY. Character 1's details are just as important as Character 2's details, Character 3's details, etc. Do not favor one character over another. Each character must be clearly visible, distinct, recognizable, and match their analysis with PIXEL-PERFECT ACCURACY. Maintain professional quality for ALL characters.`
        : "PRESERVE WITH MAXIMUM FIDELITY: Maintain original materials, colors (exact hex values), textures, lighting relationships, proportions, and every visual detail unless user instructions below specify otherwise. Every element must be rendered with PROFESSIONAL QUALITY and ACCURACY.",
      isMultiCharacter
        ? "Apply any transformation instructions to EACH character while preserving their core design, features, colors, clothing, accessories, and details from their analysis with MAXIMUM ACCURACY. Maintain professional quality throughout."
        : "Ensure facial expressions, clothing details, environmental elements, textures, colors, and every visual aspect remains FAITHFUL to the reference image with PROFESSIONAL-GRADE ACCURACY.",
      "",
      "=".repeat(80),
      isMultiCharacter ? `ALL ${files.length} IMAGE ANALYSES (EACH IMAGE WAS ANALYZED SEPARATELY, ONE BY ONE - READ CAREFULLY):` : "REFERENCE IMAGE ANALYSIS:",
      isMultiCharacter ? `CRITICAL: Each of the ${files.length} images below was analyzed INDIVIDUALLY and SEPARATELY. Each analysis is complete and detailed. All ${files.length} analyses are EQUALLY IMPORTANT. Preserve each character from each image with the SAME level of detail and accuracy. Each character must be remade perfectly based on their individual analysis.` : "",
      "=".repeat(80),
      "",
      isMultiCharacter ? allAnalysesText : baseAnalysis,
      "",
      "=".repeat(80),
      isMultiCharacter ? `REMINDER: You have ${files.length} separate, individual analyses above. Each image was analyzed ONE BY ONE separately, so each analysis is complete. Each character from each image must be preserved with EQUAL detail and accuracy. Do not favor one character over another. Remake each character perfectly based on their individual analysis.` : "",
      "=".repeat(80),
      "",
      "=".repeat(80),
      "USER'S CUSTOM INSTRUCTIONS:",
      "=".repeat(80),
      instructionText || "(No custom instructions provided - recreate exactly as analyzed above)",
      "",
      "SUPER HIGH-QUALITY STICKER RENDERING REQUIREMENTS:",
      "- ULTRA HIGH RESOLUTION: 1024x1024 SQUARE output (always square, regardless of input aspect ratio). Maximum detail preservation.",
      "- PROFESSIONAL STICKER QUALITY: Clean, crisp edges with perfect anti-aliasing. Vibrant, accurate colors matching the original exactly. No compression artifacts, no blur, no pixelation.",
      "- ABSOLUTELY NO OUTLINES OR BORDERS: Characters must NOT have ANY outlines, borders, edge lines, white borders, white outlines, or ANY type of border/outline around them - NO EXCEPTIONS. This includes: NO black lines, NO white lines, NO colored outlines, NO borders of any color, NO edge lines, NO sticker borders, NO white sticker outlines. Render characters with smooth, natural edges using ONLY color transitions, shading, and anti-aliasing. Characters should blend seamlessly into the background (or transparent area) with NO visible borders or outlines of ANY kind.",
      "- ACCURATE CHARACTER REMAKING: Recreate EVERY character EXACTLY as they appear in the reference images. Match their appearance, features, colors, clothing, accessories, proportions, poses, expressions, and every detail with PIXEL-PERFECT ACCURACY. Do not alter, simplify, or approximate any character features. Remake characters with MAXIMUM FIDELITY to the original.",
      "- MAXIMUM DETAIL PRESERVATION: Every detail from the original must be visible and accurate - textures, patterns, fine lines, small accessories, facial features, clothing details, etc. NO detail should be lost or simplified.",
      "- CINEMATIC LIGHTING: Multi-light setup with volumetric depth, maintaining the original lighting relationships and mood.",
      "- COLOR ACCURACY: Match colors EXACTLY as described in the analysis. Use the exact same color values, hues, saturation, and brightness. No color shifts or approximations.",
      "- TEXTURE FIDELITY: Preserve all textures exactly - fabric textures, skin textures, material properties, surface details. Render with realistic material properties.",
      "- PROPORTION ACCURACY: Maintain exact proportions from the original. No stretching, no distortion, no size changes unless explicitly requested.",
      "- EDGE QUALITY: Perfect, clean edges suitable for sticker cutting. Sharp, well-defined silhouettes with no artifacts, but NO outlines or borders around characters.",
      isMultiCharacter
        ? `- COMPOSITION & SPACING: Arrange all ${files.length} characters in a balanced, well-spaced composition within the square frame while maintaining each character's original proportions and quality.`
        : "- PRESERVE EXACT FOCUS PLANE: Maintain the exact focus plane and depth-of-field from reference. Keep the same sharpness/blur relationships.",
      isMultiCharacter
        ? `  * Scale characters appropriately so ALL ${files.length} characters fit comfortably within the square frame without crowding, but maintain their original proportions and detail levels`
        : "",
      isMultiCharacter
        ? `  * Each character should be clearly visible, recognizable, and match their analysis with PIXEL-PERFECT ACCURACY. Maintain professional quality for all.`
        : "",
      isMultiCharacter
        ? `  * Use smart spacing - characters should not overlap unnecessarily, but should be arranged in a visually pleasing way while preserving each character's integrity`
        : "",
      isMultiCharacter
        ? `  * If characters are too large to fit, scale them down proportionally so they all fit with good spacing, but maintain all details and quality`
        : "",
      isMultiCharacter
        ? `  * Consider arranging characters in a row, diagonal, or other balanced layout that works for ${files.length} characters while preserving quality`
        : "",
      "- MATERIAL REALISM: Maintain accurate material properties - metal looks like metal, fabric looks like fabric, skin looks like skin, etc. Realistic shading and highlights.",
      "- SHADING ACCURACY: Preserve the exact shading style, shadow shapes, and highlight positions from the original. Maintain the same lighting direction and intensity.",
      isMultiCharacter
        ? `- FINAL CRITICAL REQUIREMENT: Include ALL ${files.length} characters from ALL ${files.length} analyzed images with SUPER HIGH QUALITY and MAXIMUM ACCURACY. Each character must match their detailed individual analysis above with EQUAL precision. Character from Image 1's details = Character from Image 2's details = Character from Image 3's details (etc.) in terms of preservation accuracy and quality. No character should be simplified, approximated, or altered more than another. ALL ${files.length} characters from ALL ${files.length} images must be included. Scale characters appropriately so they all fit in the square frame with good spacing while maintaining professional quality throughout.`
        : "- FINAL EXECUTION: This must be a PIXEL-PERFECT, PROFESSIONAL-GRADE recreation of the original reference as a super high-quality sticker. Every detail, color, texture, proportion, and element must match with MAXIMUM ACCURACY and QUALITY.",
      !isMultiCharacter
        ? "- ASPECT RATIO HANDLING: If the reference image is rectangular (wider or taller), adapt the composition to fit the square 1024x1024 output while maintaining ALL essential elements, proportions, and composition with maximum accuracy. Center the main subject appropriately."
        : "",
      "- QUALITY CHECK: Before finalizing, verify that all details match the original, colors are accurate, proportions are correct, textures are preserved, and the overall quality is PROFESSIONAL-GRADE.",
    ].filter(Boolean).join("\n")

    let fullPrompt = chromaticPrompt

    if (backgroundMode === "transparent") {
      fullPrompt = [
        fullPrompt,
        "",
        "BACKGROUND OVERRIDE:",
        "Remove the original environment entirely and output the subject(s) on a 100% transparent background (alpha channel). Maintain silhouettes and edge fidelity; no additional shadows or scenery. This is a STICKER - it must have a clean transparent background. CRITICAL: Characters must NOT have ANY outlines, borders, white outlines, white borders, or ANY type of border/outline - use ONLY natural color transitions and anti-aliasing for smooth edges. NO white sticker outlines, NO borders of any color, NO edge lines.",
      ].join("\n")
    }

    if (instructionText) {
      fullPrompt = [
        fullPrompt,
        "",
        "USER-REQUESTED ADJUSTMENTS (APPLY WITHOUT ALTERING BASE COMPOSITION UNLESS SPECIFIED):",
        instructionText,
      ].join("\n")
    }

    if (backgroundMode === "transparent" && instructionText) {
      fullPrompt = [
        fullPrompt,
        "",
        "REMINDER: Background must remain transparent even after applying user adjustments. This is a STICKER. CRITICAL REMINDER: NO white outlines, NO white borders, NO outlines of any color, NO borders of any kind around characters - ONLY natural edges with color transitions and anti-aliasing. ABSOLUTELY NO white sticker outlines.",
      ].join("\n")
    }

    const editForm = new FormData()
    editForm.append("model", "gpt-image-1")
    editForm.append("image", new File([baseUint8], `reference-${uniqueSuffix}.${extension}`, { type: baseFile.type }))
    editForm.append("prompt", fullPrompt)
    editForm.append("size", "1024x1024")
    editForm.append("n", "1")
    editForm.append("quality", "high") // HD quality for all images
    if (backgroundMode === "transparent") {
      editForm.append("background", "transparent")
    }

    const generationResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: editForm,
    })

    if (!generationResponse.ok) {
      const errorDetails = await generationResponse.json().catch(() => null)
      console.error("[sticker-maker] Image generation failed:", errorDetails)
      
      // Refund credits if generation failed
      try {
        const adminSecret = process.env.ADMIN_REFUND_SECRET
        if (adminSecret) {
          await secureAddCreditsForRefund(
            walletAddress,
            creditsNeeded,
            `Refund for failed sticker generation`,
            adminSecret
          )
          console.log("[sticker-maker] Refunded credits due to generation failure")
        } else {
          console.warn("[sticker-maker] Cannot refund credits - ADMIN_REFUND_SECRET not set")
        }
      } catch (refundError) {
        console.error("[sticker-maker] Failed to refund credits:", refundError)
      }
      
      // Check for moderation/safety errors
      if (errorDetails?.error?.code === 'moderation_blocked' || errorDetails?.error?.type === 'image_generation_user_error') {
        return NextResponse.json(
          { 
            error: "Content was blocked by safety filters. Please try adjusting your instructions or image content.",
            details: errorDetails?.error?.message || "The image or prompt may contain content that violates safety guidelines.",
            code: errorDetails?.error?.code
          },
          { status: 400 },
        )
      }
      
      return NextResponse.json(
        { 
          error: "Failed to generate sticker.", 
          details: errorDetails?.error?.message || errorDetails?.error || "Unknown error",
          code: errorDetails?.error?.code
        },
        { status: generationResponse.status },
      )
    }

    const generationData = await generationResponse.json()
    const generatedUrl = generationData.data?.[0]?.url || generationData.data?.[0]?.b64_json

    if (!generatedUrl) {
      console.error("[sticker-maker] No generated image data returned:", generationData)
      
      // Refund credits if no image was generated
      try {
        const adminSecret = process.env.ADMIN_REFUND_SECRET
        if (adminSecret) {
          await secureAddCreditsForRefund(
            walletAddress,
            creditsNeeded,
            `Refund for failed sticker generation (no image returned)`,
            adminSecret
          )
          console.log("[sticker-maker] Refunded credits - no image returned")
        }
      } catch (refundError) {
        console.error("[sticker-maker] Failed to refund credits:", refundError)
      }
      
      return NextResponse.json(
        { error: "No image data returned from OpenAI generation API." },
        { status: 500 },
      )
    }

    const generatedBlob = await downloadImageToBlob(generatedUrl)

    const chromaticUpload = await put(`sticker-maker/sticker-${uniqueSuffix}.png`, generatedBlob, {
      access: "public",
      addRandomSuffix: false,
    })

    console.log("[sticker-maker] Sticker image uploaded:", chromaticUpload.url)

    // Return the appropriate analysis based on number of images
    const returnedAnalysis = isMultiCharacter ? allAnalysesText : baseAnalysis
    
    console.log(`[sticker-maker] Returning analysis: ${isMultiCharacter ? 'all analyses combined' : 'single analysis'}`)
    
    return NextResponse.json({
      analysis: returnedAnalysis,
      chromaticPrompt: fullPrompt,
      chromaticImageUrl: chromaticUpload.url,
      originalUploadUrl: originalUpload.url,
      instructions: instructionText,
      backgroundMode,
    })
  } catch (error) {
    console.error("[sticker-maker] Unexpected error:", error)
    
    // Try to refund credits if there was an unexpected error
    try {
      const formData = await request.formData()
      const walletAddress = formData.get("wallet_address") as string | null
      if (walletAddress) {
        const adminSecret = process.env.ADMIN_REFUND_SECRET
        if (adminSecret) {
          await secureAddCreditsForRefund(
            walletAddress,
            CREDITS_PER_STICKER,
            `Refund for failed sticker generation (unexpected error)`,
            adminSecret
          )
          console.log("[sticker-maker] Refunded credits due to unexpected error")
        }
      }
    } catch (refundError) {
      console.error("[sticker-maker] Failed to refund credits on error:", refundError)
    }
    
    return NextResponse.json(
      { error: "Unexpected server error while processing image.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

