import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { hasEnoughCredits, deductCredits, addCredits } from "@/lib/credits/credits"
import { isAuthorized } from "@/lib/auth/access-control"
import { calculateCreditsNeeded } from "@/lib/credits/credit-costs"

// Variation instructions to ensure uniqueness while maintaining style
const variationInstructions = [
  "unique composition and pose variation",
  "different angle and perspective",
  "varied color palette while maintaining the same art style",
  "distinct arrangement and layout",
  "unique lighting setup and shadow placement",
  "different focal point and emphasis",
  "varied texture details and surface qualities",
  "distinct mood and atmosphere",
  "unique decorative elements and accents",
  "different visual rhythm and flow",
]

function buildPrompt(
  description: string,
  borderStyle: string,
  artStyle: string,
  variationIndex: number,
  totalVariations: number
): string {
  const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${variationIndex}`
  const borderReq = borderStyle || 'thin decorative frame with intricate corner ornaments'
  const style = artStyle || 'professional digital illustration, cute cartoonish style'
  
  // Check if art style is minimalist or pixel art
  const styleLower = style.toLowerCase()
  const isMinimalistStyle = styleLower.includes('minimalist') || styleLower.includes('flat design') || styleLower.includes('simple')
  const isPixelArtStyle = styleLower.includes('pixel')
  
  // Add variation instruction for uniqueness (except first one if only generating 1)
  const variationText = totalVariations > 1 
    ? `\n\nUNIQUENESS REQUIREMENT: This is variation ${variationIndex + 1} of ${totalVariations}. Create a UNIQUE interpretation with ${variationInstructions[variationIndex % variationInstructions.length]}. Each variation must be distinctly different in composition, pose, colors, or details while maintaining the EXACT same art style, vibe, and overall aesthetic.`
    : ''

  // Build detail, quality, and final lines based on art style
  let detailLine: string
  let lightingLine: string
  let colorsLine: string
  let qualityLine: string
  let finalLine: string
  
  if (isMinimalistStyle) {
    detailLine = 'DETAIL: Clean shapes, limited colors, simple geometric forms, no unnecessary complexity.'
    lightingLine = 'LIGHTING: Flat, even lighting with minimal shadows.'
    colorsLine = 'COLORS: Limited color palette, flat fills, no gradients unless specified.'
    qualityLine = 'QUALITY: Professional flat design, clean edges, consistent color fills, balanced composition.'
    finalLine = 'FINAL: Clean minimalist aesthetic, simple shapes, limited color palette, modern design.'
  } else if (isPixelArtStyle) {
    detailLine = 'DETAIL: Crisp pixel edges, limited color palette, retro game aesthetic, no anti-aliasing, clean blocky pixels.'
    lightingLine = 'LIGHTING: Simple pixel-based shading, dithering for gradients if needed.'
    colorsLine = 'COLORS: Limited retro palette, no smooth gradients, pixel-appropriate colors.'
    qualityLine = 'QUALITY: Professional pixel art, crisp edges, consistent pixel size, retro game quality.'
    finalLine = 'FINAL: Authentic pixel art style, no smoothing, consistent blocky aesthetic throughout.'
  } else {
    detailLine = 'DETAIL: Multiple layers, texture, highlights, shadows, material quality rendering, intricate details throughout.'
    lightingLine = 'LIGHTING: Multiple sources, dramatic setup, warm key light, cool fill light, rim lighting, atmospheric effects, volumetric lighting.'
    colorsLine = 'COLORS: Deep saturated colors, metallic accents, bright glows, rich colored shadows, smooth gradients, high contrast.'
    qualityLine = 'QUALITY: Professional gallery-quality, clean linework, rich color rendering, intricate details, cohesive composition, professional shading, polished appearance.'
    finalLine = 'FINAL: Professional quality, dramatic lighting, maximum color vibrancy, intricate detail, cinematic lighting effects, visually stunning with professional-grade illumination.'
  }

  const formatPrefix = isMinimalistStyle ? 'Professional' : (isPixelArtStyle ? 'Professional pixel art' : 'Professional')

  return `${formatPrefix} digital illustration, 1024x1024 square format.

ART STYLE: ${style}

IMAGE DESCRIPTION:
${description}

${detailLine}

${lightingLine}

${colorsLine}

BORDER: ${borderReq} - PLACEMENT: Outer edge EXACTLY at canvas edge (y=0, y=1024, x=0, x=1024), NO gaps, FULL BLEED.${isMinimalistStyle ? '' : ' The border must be rendered with intricate detail, material quality, and vibrant color accents.'}

${qualityLine}
${variationText}

Reference seed: ${uniqueSeed}

${finalLine}`
}

async function downloadImageToBlob(urlOrBase64: string): Promise<Blob> {
  if (!urlOrBase64 || urlOrBase64.trim() === "") {
    throw new Error("Invalid image URL or base64 data: empty or missing")
  }
  
  if (urlOrBase64.startsWith("http")) {
    const imageResponse = await fetch(urlOrBase64)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`)
    }
    return await imageResponse.blob()
  } else {
    // Handle base64 image
    const base64Data = urlOrBase64.replace(/^data:image\/\w+;base64,/, "")
    if (!base64Data || base64Data.trim() === "") {
      throw new Error("Invalid base64 image data: empty or missing")
    }
    const buffer = Buffer.from(base64Data, "base64")
    return new Blob([new Uint8Array(buffer)], { type: "image/png" })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { description, borderStyle, artStyle, batchCount = 1, wallet_address } = body

    // Block all access - only trait-based generation is allowed
    return NextResponse.json(
      { error: "This generation method is no longer available. Please use trait-based generation through collections." },
      { status: 403 }
    )

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      )
    }

    const count = Math.max(1, Math.min(10, parseInt(String(batchCount)) || 1))

    // Get credit cost from database
    const creditsNeeded = await calculateCreditsNeeded('image_generation', count)

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded)
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate ${count} image${count > 1 ? 's' : ''}. Please purchase credits.` },
        { status: 402 } // 402 Payment Required
      )
    }

    // Deduct credits IMMEDIATELY before generation starts
    const creditsDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Generating ${count} simple image${count > 1 ? 's' : ''}`
    )

    if (!creditsDeducted) {
      return NextResponse.json(
        { error: `Failed to deduct credits. Please try again.` },
        { status: 500 }
      )
    }

    // Get OpenAI API key from environment
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please add OPENAI_API_KEY to your environment variables." },
        { status: 500 },
      )
    }

    console.log(`[Simple Generator] Generating ${count} image(s) with description:`, description)

    const results = []

    // Generate images one by one to ensure uniqueness
    for (let i = 0; i < count; i++) {
      const prompt = buildPrompt(description, borderStyle || '', artStyle || '', i, count)
      const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${i}`

      console.log(`[Simple Generator] Generating image ${i + 1}/${count} with seed:`, uniqueSeed)

      // Call OpenAI Image Generation API (gpt-image-1)
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          quality: "high",
        }),
      })

      if (!response.ok) {
        let error: unknown
        const contentType = response.headers.get("content-type")

        try {
          if (contentType?.includes("application/json")) {
            error = await response.json()
          } else {
            const textError = await response.text()
            error = { message: textError }
          }
        } catch (parseError) {
          try {
            const textError = await response.text()
            error = { message: textError }
          } catch {
            error = { message: "Unknown error from OpenAI API" }
          }
        }

        console.error(`[Simple Generator] OpenAI API error for image ${i + 1}:`, error)
        
        // Check if error is related to API key credits/quota
        const errorObj = error as any
        let errorMessage: string
        if (typeof error === "object" && error !== null && "message" in errorObj && typeof errorObj.message === "string") {
          errorMessage = errorObj.message
        } else if (typeof error === "object" && error !== null && "error" in errorObj && typeof errorObj.error === "string") {
          errorMessage = errorObj.error
        } else {
          errorMessage = String(error)
        }
        const errorCode = typeof error === "object" && error !== null && "code" in errorObj 
          ? String(errorObj.code) 
          : ''
        const errorType = typeof error === "object" && error !== null && "type" in errorObj 
          ? String(errorObj.type) 
          : ''
        
        const isQuotaError = 
          errorCode === 'insufficient_quota' ||
          errorType === 'insufficient_quota' ||
          errorMessage.toLowerCase().includes('insufficient_quota') ||
          errorMessage.toLowerCase().includes('quota') ||
          errorMessage.toLowerCase().includes('billing') ||
          errorMessage.toLowerCase().includes('insufficient funds') ||
          errorMessage.toLowerCase().includes('payment method') ||
          errorCode === 'billing_not_active' ||
          errorType === 'billing_not_active'
        
        // If it's the first image, return error. Otherwise, log and continue
        if (i === 0) {
          // Return generic message for quota/billing errors
          if (isQuotaError) {
            return NextResponse.json({ error: "The system is temporarily down. Please try again later." }, { status: 503 })
          }
          return NextResponse.json({ error: errorMessage || "Failed to generate image", details: error }, { status: response.status })
        } else {
          console.error(`[Simple Generator] Failed to generate image ${i + 1}, skipping...`)
          continue
        }
      }

      const data = await response.json()
      const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json

      if (!imageUrl) {
        console.error(`[Simple Generator] No image URL for image ${i + 1}:`, data)
        if (i === 0) {
          return NextResponse.json({ error: "No image data returned from OpenAI", details: data }, { status: 500 })
        }
        continue
      }

      console.log(`[Simple Generator] Downloading image ${i + 1} from OpenAI...`)
      const imageBlob = await downloadImageToBlob(imageUrl)

      // Upload to Vercel Blob Storage
      const filename = `simple-${uniqueSeed}.png`
      const blob = await put(filename, imageBlob, {
        access: "public",
        addRandomSuffix: false,
      })

      console.log(`[Simple Generator] Image ${i + 1} uploaded to:`, blob.url)

      results.push({
        imageUrl: blob.url,
        prompt: prompt,
        description: description,
        createdAt: new Date().toISOString(),
        variationIndex: i + 1,
      })

      // Small delay between generations to avoid rate limits
      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // If generation failed partially, refund credits for failed images
    if (results.length < count) {
      const failedCount = count - results.length
      console.warn(`[Simple Generator] ${failedCount} image(s) failed to generate. Refunding ${failedCount} credit(s)...`)
      
      // Refund credits for failed generations
      try {
        await addCredits(
          wallet_address,
          failedCount,
          `Refund for ${failedCount} failed generation${failedCount > 1 ? 's' : ''}`
        )
      } catch (error) {
        console.error("[Simple Generator] Failed to refund credits:", error)
      }
    }

    // Return single result for backward compatibility if count is 1
    if (count === 1 && results.length === 1) {
      return NextResponse.json(results[0])
    }

    // Return array of results for batch generation
    return NextResponse.json({
      images: results,
      count: results.length,
      requested: count,
    })
  } catch (error) {
    console.error("[Simple Generator] Error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message || "Failed to generate image"
            : typeof error === "string"
              ? error
              : "Failed to generate image",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    )
  }
}

