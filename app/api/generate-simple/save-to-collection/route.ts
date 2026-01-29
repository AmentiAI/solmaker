import { NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { sql } from '@/lib/database';

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
  }

  try {
    const { collectionId, imageUrl, prompt, description, artStyle, borderStyle } = await request.json()

    if (!collectionId || !imageUrl || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: collectionId, imageUrl, and prompt are required' },
        { status: 400 }
      )
    }

    // Verify collection exists and get art_style
    const collection = await sql`
      SELECT id, art_style FROM collections WHERE id = ${collectionId}
    `

    if (!collection || (collection as any[]).length === 0) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const collectionData = Array.isArray(collection) ? collection[0] : collection
    const collectionArtStyle = (collectionData as any).art_style || null

    // Insert into generated_ordinals table
    // For simple generator images, we don't have traits or ordinal_number, so we use null
    const result = await sql`
      INSERT INTO generated_ordinals (
        collection_id,
        image_url,
        prompt,
        traits,
        ordinal_number,
        trait_combination_hash,
        art_style
      )
      VALUES (
        ${collectionId},
        ${imageUrl},
        ${prompt},
        ${JSON.stringify({
          source: 'simple-generator',
          description: description || null,
          artStyle: artStyle || null,
          borderStyle: borderStyle || null,
        })},
        NULL,
        NULL,
        ${collectionArtStyle}
      )
      RETURNING id, created_at
    `

    const ordinal = Array.isArray(result) ? result[0] : result

    return NextResponse.json({
      success: true,
      ordinal: {
        id: ordinal.id,
        collectionId,
        imageUrl,
        prompt,
        createdAt: ordinal.created_at,
      },
    })
  } catch (error) {
    console.error('[Simple Generator Save] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save image to collection', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
















