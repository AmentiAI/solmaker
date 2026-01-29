import { list } from "@vercel/blob"
import { NextResponse } from "next/server"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, maxRetries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          // Rate limit or service unavailable - wait longer and retry
          const waitTime = Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s
          console.log(`[v0] Rate limit hit, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`)
          await delay(waitTime)
          continue
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const text = await response.text()

      if (!text || text.startsWith("Too Many")) {
        // Rate limit in response body
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000
          console.log(`[v0] Rate limit in response, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`)
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const collectionId = searchParams.get('collectionId')

    const { blobs } = await list({
      prefix: "ordinal-",
    })

    const metadataBlobs = blobs.filter((blob) => blob.pathname.endsWith("-metadata.json"))

    console.log("[v0] Found", metadataBlobs.length, "saved ordinals")

    const ordinals = []
    for (const blob of metadataBlobs) {
      try {
        const metadata = await fetchWithRetry(blob.url)

        if (metadata) {
          // Filter by collection ID if provided
          if (collectionId && metadata.collectionId !== collectionId) {
            continue
          }

          ordinals.push({
            id: blob.pathname,
            metadataUrl: blob.url,
            ...metadata,
          })
        }

        await delay(300)
      } catch (error) {
        console.error("[v0] Error fetching metadata for", blob.pathname, ":", error)
        await delay(300)
      }
    }

    const validOrdinals = ordinals.sort((a, b) => a.number - b.number)

    console.log(`[v0] Returning ${validOrdinals.length} ordinals${collectionId ? ` for collection ${collectionId}` : ''}`)
    return NextResponse.json({ ordinals: validOrdinals })
  } catch (error) {
    console.error("[v0] Error listing ordinals:", error)
    return NextResponse.json({ error: "Failed to list ordinals" }, { status: 500 })
  }
}
