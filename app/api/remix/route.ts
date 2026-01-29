import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const { images, prompt, imageNames } = await request.json()

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "At least one image is required" },
        { status: 400 }
      )
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
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

    console.log("[Remix] Processing", images.length, "images with prompt:", prompt)

    // STEP 1: Analyze all uploaded images using vision API
    const analysisPromises = images.map(async (imageDataUrl: string, index: number) => {
      const analysisPrompt = `Analyze this image in EXTREME, PAINSTAKING detail. This is Image ${index + 1} (Character ${index + 1}). Describe EVERYTHING you see with maximum precision. This analysis will be used to recreate elements EXACTLY, so be thorough:

IMPORTANT: If this image contains a CHARACTER, describe the character in EXTREME detail. If multiple characters, describe each one separately.

1. ART STYLE - Describe in EXTREME detail:
   - What type of art style? (realistic? cartoon? chibi? digital art? painting? vector? illustration? etc.)
   - What are the specific characteristics? (thick outlines? thin lines? smooth? textured? etc.)
   - How is it rendered? (flat colors? gradients? shading style? etc.)
   - What makes this style unique?

2. COLORS - List EVERY color:
   - What is the overall color palette? (warm? cool? bright? muted? etc.)
   - What colors dominate? List specific colors
   - What colors are used for characters? Background? Details?
   - Are there any color schemes or patterns?

3. COMPOSITION - Describe EXACTLY:
   - What is the layout? (centered? off-center? etc.)
   - What is the focal point? Where is it positioned?
   - How are elements arranged? (symmetrical? asymmetrical? etc.)
   - What is the perspective? (front view? side view? etc.)

4. CHARACTERS/SUBJECTS - Describe EVERY detail (CRITICAL FOR MULTI-CHARACTER IMAGES):
   - What characters or main subjects are visible? List each one separately.
   - For EACH character: Describe in EXTREME detail - appearance, features, positioning, size, colors, design
   - What is each character wearing? What accessories does each have?
   - What expression/pose is each character in?
   - Where is each character positioned in the image? (left? right? center? etc.)
   - How many characters are there? Describe each one separately and completely.
   - List EVERY visible detail about each character/subject

5. BACKGROUND - Describe EVERY element:
   - What is the background? Describe it in detail
   - What elements are visible? (objects, scenery, patterns, etc.)
   - What colors is the background?
   - How detailed is the background?
   - List EVERYTHING visible in the background

6. LIGHTING - Describe precisely:
   - Where does light come from? (top? side? front? etc.)
   - What is the lighting style? (dramatic? soft? harsh? etc.)
   - What areas are lit? What areas are shadowed?
   - What is the mood created by lighting?

7. TEXTURE/DETAILS - Describe in detail:
   - What textures are visible? (smooth? rough? fabric? metal? etc.)
   - How detailed is the image? (high detail? simple? etc.)
   - What specific details are visible? List them

8. OVERALL AESTHETIC:
   - What is the overall feel/mood?
   - What makes this image unique?
   - Any other notable characteristics?

Be EXTREMELY detailed and specific. Capture EVERYTHING. This analysis must be complete enough to recreate elements EXACTLY.`

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to analyze image" }))
        throw new Error(`Failed to analyze image ${index + 1}: ${error.error || 'Unknown error'}`)
      }

      const data = await response.json()
      return {
        index: index + 1,
        analysis: data.choices?.[0]?.message?.content || "",
        imageDataUrl,
      }
    })

    const analyses = await Promise.all(analysisPromises)
    console.log("[Remix] Completed analysis of all images")

    // STEP 2: Create a comprehensive prompt combining user prompt with image analyses
    const analysesText = analyses
      .map((a) => `IMAGE ${a.index} ANALYSIS:\n${a.analysis}\n`)
      .join("\n---\n\n")

    // Determine which image is the base by analyzing the prompt
    const promptLower = prompt.toLowerCase()
    let baseImageIndex = 1 // Default to image 1
    
    // If user says "keep everything from image X" or "use image X as base", that's the base
    if (promptLower.includes('keep everything from image 2') || promptLower.includes('use image 2 as base')) {
      baseImageIndex = 2
    } else if (promptLower.includes('keep everything from image 3') || promptLower.includes('use image 3 as base')) {
      baseImageIndex = 3
    } else if (promptLower.includes('keep everything from image 1') || promptLower.includes('use image 1 as base')) {
      baseImageIndex = 1
    }
    // If user says "make image X look like" or "transform image X", that X is the base
    else if (promptLower.includes('make image 2') || promptLower.includes('transform image 2')) {
      baseImageIndex = 2
    } else if (promptLower.includes('make image 3') || promptLower.includes('transform image 3')) {
      baseImageIndex = 3
    } else if (promptLower.includes('make image 1') || promptLower.includes('transform image 1')) {
      baseImageIndex = 1
    }
    // If user says "use style of X but keep Y", Y is the base
    else if (promptLower.includes('keep') && promptLower.includes('image 2')) {
      baseImageIndex = 2
    } else if (promptLower.includes('keep') && promptLower.includes('image 3')) {
      baseImageIndex = 3
    }
    // Default: if only one image mentioned, that's the base; otherwise image 1
    else if (!promptLower.includes('image 2') && !promptLower.includes('image 3')) {
      baseImageIndex = 1
    }

    const baseAnalysis = analyses.find(a => a.index === baseImageIndex) || analyses[0]
    console.log("[Remix] Determined base image:", baseImageIndex, "from prompt:", prompt)

    const baseImageAnalysis = analyses.find(a => a.index === baseImageIndex)?.analysis || ''
    // Extract art style section more reliably
    const styleMatch = baseImageAnalysis.match(/1\.\s*ART STYLE[:\s-]+(.*?)(?=2\.|COLORS|COMPOSITION|CHARACTERS|BACKGROUND|LIGHTING|TEXTURE|OVERALL|$)/is)
    const baseImageStyle = styleMatch?.[1]?.trim() || baseImageAnalysis.split('ART STYLE')[1]?.split(/2\.|COLORS|COMPOSITION/)[0]?.trim() || baseImageAnalysis.substring(0, 500)
    
    // Also extract full analysis for reference
    const fullBaseAnalysis = baseImageAnalysis

    // Check if user wants to combine multiple characters into one image
    const isMultiCharacter = promptLower.includes('all characters') || 
                            promptLower.includes('each character') || 
                            promptLower.includes('multiple characters') ||
                            promptLower.includes('combine characters') ||
                            promptLower.includes('all of them') ||
                            images.length > 1 && !promptLower.includes('image 1') && !promptLower.includes('image 2')

    const generationPrompt = `You are creating a new image based on multiple reference images and a user's prompt. CRITICAL: You must follow STRICT RULES - only change what is EXPLICITLY mentioned in the user's prompt. Everything else must stay EXACTLY the same.

REFERENCE IMAGE ANALYSES (${images.length} image${images.length > 1 ? 's' : ''}):
${analysesText}

USER'S PROMPT:
"${prompt}"

${isMultiCharacter ? `MULTI-CHARACTER MODE: The user wants to include ALL characters from ALL images in ONE combined image. You must include EVERY character described in the analyses above, each remade according to the user's instructions.` : ''}

