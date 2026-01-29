import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { compressImage } from '@/lib/image-compression';
import { sql } from '@/lib/database';

// POST /api/collections/[id]/ordinals/recompress - Recompress all ordinals with new settings
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;
    const body = await request.json().catch(() => ({}));
    const { 
      compression_quality, 
      compression_dimensions, 
      compression_target_kb,
      compression_format = 'webp'
    } = body;

    if (!compression_quality && !compression_dimensions && !compression_target_kb) {
      return NextResponse.json({ 
        error: 'At least one compression setting is required' 
      }, { status: 400 });
    }

    // Update collection compression settings
    await sql`
      UPDATE collections
      SET 
        compression_quality = ${compression_quality || null},
        compression_dimensions = ${compression_dimensions || null},
        compression_target_kb = ${compression_target_kb || null},
        compression_format = ${compression_format}
      WHERE id = ${collectionId}
    `;

    // Get all ordinals that need recompression
    const ordinalsResult = await sql`
      SELECT id, image_url, ordinal_number, compressed_image_url
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND image_url IS NOT NULL
      ORDER BY ordinal_number ASC NULLS LAST, created_at ASC
    ` as any[];

    const ordinalsArray = Array.isArray(ordinalsResult) ? ordinalsResult : [];

    if (ordinalsArray.length === 0) {
      return NextResponse.json({ 
        message: 'No ordinals found to compress',
        compressed: 0,
        total: 0
      });
    }

    let compressedCount = 0;
    const errors: string[] = [];
    const results: Array<{
      id: string;
      ordinal_number: number | null;
      original_size_kb: number;
      compressed_size_kb: number;
      success: boolean;
    }> = [];

    // Compress each ordinal
    for (const ordinal of ordinalsArray) {
      try {
        const imageUrl = ordinal.image_url;
        const ordinalId = ordinal.id;
        const ordinalNumber = ordinal.ordinal_number;

        // Download the original image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }

        const imageBlob = await imageResponse.blob();
        const originalSizeKB = parseFloat((imageBlob.size / 1024).toFixed(2));

        // Compress the image
        const compressedBlob = await compressImage(
          imageBlob,
          compression_quality ?? 100,
          compression_dimensions ?? 1024,
          compression_target_kb || undefined
        );

        const compressedSizeKB = parseFloat((compressedBlob.size / 1024).toFixed(2));

        // Upload compressed image
        const timestamp = Date.now();
        const fileExtension = compression_format === 'jpg' ? 'jpg' : compression_format === 'png' ? 'png' : 'webp';
        const compressedFilename = `compressed-${collectionId}-${ordinalNumber || ordinalId}-${timestamp}.${fileExtension}`;
        
        const compressedBlobResult = await put(compressedFilename, compressedBlob, {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
        });

        // Update database
        await sql`
          UPDATE generated_ordinals
          SET compressed_image_url = ${compressedBlobResult.url},
              compressed_size_kb = ${compressedSizeKB},
              original_size_kb = COALESCE(original_size_kb, ${originalSizeKB})
          WHERE id = ${ordinalId}
        `;

        compressedCount++;
        results.push({
          id: ordinalId,
          ordinal_number: ordinalNumber,
          original_size_kb: originalSizeKB,
          compressed_size_kb: compressedSizeKB,
          success: true,
        });
      } catch (error: any) {
        console.error(`Error compressing ordinal ${ordinal.id}:`, error);
        errors.push(ordinal.id);
        results.push({
          id: ordinal.id,
          ordinal_number: ordinal.ordinal_number,
          original_size_kb: 0,
          compressed_size_kb: 0,
          success: false,
        });
      }
    }

    return NextResponse.json({
      message: `Recompressed ${compressedCount} ordinal(s)`,
      compressed: compressedCount,
      total: ordinalsArray.length,
      errors: errors.length > 0 ? errors : undefined,
      results: results,
    });
  } catch (error: any) {
    console.error('Error recompressing ordinals:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to recompress ordinals' },
      { status: 500 }
    );
  }
}

