import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { put } from '@vercel/blob';
import sharp from 'sharp';

// Helper function to create 200x200 thumbnail
async function createFrontPageThumbnail(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Resize to exactly 200x200, fit inside (maintains aspect ratio)
  const thumbnail = await sharp(buffer)
    .resize(200, 200, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 75,
      mozjpeg: true,
    })
    .toBuffer();
  
  return thumbnail;
}

// GET /api/ordinals/random - Get random ordinals with 200x200 front page thumbnails
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    // Ensure homepage columns exist (silently fail if they don't)
    try {
      await sql`
        ALTER TABLE generated_ordinals 
        ADD COLUMN IF NOT EXISTS hidden_from_homepage BOOLEAN DEFAULT FALSE
      `
      await sql`
        ALTER TABLE collections 
        ADD COLUMN IF NOT EXISTS hidden_from_homepage BOOLEAN DEFAULT FALSE
      `
      await sql`
        ALTER TABLE collections
        ADD COLUMN IF NOT EXISTS force_show_on_homepage_ticker BOOLEAN DEFAULT FALSE
      `
    } catch (error) {
      // Columns might already exist or table structure issue - ignore
    }

    // Blocklisted collection ID
    const excludedCollectionId = '96541454-e6be-469f-9012-00f778ee8a85';
    
    // Get random ordinals with image_url, excluding hidden ones, ordinals from hidden collections,
    // and blocklisted collection IDs. Newer collections can be included by setting
    // collections.force_show_on_homepage_ticker = TRUE.
    const result = await sql`
      SELECT 
        go.id,
        go.collection_id,
        go.ordinal_number,
        go.image_url,
        go.compressed_image_url,
        c.name as collection_name
      FROM generated_ordinals go
      INNER JOIN collections c ON go.collection_id = c.id
      WHERE go.image_url IS NOT NULL
        AND go.image_url != ''
        AND (go.hidden_from_homepage IS NULL OR go.hidden_from_homepage = FALSE)
        AND (c.hidden_from_homepage IS NULL OR c.hidden_from_homepage = FALSE)
        AND (c.created_at < '2025-12-15'::date OR c.force_show_on_homepage_ticker = TRUE)
        AND c.id != ${excludedCollectionId}
      ORDER BY RANDOM()
      LIMIT ${limit}
    ` as any[];

    const ordinals = Array.isArray(result) ? result : [];
    const processedOrdinals = [];

    // Process each ordinal to ensure 200x200 thumbnail exists
    for (const ordinal of ordinals) {
      try {
        // Check if front page thumbnail already exists
        const existingThumbnail = await sql`
          SELECT thumbnail_url
          FROM front_page_thumbnails
          WHERE ordinal_id = ${ordinal.id}
          LIMIT 1
        ` as any[];

        let thumbnailUrl: string;

        if (Array.isArray(existingThumbnail) && existingThumbnail.length > 0) {
          // Use existing thumbnail
          thumbnailUrl = existingThumbnail[0].thumbnail_url;
        } else {
          // Generate thumbnail on-the-fly
          const imageUrl = ordinal.compressed_image_url || ordinal.image_url;
          
          if (!imageUrl) {
            continue; // Skip if no image URL
          }

          console.log(`[Front Page Thumbnail] Generating 200x200 thumbnail for ordinal ${ordinal.id}`);
          
          const thumbnailBuffer = await createFrontPageThumbnail(imageUrl);
          
          // Upload to Vercel Blob
          const thumbnailFilename = `front-page-thumb-${ordinal.id}-${Date.now()}.jpg`;
          const thumbnailBlob = await put(thumbnailFilename, new Blob([new Uint8Array(thumbnailBuffer)], { type: 'image/jpeg' }), {
            access: 'public',
            addRandomSuffix: false,
            contentType: 'image/jpeg',
          });

          thumbnailUrl = thumbnailBlob.url;

          // Save to database
          await sql`
            INSERT INTO front_page_thumbnails (ordinal_id, thumbnail_url)
            VALUES (${ordinal.id}, ${thumbnailUrl})
            ON CONFLICT (ordinal_id) DO UPDATE SET thumbnail_url = ${thumbnailUrl}
          `;

          console.log(`[Front Page Thumbnail] Created and saved: ${thumbnailUrl}`);
        }

        processedOrdinals.push({
          id: ordinal.id,
          collection_id: ordinal.collection_id,
          collection_name: ordinal.collection_name,
          ordinal_number: ordinal.ordinal_number,
          image_url: thumbnailUrl, // Only return 200x200 thumbnail URL
        });
      } catch (error: any) {
        console.error(`[Front Page Thumbnail] Error processing ordinal ${ordinal.id}:`, error);
        // Continue with next ordinal if this one fails
        continue;
      }
    }

    return NextResponse.json(
      {
        ordinals: processedOrdinals,
        count: processedOrdinals.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error: any) {
    console.error('[Random Ordinals API] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch random ordinals',
      details: error?.message 
    }, { status: 500 });
  }
}