BASE IMAGE: Image ${baseImageIndex}

FULL BASE IMAGE ANALYSIS (Image ${baseImageIndex}):
${fullBaseAnalysis}

BASE IMAGE ART STYLE (MUST PRESERVE UNLESS EXPLICITLY ASKED TO CHANGE):
${baseImageStyle}

CRITICAL: The art style described above is the EXACT style you must use. Match it precisely - same rendering technique, same linework, same shading, same aesthetic, same visual characteristics.

STRICT PRESERVATION RULES - READ CAREFULLY:

1. BASE IMAGE ART STYLE: The art style from Image ${baseImageIndex} MUST be preserved EXACTLY unless the user explicitly says to change it. This means:
   - Same rendering technique (digital art? painting? vector? etc.)
   - Same linework style (thick outlines? thin lines? etc.)
   - Same shading style (flat colors? gradients? etc.)
   - Same overall aesthetic and visual style
   - DO NOT change the art style unless user explicitly says "style of image X" or "make it look like image X's style"

2. WHAT TO PRESERVE FROM BASE IMAGE (unless explicitly asked to change):
   - ART STYLE: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same rendering, same linework, same shading, same aesthetic
   ${isMultiCharacter ? `- CHARACTERS/SUBJECTS: Include ALL characters from ALL images. For each character, preserve EXACTLY as described in their respective image analysis - same features, same appearance, same design, same colors, same details. Each character should be recognizable and match their original analysis.` : `- CHARACTERS/SUBJECTS: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same characters, same features, same appearance, same positioning, same size`}
   - BACKGROUND: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same scene, same elements, same composition, same colors, same details
   ${isMultiCharacter ? `- COMPOSITION: Arrange all characters in a balanced composition. Each character should be clearly visible and recognizable. Use the composition style from Image ${baseImageIndex} but accommodate all characters.` : `- COMPOSITION: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same layout, same positioning, same arrangement, same perspective`}
   - COLORS: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same color palette, same color scheme, same color choices
   - LIGHTING: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same lighting direction, same lighting style, same mood
   - TEXTURE/DETAILS: Preserve EXACTLY as described in Image ${baseImageIndex} analysis - same textures, same level of detail, same details
   - EVERYTHING ELSE: Preserve EXACTLY as described in Image ${baseImageIndex} analysis

