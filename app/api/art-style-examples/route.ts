import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// Art style ID to search pattern mapping
// The art_style column stores the full promptStyle string, so we match by pattern
const ART_STYLE_PATTERNS: Record<string, string> = {
  'chibi': 'Chibi style',
  'anime': 'Anime style',
  'pixel': 'Pixel art style',
  'cartoon': 'cartoon style',
  'realistic': 'Photorealistic style',
  'cyberpunk': 'Cyberpunk style',
  'fantasy': 'fantasy style',
  'watercolor': 'Watercolor',
  'minimalist': 'Minimalist',
  'graffiti': 'graffiti style',
  '3d-cartoon': '3D cartoon style'
};

// GET /api/art-style-examples - Get one random ordinal per art style
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const examples: Record<string, string | null> = {};

    // Query one random ordinal for each art style
    for (const [artStyleId, searchPattern] of Object.entries(ART_STYLE_PATTERNS)) {
      try {
        // Match by pattern since art_style stores full promptStyle string
        const result = await sql`
          SELECT 
            go.thumbnail_url,
            go.compressed_image_url,
            go.image_url
          FROM generated_ordinals go
          INNER JOIN collections c ON go.collection_id = c.id
          WHERE c.art_style ILIKE ${`%${searchPattern}%`}
            AND go.image_url IS NOT NULL
            AND go.image_url != ''
          ORDER BY RANDOM()
          LIMIT 1
        ` as any[];

        if (result && result.length > 0) {
          // Prefer thumbnail, then compressed, then original
          examples[artStyleId] = result[0].thumbnail_url || result[0].compressed_image_url || result[0].image_url;
        } else {
          // Fallback to null if no collection found
          examples[artStyleId] = null;
        }
      } catch (styleError) {
        console.error(`[Art Style Examples] Error fetching ${artStyleId}:`, styleError);
        examples[artStyleId] = null;
      }
    }

    return NextResponse.json({ examples });
  } catch (error) {
    console.error('[Art Style Examples] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch art style examples' }, { status: 500 });
  }
}

