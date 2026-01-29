import { NextRequest, NextResponse } from 'next/server';

import { put } from '@vercel/blob';
import { compressImage, needsCompression } from '@/lib/image-compression';
import { sql } from '@/lib/database';



// POST /api/collections/[id]/ordinals/compress - Compress ordinals that don't have compressed versions
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
    const ordinalIds = body.ordinal_ids || []; // Optional: specific ordinal IDs to compress

    // Get collection compression settings
    const collectionResult = await sql`
      SELECT compression_quality, compression_dimensions, compression_target_kb
      FROM collections
      WHERE id = ${collectionId}
    `;
    
    const collection = Array.isArray(collectionResult) ? collectionResult[0] : null;
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const compressionQuality = (collection as any).compression_quality ?? 100;
    const compressionDimensions = (collection as any).compression_dimensions ?? 1024;
    const compressionTargetKB = (collection as any).compression_target_kb ?? null;

    console.log(`[Compression] Collection settings: Quality=${compressionQuality}%, Dimensions=${compressionDimensions}px, TargetKB=${compressionTargetKB || 'not set'}`);

    // If compression settings are at defaults and no target KB, no need to compress
    if (!compressionTargetKB && !needsCompression(compressionQuality, compressionDimensions, compressionTargetKB)) {
      return NextResponse.json({ 
        message: 'Compression not needed (settings at defaults)',
        compressed: 0 
      });
    }

    // Get ordinals that need compression
    // Fetch all ordinals that need compression, then filter by IDs if provided
    // Also include ordinals with PNG compressions that should be recompressed to WebP
    const ordinalsResult = await sql`
      SELECT id, image_url, ordinal_number, compressed_image_url
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND image_url IS NOT NULL
        AND (
          compressed_image_url IS NULL 
          OR compressed_image_url LIKE '%.png'
        )
      ORDER BY 
        CASE WHEN compressed_image_url IS NULL THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 10000
    ` as any[];

    let ordinalsArray = Array.isArray(ordinalsResult) ? ordinalsResult : [];

    // Filter to specific IDs if provided
    if (ordinalIds.length > 0) {
      const idsSet = new Set(ordinalIds);
      ordinalsArray = ordinalsArray.filter((o: any) => idsSet.has(o.id));
    }

    if (ordinalsArray.length === 0) {
      return NextResponse.json({ 
        message: 'No ordinals need compression',
        compressed: 0 
      });
    }

    let compressedCount = 0;
    const errors: string[] = [];

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

        // Compress the image (use target KB if specified, otherwise use quality/dimensions)
        const originalSizeKB = parseFloat((imageBlob.size / 1024).toFixed(2));
        console.log(`[Compression] Compressing ordinal ${ordinalId}: original size ${originalSizeKB} KB`);
        
        if (compressionTargetKB) {
          console.log(`[Compression] Using target KB compression: ${compressionTargetKB} KB`);
        } else {
          console.log(`[Compression] Using quality/dimensions: ${compressionQuality}%, ${compressionDimensions}px`);
        }
        
        const compressedBlob = await compressImage(
          imageBlob,
          compressionQuality,
          compressionDimensions,
          compressionTargetKB || undefined
        );
        
        const compressedSizeKB = parseFloat((compressedBlob.size / 1024).toFixed(2));
        console.log(`[Compression] Compressed ordinal ${ordinalId}: ${originalSizeKB} KB -> ${compressedSizeKB} KB`);
        
        if (compressionTargetKB) {
          const diff = Math.abs(compressedBlob.size - (compressionTargetKB * 1024));
          const diffPercent = ((diff / (compressionTargetKB * 1024)) * 100).toFixed(1);
          console.log(`[Compression] Target: ${compressionTargetKB} KB, Actual: ${compressedSizeKB} KB, Difference: ${(diff / 1024).toFixed(2)} KB (${diffPercent}%)`);
        }

        // Upload compressed image with timestamp to prevent caching issues
        const timestamp = Date.now();
        const compressedFilename = `compressed-${collectionId}-${ordinalNumber || ordinalId}-${timestamp}.webp`;
        const compressedBlobResult = await put(compressedFilename, compressedBlob, {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false, // Don't overwrite - each compression gets a unique filename
        });

        // Update database with compressed image URL and sizes
        await sql`
          UPDATE generated_ordinals
          SET compressed_image_url = ${compressedBlobResult.url},
              compressed_size_kb = ${compressedSizeKB},
              original_size_kb = COALESCE(original_size_kb, ${originalSizeKB})
          WHERE id = ${ordinalId}
        `;

        compressedCount++;
        console.log(`[Compression] Compressed ordinal ${ordinalId}: ${compressedBlobResult.url}`);
      } catch (error: any) {
        console.error(`[Compression] Error compressing ordinal ${ordinal.id}:`, error);
        errors.push(ordinal.id);
      }
    }

    return NextResponse.json({
      message: `Compressed ${compressedCount} ordinal(s)`,
      compressed: compressedCount,
      total: ordinalsArray.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Error compressing ordinals:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to compress ordinals' },
      { status: 500 }
    );
  }
}