3. WHAT CAN CHANGE (only if explicitly mentioned in user prompt):
   - ART STYLE: Only change if user explicitly says "style of image X" or "make it look like image X's style" or "art style of image X"
   - COLORS: Only change if user explicitly says "colors of image X" or "color palette of image X"
   - LIGHTING: Only change if user explicitly mentions lighting from another image
   - TEXTURE: Only change if user explicitly mentions texture from another image

4. INTERPRETATION RULES (STRICT):
   - If user says "use the style of image X" → Change ONLY the art style (rendering technique, linework, shading). Keep EVERYTHING else from base image EXACTLY - characters, background, composition, colors, lighting, details.
   - If user says "keep everything from image Y" → Use Image Y as the base and preserve EVERYTHING from it, including art style.
   - If user says "make image X look like image Y's style" → Base: Image X. Change: ONLY art style to match Image Y. Keep: Everything else from Image X EXACTLY.
   - If user says "change the style" → Change ONLY art style. Keep characters, background, composition, colors, lighting, details EXACTLY from base.
   - If user says "combine X and Y" → Only combine what's explicitly mentioned. Everything else (including art style) stays from base.

5. CRITICAL RULE: If the user's prompt does NOT explicitly mention changing the art style, you MUST use the EXACT art style from Image ${baseImageIndex}. DO NOT change it. DO NOT interpret. DO NOT assume.

6. EXAMPLE INTERPRETATIONS:
   - "Use the style of image 2 but keep everything else from image 1" → Base: Image 1. Change: ONLY art style to match Image 2. Keep: Characters, background, composition, colors, lighting, details EXACTLY from Image 1. Use Image 1's art style for everything except apply Image 2's rendering technique.
   - "Make image 1 look like image 2's style" → Base: Image 1. Change: ONLY art style to Image 2. Keep: Everything else from Image 1 EXACTLY.
   - "Keep everything from image 1" → Use Image 1 as base, preserve EVERYTHING including art style.
   ${isMultiCharacter ? `- "Remake all characters from all images" → Include ALL characters from ALL images in ONE image. Each character should match their original analysis. Apply any style/transformation instructions to each character.
   - "Combine all characters" → Include ALL characters from ALL images in ONE combined image. Each character preserved from their original analysis.
   - "Include all characters, each remade with style of image 2" → Include ALL characters from ALL images. Apply Image 2's art style to each character. Keep each character's design, features, colors, details from their original analysis.` : ''}

