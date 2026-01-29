import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { isAuthorized } from "@/lib/auth/access-control"

const MAX_FILE_SIZE = 12 * 1024 * 1024 // 12MB

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
    // Block all access - only trait-based generation is allowed
    const formData = await request.formData()
    const walletAddress = formData.get("wallet_address") as string | null
    
    return NextResponse.json(
      { error: "This generation method is no longer available. Please use trait-based generation through collections." },
      { status: 403 }
    )

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY." },
        { status: 500 },
      )
    }
    const imageCount = parseInt(formData.get("imageCount") as string) || 1
    
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

    console.log("[tester11] Received images:", files.length)

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

    const originalUpload = await put(`tester11/original-${uniqueSuffix}.${extension}`, baseOriginalFileForUpload, {
      access: "public",
      addRandomSuffix: false,
    })

    // STEP 1: Analyze all images individually using OpenAI vision
    const analysisPromises = files.map(async (file, index) => {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = bufferToBase64(arrayBuffer)
      const dataUrl = `data:${file.type};base64,${base64}`

      const analysisPrompt = `CRITICAL: Analyze this image in EXTREME, PAINSTAKING detail with MAXIMUM PRECISION. This is Image ${index + 1}${files.length > 1 ? ` of ${files.length}` : ''}. 

${files.length > 1 ? `IMPORTANT: This is ONE of ${files.length} images that will be combined. You MUST analyze this image with the SAME level of detail as all other images. Every character detail matters equally.` : ''}

Describe EVERYTHING you see with maximum precision. This analysis will be used to recreate elements EXACTLY, so be EXTREMELY thorough. NO detail is too small to mention.

1. ART STYLE - Describe in EXTREME detail:
   - What type of art style? (realistic? cartoon? chibi? digital art? painting? vector? illustration? etc.)
   - What are the specific characteristics? (thick outlines? thin lines? smooth? textured? etc.)
   - How is it rendered? (flat colors? gradients? shading style? etc.)
   - What makes this style unique?
   - Describe the linework, brush strokes, rendering technique in detail

2. COLORS - List EVERY color with SPECIFIC details:
   - What is the overall color palette? (warm? cool? bright? muted? etc.)
   - What colors dominate? List SPECIFIC colors (e.g., "bright red #FF0000", "deep blue #000080")
   - What colors are used for characters? List each color specifically
   - What colors are used for background? List each color specifically
   - What colors are used for details/accessories? List each color specifically
   - Are there any color schemes or patterns?
   - Describe color gradients, shadows, highlights

3. COMPOSITION - Describe EXACTLY:
   - What is the layout? (centered? off-center? etc.)
   - What is the focal point? Where is it positioned? (exact position)
   - How are elements arranged? (symmetrical? asymmetrical? etc.)
   - What is the perspective? (front view? side view? 3/4 view? etc.)
   - What is the camera angle? (eye level? bird's eye? worm's eye?)
   - What is the aspect ratio? (square? wide/landscape? tall/portrait?)
   - How much empty space is around the character/subject?

4. CHARACTERS/SUBJECTS - Describe EVERY detail (CRITICAL - THIS IS THE MOST IMPORTANT SECTION):
   ${files.length > 1 ? `   - CRITICAL: This character will be combined with other characters. Describe EVERY SINGLE DETAIL so this character can be recreated EXACTLY.` : ''}
   - What characters or main subjects are visible? List each one separately.
   - For EACH character: Describe in EXTREME detail:
     * FACE: Eye color, eye shape, eye size, eyebrow shape/color, nose shape/size, mouth shape/expression, face shape, skin tone, any facial markings/scars
     * HAIR: Color (specific), style, length, texture, any accessories in hair, hair highlights/shadows
     * BODY: Body type, height (relative), proportions, pose, stance
     * CLOTHING: Describe EVERY piece of clothing - shirt, pants, shoes, etc. Include colors, patterns, textures, style
     * ACCESSORIES: List EVERY accessory - jewelry, bags, weapons, props, etc. Describe each in detail
     * POSITIONING: Where is the character positioned? (left? right? center? exact position)
     * SIZE: How large is the character relative to the image?
     * EXPRESSION: Facial expression, body language, mood
     * UNIQUE FEATURES: Any unique characteristics, markings, scars, tattoos, etc.
   - List EVERY visible detail about each character/subject - nothing should be omitted

5. BACKGROUND - Describe EVERY element:
   - What is the background? Describe it in EXTREME detail
   - What elements are visible? (objects, scenery, patterns, etc.) - List EVERYTHING
   - What colors is the background? List specific colors
   - How detailed is the background?
   - List EVERYTHING visible in the background - no detail is too small

6. LIGHTING - Describe precisely:
   - Where does light come from? (top? side? front? etc.) - Be specific about angle
   - What is the lighting style? (dramatic? soft? harsh? etc.)
   - What areas are lit? What areas are shadowed? Describe shadow shapes
   - What is the mood created by lighting?
   - Are there multiple light sources?

7. TEXTURE/DETAILS - Describe in detail:
   - What textures are visible? (smooth? rough? fabric? metal? etc.) - Describe each texture
   - How detailed is the image? (high detail? simple? etc.)
   - What specific details are visible? List them ALL
   - Describe surface details, material properties

8. OVERALL AESTHETIC:
   - What is the overall feel/mood?
   - What makes this image unique?
   - Any other notable characteristics?

${files.length > 1 ? `CRITICAL REMINDER: This character will be combined with ${files.length - 1} other character(s). Your analysis must be detailed enough to recreate this character EXACTLY as shown, with ALL its unique features, colors, clothing, accessories, and details preserved. Every detail matters equally.` : ''}

Be EXTREMELY detailed and specific. Capture EVERYTHING. This analysis must be complete enough to recreate elements EXACTLY. NO detail should be omitted.`

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
                "You are a professional art director and visual analyst. Produce exhaustive scene breakdowns with extreme attention to detail. Be extremely thorough and descriptive.",
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
          max_tokens: 2000,
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

    const analyses = await Promise.all(analysisPromises)
    const baseAnalysis = analyses[0].analysis
    
    // Combine all analyses with clear separators - ensure equal importance
    const allAnalysesText = analyses.map(a => {
      return `\n${"=".repeat(80)}\nIMAGE ${a.index} ANALYSIS ${files.length > 1 ? `(Character ${a.index} of ${files.length})` : '(Reference Image)'}\n${"=".repeat(80)}\n\n${a.analysis}\n\n${"=".repeat(80)}\nEND OF IMAGE ${a.index} ANALYSIS\n${"=".repeat(80)}\n`
    }).join("\n\n")

    console.log("[tester11] All analyses extracted:", analyses.length)
    console.log("[tester11] Combined analysis length:", allAnalysesText.length)

    // Check if multi-character mode
    const promptLower = instructionText.toLowerCase()
    const isMultiCharacter = files.length > 1 && (
      promptLower.includes('all characters') || 
      promptLower.includes('each character') || 
      promptLower.includes('multiple characters') ||
      promptLower.includes('combine characters') ||
      promptLower.includes('all of them') ||
      promptLower.includes('remake all') ||
      promptLower.includes('combine all') ||
      (!promptLower.includes('image 1') && !promptLower.includes('image 2'))
    )

    // STEP 2: Generate chromatic recreation using image generation API
    const chromaticPrompt = [
      isMultiCharacter 
        ? `MULTI-CHARACTER MODE: Create ONE image containing ALL characters from ALL ${files.length} reference images. Each character must be recognizable and match their original analysis EXACTLY.`
        : "REPLICA MODE: Recreate the supplied reference image EXACTLY, matching composition, framing, camera angle, poses, background, props, lighting direction, and overall scene layout pixel-for-pixel.",
      isMultiCharacter
        ? `CRITICAL: Include EVERY character described in the analyses below. Each character should maintain their ORIGINAL design, features, colors, clothing, accessories, and details EXACTLY as described in their respective analysis. ALL characters are EQUALLY IMPORTANT - preserve each one with the same level of detail and accuracy.`
        : "Do NOT invent or alter any elements unless explicitly requested. No new objects, no removed objects, no pose changes, no camera shifts. Keep the entire silhouette, environment, and arrangement identical to the original.",
      isMultiCharacter
        ? `EQUAL PRESERVATION RULE: Each character from each analysis must be preserved with EQUAL attention to detail. Character 1's details are just as important as Character 2's details, Character 3's details, etc. Do not favor one character over another. Each character must be clearly visible, distinct, and match their analysis EXACTLY.`
        : "Preserve original materials, colors, and lighting relationships unless user instructions below specify otherwise.",
      isMultiCharacter
        ? "Apply any transformation instructions to EACH character while preserving their core design, features, colors, clothing, and accessories from their analysis."
        : "Ensure facial expressions, clothing details, and environmental elements remain faithful to the reference image.",
      "",
      "=".repeat(80),
      files.length > 1 ? `ALL ${files.length} IMAGE ANALYSES (READ CAREFULLY - EACH IMAGE ANALYZED INDIVIDUALLY WITH EQUAL DETAIL):` : "REFERENCE IMAGE ANALYSIS:",
      files.length > 1 ? `CRITICAL: All ${files.length} analyses below are EQUALLY IMPORTANT. Preserve each character with the SAME level of detail and accuracy.` : "",
      "=".repeat(80),
      "",
      files.length > 1 ? allAnalysesText : baseAnalysis,
      "",
      "=".repeat(80),
      files.length > 1 ? `REMINDER: You have ${files.length} separate analyses above. Each character must be preserved with EQUAL detail. Do not favor one character over another.` : "",
      "=".repeat(80),
      "",
      "=".repeat(80),
      "USER'S CUSTOM INSTRUCTIONS:",
      "=".repeat(80),
      instructionText || "(No custom instructions provided - recreate exactly as analyzed above)",
      "",
      "RENDERING REQUIREMENTS:",
      "- Ultra high resolution 1024x1024 SQUARE output (always square, regardless of input aspect ratio).",
      "- Cinematic multi-light setup with volumetric depth.",
      isMultiCharacter
        ? `- COMPOSITION & SPACING: Arrange all ${files.length} characters in a balanced, well-spaced composition within the square frame.`
        : "- Preserve exact focus plane and depth-of-field from reference.",
      isMultiCharacter
        ? `  * Scale characters appropriately so ALL ${files.length} characters fit comfortably within the square frame without crowding`
        : "",
      isMultiCharacter
        ? `  * Each character should be clearly visible, recognizable, and match their analysis EXACTLY`
        : "",
      isMultiCharacter
        ? `  * Use smart spacing - characters should not overlap unnecessarily, but should be arranged in a visually pleasing way`
        : "",
      isMultiCharacter
        ? `  * If characters are too large to fit, scale them down proportionally so they all fit with good spacing`
        : "",
      isMultiCharacter
        ? `  * Consider arranging characters in a row, diagonal, or other balanced layout that works for ${files.length} characters`
        : "",
      "- Maintain material realism, texture detail, and accurate shading.",
      isMultiCharacter
        ? `- FINAL CRITICAL REQUIREMENT: Include ALL ${files.length} characters from ALL images. Each character must match their detailed analysis above with EQUAL accuracy. Character 1's details = Character 2's details = Character 3's details (etc.) in terms of preservation accuracy. No character should be simplified or altered more than another. Scale characters appropriately so they all fit in the square frame with good spacing.`
        : "- Final execution must feel like a faithful recreation of the original reference.",
      !isMultiCharacter
        ? "- ASPECT RATIO HANDLING: If the reference image is rectangular (wider or taller), adapt the composition to fit the square 1024x1024 output while maintaining the essential elements and composition. Center the main subject appropriately."
        : "",
    ].filter(Boolean).join("\n")

    let fullPrompt = chromaticPrompt

    if (backgroundMode === "transparent") {
      fullPrompt = [
        fullPrompt,
        "",
        "BACKGROUND OVERRIDE:",
        "Remove the original environment entirely and output the subject(s) on a 100% transparent background (alpha channel). Maintain silhouettes and edge fidelity; no additional shadows or scenery.",
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
        "REMINDER: Background must remain transparent even after applying user adjustments.",
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
      console.error("[tester11] Image generation failed:", errorDetails)
      
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
          error: "Failed to generate image.", 
          details: errorDetails?.error?.message || errorDetails?.error || "Unknown error",
          code: errorDetails?.error?.code
        },
        { status: generationResponse.status },
      )
    }

    const generationData = await generationResponse.json()
    const generatedUrl = generationData.data?.[0]?.url || generationData.data?.[0]?.b64_json

    if (!generatedUrl) {
      console.error("[tester11] No generated image data returned:", generationData)
      return NextResponse.json(
        { error: "No image data returned from OpenAI generation API." },
        { status: 500 },
      )
    }

    const generatedBlob = await downloadImageToBlob(generatedUrl)

    const chromaticUpload = await put(`tester11/chromatic-${uniqueSuffix}.png`, generatedBlob, {
      access: "public",
      addRandomSuffix: false,
    })

    console.log("[tester11] Chromatic image uploaded:", chromaticUpload.url)

    return NextResponse.json({
      analysis: files.length > 1 ? allAnalysesText : baseAnalysis,
      chromaticPrompt: fullPrompt,
      chromaticImageUrl: chromaticUpload.url,
      originalUploadUrl: originalUpload.url,
      instructions: instructionText,
      backgroundMode,
    })
  } catch (error) {
    console.error("[tester11] Unexpected error:", error)
    return NextResponse.json(
      { error: "Unexpected server error while processing image.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

