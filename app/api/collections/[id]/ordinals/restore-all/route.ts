import { NextRequest, NextResponse } from 'next/server';

import { put } from '@vercel/blob';
import sharp from 'sharp';
import { sql } from '@/lib/database';



// POST /api/collections/[id]/ordinals/restore-all - Restore all ordinals in a collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;

    // Get all ordinals for this collection
    let ordinalsResult;
    try {
      ordinalsResult = await sql`
        SELECT 
          id, 
          image_url, 
          COALESCE(original_image_url, image_url) as original_image_url, 
          ordinal_number, 
          collection_id
        FROM generated_ordinals
        WHERE collection_id = ${collectionId}
        ORDER BY created_at DESC
      ` as any[];
    } catch (queryError: any) {
      // If original_image_url column doesn't exist, query without it
      if (queryError?.message?.includes('original_image_url') || queryError?.message?.includes('column')) {
        ordinalsResult = await sql`
          SELECT 
            id, 
            image_url, 
            image_url as original_image_url, 
            ordinal_number, 
            collection_id
          FROM generated_ordinals
          WHERE collection_id = ${collectionId}
          ORDER BY created_at DESC
        ` as any[];
      } else {
        throw queryError;
      }
    }

    if (!ordinalsResult || ordinalsResult.length === 0) {
      return NextResponse.json({ 
        message: 'No ordinals found in this collection',
        restored: 0,
        total: 0
      });
    }

    let restoredCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each ordinal
    for (const ordinal of ordinalsResult) {
      try {
        const currentImageUrl = ordinal.image_url;
        let originalImageUrl = ordinal.original_image_url;

        // If original_image_url is the same as current, try to restore by flipping again
        if (!originalImageUrl || originalImageUrl === currentImageUrl) {
          // No original stored - flip the current image to restore it
          try {
            const imageResponse = await fetch(currentImageUrl);
            if (!imageResponse.ok) {
              errorCount++;
              errors.push(`Ordinal ${ordinal.id}: Failed to download image`);
              continue;
            }

            const imageBlob = await imageResponse.blob();
            const arrayBuffer = await imageBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Flip the image to restore it (flip again = original)
            const restoredBuffer = await sharp(buffer)
              .flop() // Horizontal flip (left to right)
              .png()
              .toBuffer();

            // Upload the restored image
            const restoredFilename = `ordinal-${collectionId}-${ordinal.ordinal_number || ordinal.id}-restored.png`;
            const restoredBlob = new Blob([restoredBuffer], { type: 'image/png' });
            const restoredBlobResult = await put(restoredFilename, restoredBlob, {
              access: 'public',
              addRandomSuffix: false,
            });

            originalImageUrl = restoredBlobResult.url;
          } catch (flipError: any) {
            console.error(`Error flipping to restore ordinal ${ordinal.id}:`, flipError);
            errorCount++;
            errors.push(`Ordinal ${ordinal.id}: Unable to restore by flipping`);
            continue;
          }
        }

        // If current image is the same as original, skip
        if (originalImageUrl === currentImageUrl) {
          skippedCount++;
          continue;
        }

        // Restore the original image URL
        try {
          await sql`
            UPDATE generated_ordinals
            SET image_url = ${originalImageUrl}
            WHERE id = ${ordinal.id}
          `;
          restoredCount++;
        } catch (updateError: any) {
          console.error(`Error updating image_url for ordinal ${ordinal.id}:`, updateError);
          errorCount++;
          errors.push(`Ordinal ${ordinal.id}: Failed to update database`);
        }
      } catch (error: any) {
        console.error(`Error processing ordinal ${ordinal.id}:`, error);
        errorCount++;
        errors.push(`Ordinal ${ordinal.id}: ${error?.message || 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      message: `Restore complete: ${restoredCount} restored, ${skippedCount} already original, ${errorCount} errors`,
      restored: restoredCount,
      skipped: skippedCount,
      errors: errorCount,
      total: ordinalsResult.length,
      errorDetails: errors.length > 0 ? errors.slice(0, 10) : [] // Limit error details to first 10
    });
  } catch (error: any) {
    console.error('Error restoring collection:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to restore collection' },
      { status: 500 }
    );
  }
}