GENERATION REQUIREMENTS:
- Match the EXACT art style from Image ${baseImageIndex} analysis above
- Use the EXACT rendering technique described in the base image analysis
- Use the EXACT linework style described in the base image analysis  
- Use the EXACT shading style described in the base image analysis
- Use the EXACT aesthetic described in the base image analysis
- HYPER-DETAILED professional digital illustration
- 1024x1024 square format
- Professional gallery-quality rendering
- STRICT ADHERENCE: Only change what is EXPLICITLY mentioned. Preserve everything else EXACTLY, especially the art style.

FINAL REMINDER - STRICT RULES (READ CAREFULLY):
- Base image: Image ${baseImageIndex}
- User prompt: "${prompt}"
- Base image art style: ${baseImageStyle.substring(0, 200)}...

CRITICAL PRESERVATION RULES:
1. ART STYLE: Use the EXACT art style from Image ${baseImageIndex} UNLESS the user explicitly says to change it. If user says "style of image X", then use Image X's art style but keep EVERYTHING else from Image ${baseImageIndex}.

2. ONLY change what is EXPLICITLY mentioned in the user prompt above. Everything else must be preserved EXACTLY from Image ${baseImageIndex} analysis.

3. If the user says "style of image X", change ONLY the art style (rendering technique, linework, shading). Keep characters, background, composition, colors, lighting, details EXACTLY from base Image ${baseImageIndex}.

4. If the user says "colors of image X", change ONLY the colors. Keep art style, characters, background, composition, lighting, details EXACTLY from base.

5. DO NOT interpret or assume. Only change what is explicitly stated.
6. DO NOT add elements not mentioned.
7. DO NOT remove elements unless explicitly asked.
8. DO NOT change art style unless explicitly asked.
9. PRESERVE, PRESERVE, PRESERVE - unless explicitly asked to change.

GENERATION INSTRUCTIONS:
- Start with Image ${baseImageIndex} as your base
- Read the user prompt: "${prompt}"
- Determine what they want to change (if anything)

${isMultiCharacter ? `MULTI-CHARACTER REQUIREMENTS:
- Include ALL characters from ALL ${images.length} images in ONE image
- For each character, reference their respective image analysis above
- Each character must be recognizable and match their original analysis
- Arrange all characters in a balanced, visually appealing composition
- Each character should maintain their original design, features, colors, and details
- Apply the user's transformation instructions to EACH character
- All characters should be clearly visible and distinct` : ''}

ART STYLE TO USE:
${baseImageStyle}

You MUST use this EXACT art style. Match every characteristic described above - rendering technique, linework, shading, aesthetic. This is the art style from Image ${baseImageIndex} and it must be preserved unless the user explicitly says to change it.

- If they mention "style of image X", extract ONLY the art style from Image X and use that instead
- Apply ONLY the changes explicitly mentioned
- Preserve EVERYTHING else from Image ${baseImageIndex} EXACTLY, especially the art style if not explicitly changed
${isMultiCharacter ? `- Include ALL characters from all images, each remade according to the user's instructions` : ''}

Generate the image now using the art style described above. ${isMultiCharacter ? `Remember: Include ALL characters from all ${images.length} images in one combined image.` : `Remember: Base image is Image ${baseImageIndex}.`} Use its art style (described above) unless explicitly told to change it. Only change what the user explicitly asks to change. Preserve everything else EXACTLY.`

    // STEP 3: Generate the new image
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: generationPrompt,
        n: 1,
        size: "1024x1024",
        quality: "high",
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to generate image" }))
      console.error("[Remix] Image generation error:", error)
      return NextResponse.json({ error: "Failed to generate image", details: error }, { status: response.status })
    }

    const data = await response.json()
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json

    if (!imageUrl) {
      return NextResponse.json({ error: "No image data returned" }, { status: 500 })
    }

    // STEP 4: Download and upload image
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

    const filename = `remix-${Date.now()}.png`
    const blob = await put(filename, imageBlob, {
      access: "public",
      addRandomSuffix: false,
    })

    console.log("[Remix] Successfully generated and uploaded image:", blob.url)

    return NextResponse.json({
      imageUrl: blob.url,
      prompt: prompt,
      analysesCount: analyses.length,
    })
  } catch (error) {
    console.error("[Remix] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process remix",
      },
      { status: 500 }
    )
  }
}

