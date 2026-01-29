import { list, put, del } from "@vercel/blob"
import { NextResponse } from "next/server"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST() {
  try {
    console.log("[v0] Starting renumbering process...")

    await delay(200)

    // Get all ordinals
    const { blobs } = await list({
      prefix: "ordinal-",
    })

    // Filter for metadata JSON files
    const metadataBlobs = blobs.filter((blob) => blob.pathname.endsWith("-metadata.json"))

    console.log("[v0] Found", metadataBlobs.length, "ordinals to renumber")

    const ordinals = []
    for (const blob of metadataBlobs) {
      try {
        const response = await fetch(blob.url)
        if (!response.ok) {
          console.error("[v0] Error fetching metadata:", response.status)
          await delay(100)
          continue
        }
        const metadata = await response.json()
        ordinals.push({
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          ...metadata,
        })
        await delay(100) // Increased delay to avoid rate limits
      } catch (error) {
        console.error("[v0] Error fetching metadata:", error)
        await delay(100)
      }
    }

    // Sort by creation date (oldest first) to maintain order
    const validOrdinals = ordinals.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    console.log("[v0] Renumbering", validOrdinals.length, "ordinals...")

    for (let index = 0; index < validOrdinals.length; index++) {
      const ordinal = validOrdinals[index]
      const newNumber = index + 1

      // Skip if number is already correct
      if (ordinal.number === newNumber) {
        continue
      }

      console.log("[v0] Renumbering ordinal from", ordinal.number, "to", newNumber)

      try {
        // Create updated metadata with new number
        const updatedMetadata = {
          number: newNumber,
          imageUrl: ordinal.imageUrl,
          traits: ordinal.traits,
          prompt: ordinal.prompt,
          createdAt: ordinal.createdAt,
          rarityScore: ordinal.rarityScore,
          rarityTier: ordinal.rarityTier,
        }

        // Delete old metadata blob
        await del(ordinal.blobUrl)
        await delay(150)

        // Upload new metadata with updated number
        const newMetadataPath = `ordinal-${newNumber}-metadata.json`
        await put(newMetadataPath, JSON.stringify(updatedMetadata), {
          access: "public",
          contentType: "application/json",
        })
        await delay(150)
      } catch (error) {
        console.error("[v0] Error renumbering ordinal", ordinal.number, ":", error)
        await delay(200)
      }
    }

    console.log("[v0] Renumbering complete!")

    return NextResponse.json({ success: true, count: validOrdinals.length })
  } catch (error) {
    console.error("[v0] Error renumbering ordinals:", error)
    return NextResponse.json({ error: "Renumbering failed" }, { status: 500 })
  }
}
