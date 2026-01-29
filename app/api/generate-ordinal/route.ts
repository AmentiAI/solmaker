import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { generatePrompt } from "@/lib/traits"
import { calculateRarityScore, getRarityTier } from "@/lib/trait-generator"
import { generateTraitsForCollection, getActiveCollection } from "@/lib/collections"
import { hasEnoughCredits, deductCredits, secureAddCreditsForRefund } from "@/lib/credits/credits"
import { calculateCreditsNeeded } from "@/lib/credits/credit-costs"
import { createContentViolationImage } from "@/lib/image-optimizer"

export async function POST(request: NextRequest) {
  try {
    const { number, wallet_address } = await request.json()

    if (!wallet_address) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      )
    }

    // Get credit cost from database
    const creditsNeeded = await calculateCreditsNeeded('image_generation', 1)

    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(wallet_address, creditsNeeded)
    if (!hasCredits) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${creditsNeeded} credit${creditsNeeded > 1 ? 's' : ''} to generate an ordinal. Please purchase credits.` },
        { status: 402 } // 402 Payment Required
      )
    }

    // Deduct credits IMMEDIATELY before generation starts
    const creditDeducted = await deductCredits(
      wallet_address,
      creditsNeeded,
      `Generating ordinal #${number}`
    )

    if (!creditDeducted) {
      return NextResponse.json(
        { error: "Failed to deduct credits. Please try again." },
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

    // Get active collection and generate traits based on collection settings
    const activeCollection = await getActiveCollection()
    
    if (!activeCollection) {
      return NextResponse.json(
        { error: "No active collection found. Please create and activate a collection first." },
        { status: 400 }
      )
    }

    const traits = await generateTraitsForCollection(activeCollection.id, number)
    
    if (!traits) {
      return NextResponse.json(
        { error: "Failed to generate traits for collection" },
        { status: 500 }
      )
    }

    const uniqueSeed = `${number}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const prompt = await generatePrompt(traits, uniqueSeed)

    const rarityScore = calculateRarityScore(traits)
    const rarityTier = getRarityTier(rarityScore)

    console.log("[v0] Generating ordinal #", number, "with unique seed:", uniqueSeed)
    console.log("[v0] Traits:", JSON.stringify(traits))
    console.log("[v0] Rarity score:", rarityScore, "Tier:", rarityTier)

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
        quality: "high", // gpt-image-1 supports: low, medium, high, auto
      }),
    })

    if (!response.ok) {
      let error
      const contentType = response.headers.get("content-type")

      try {
        if (contentType?.includes("application/json")) {
          error = await response.json()
        } else {
          const textError = await response.text()
          error = { message: textError }
        }
      } catch (parseError) {
        // If parsing fails, try to get text
        try {
          const textError = await response.text()
          error = { message: textError }
        } catch {
          error = { message: "Unknown error from OpenAI API" }
        }
      }

      console.error("[v0] OpenAI API error:", error)
      
      // Check if error is related to API key credits/quota
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
        ? String((error as any).message) 
        : String(error)
      const errorCode = typeof error === 'object' && error !== null && 'code' in error 
        ? String((error as any).code) 
        : ''
      const errorType = typeof error === 'object' && error !== null && 'type' in error 
        ? String((error as any).type) 
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

      // Check if this is a content violation error
      const isContentPolicyViolation = 
        errorCode === 'content_policy_violation' ||
        errorCode === 'moderation_blocked' ||
        errorType === 'content_policy_violation' ||
        errorType === 'image_generation_user_error' ||
        errorMessage.toLowerCase().includes('content policy') ||
        errorMessage.toLowerCase().includes('content violation') ||
        errorMessage.toLowerCase().includes('safety') ||
        errorMessage.toLowerCase().includes('moderation')
      
      // If content violation, generate placeholder and continue (don't refund)
      if (isContentPolicyViolation) {
        console.log(`[v0] Content violation detected for ordinal #${number}, generating placeholder image`);
        const violationBuffer = await createContentViolationImage(1024, 1024);
        const imageBlob = new Blob([violationBuffer], { type: 'image/png' });
        
        // Continue with normal flow using placeholder image
        const filename = `ordinal-${number}.png`
        const blob = await put(filename, imageBlob, {
          access: "public",
        })
        
        const metadataFilename = `ordinal-${number}-metadata.json`
        const metadataBlob = await put(
          metadataFilename,
          JSON.stringify({
            ordinal_number: number,
            imageUrl: blob.url,
            traits,
            prompt,
            createdAt: new Date().toISOString(),
            contentViolation: true,
          }),
          {
            access: "public",
            contentType: "application/json",
          }
        )
        
        return NextResponse.json({
          number,
          imageUrl: blob.url,
          metadataUrl: metadataBlob.url,
          traits,
          prompt,
          rarityScore: calculateRarityScore(traits),
          rarityTier: getRarityTier(calculateRarityScore(traits)),
          contentViolation: true,
        })
      }
      
      // Refund credit if generation failed (using secure refund function)
      try {
        const adminSecret = process.env.ADMIN_REFUND_SECRET
        if (adminSecret) {
          await secureAddCreditsForRefund(
            wallet_address,
            1,
            `Refund for failed ordinal #${number} generation`,
            adminSecret
          )
          console.log("[v0] Refunded 1 credit due to generation failure")
        } else {
          console.warn("[v0] Cannot refund credit - ADMIN_REFUND_SECRET not set")
        }
      } catch (refundError) {
        console.error("[v0] Failed to refund credit:", refundError)
      }
      
      // Return generic message for quota/billing errors
      if (isQuotaError) {
        return NextResponse.json({ error: "The system is temporarily down. Please try again later." }, { status: 503 })
      }
      
      return NextResponse.json({ error: "Failed to generate image", details: error }, { status: response.status })
    }

    const data = await response.json()
    console.log("[v0] OpenAI response data:", JSON.stringify(data, null, 2))

    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json

    if (!imageUrl) {
      console.error("[v0] No image URL or data in response:", data)
      
      // Refund credit if no image data returned (using secure refund function)
      try {
        const adminSecret = process.env.ADMIN_REFUND_SECRET
        if (adminSecret) {
          await secureAddCreditsForRefund(
            wallet_address,
            1,
            `Refund for ordinal #${number} - no image data returned`,
            adminSecret
          )
          console.log("[v0] Refunded 1 credit due to missing image data")
        } else {
          console.warn("[v0] Cannot refund credit - ADMIN_REFUND_SECRET not set")
        }
      } catch (refundError) {
        console.error("[v0] Failed to refund credit:", refundError)
      }
      
      return NextResponse.json({ error: "No image data returned from OpenAI", details: data }, { status: 500 })
    }

    console.log("[v0] Downloading image from OpenAI...")
    let imageBlob: Blob

    if (imageUrl.startsWith("http")) {
      // URL response
      const imageResponse = await fetch(imageUrl)
      imageBlob = await imageResponse.blob()
    } else {
      // Base64 response
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "")
      if (!base64Data || base64Data.trim() === "") {
        throw new Error("Invalid base64 image data: empty or missing")
      }
      const buffer = Buffer.from(base64Data, "base64")
      imageBlob = new Blob([buffer], { type: "image/png" })
    }

    // Upload to Vercel Blob with metadata
    const filename = `ordinal-${number}-${Date.now()}.png`
    console.log("[v0] Uploading to Vercel Blob:", filename)

    const blob = await put(filename, imageBlob, {
      access: "public",
      addRandomSuffix: false,
    })

    console.log("[v0] Successfully saved to Blob:", blob.url)

    // Credit was already deducted before generation started
    // No need to deduct again here

    const metadataFilename = `ordinal-${number}-${Date.now()}-metadata.json`
    const metadataBlob = await put(
      metadataFilename,
      JSON.stringify({
        number,
        imageUrl: blob.url,
        traits,
        prompt,
        rarityScore,
        rarityTier,
        collectionId: activeCollection.id,
        createdAt: new Date().toISOString(),
      }),
      {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      },
    )

    return NextResponse.json({
      number,
      imageUrl: blob.url, // Return Blob URL instead of temporary OpenAI URL
      metadataUrl: metadataBlob.url,
      traits,
      prompt,
      rarityScore,
      rarityTier,
    })
  } catch (error) {
    console.error("[v0] Error generating ordinal:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
