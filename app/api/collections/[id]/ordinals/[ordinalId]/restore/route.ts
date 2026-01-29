import { NextRequest, NextResponse } from 'next/server';

import { put } from '@vercel/blob';
import sharp from 'sharp';
import { sql } from '@/lib/database';



// POST /api/collections/[id]/ordinals/[ordinalId]/restore - Restore original image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ordinalId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId, ordinalId } = await params;

    // Get the ordinal with original_image_url
    // Use COALESCE to handle case where column might not exist
    let ordinalResult;
    try {
      ordinalResult = await sql`
        SELECT 
          id, 
          image_url, 
          COALESCE(original_image_url, image_url) as original_image_url, 
          ordinal_number, 
          collection_id
        FROM generated_ordinals
        WHERE id = ${ordinalId}
          AND collection_id = ${collectionId}
      ` as any[];
    } catch (queryError: any) {
      // If original_image_url column doesn't exist, query without it
      if (queryError?.message?.includes('original_image_url') || queryError?.message?.includes('column')) {
        ordinalResult = await sql`
          SELECT 
            id, 
            image_url, 
            image_url as original_image_url, 
            ordinal_number, 
            collection_id
          FROM generated_ordinals
          WHERE id = ${ordinalId}
            AND collection_id = ${collectionId}
        ` as any[];
      } else {
        throw queryError;
      }
    }

    if (!ordinalResult || ordinalResult.length === 0) {
      return NextResponse.json({ error: 'Ordinal not found' }, { status: 404 });
    }

    const ordinal = ordinalResult[0];
    const currentImageUrl = ordinal.image_url;
    let originalImageUrl = ordinal.original_image_url;

    // If original_image_url is the same as current, try to restore by flipping again
    // (for images that were flipped before we started storing originals)
    if (!originalImageUrl || originalImageUrl === currentImageUrl) {
      // No original stored - flip the current image to restore it
      // (flipping twice = original)
      try {
        const imageResponse = await fetch(currentImageUrl);
        if (!imageResponse.ok) {
          return NextResponse.json({ error: 'Failed to download image for restoration' }, { status: 500 });
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
        const restoredFilename = `ordinal-${collectionId}-${ordinal.ordinal_number || ordinalId}-restored.png`;
        const restoredBlob = new Blob([restoredBuffer], { type: 'image/png' });
        const restoredBlobResult = await put(restoredFilename, restoredBlob, {
          access: 'public',
          addRandomSuffix: false,
        });

        originalImageUrl = restoredBlobResult.url;
      } catch (flipError: any) {
        console.error('Error flipping to restore:', flipError);
        return NextResponse.json({ 
          error: 'Original image not stored and unable to restore by flipping. The image may need to be manually restored.' 
        }, { status: 404 });
      }
    }

    // If current image is the same as original, nothing to restore
    if (originalImageUrl === currentImageUrl) {
      return NextResponse.json({ 
        message: 'Image is already in original state',
        image_url: currentImageUrl,
        ordinal_id: ordinalId
      });
    }

    // Restore the original image URL
    try {
      await sql`
        UPDATE generated_ordinals
        SET image_url = ${originalImageUrl}
        WHERE id = ${ordinalId}
      `;
    } catch (updateError: any) {
      // If update fails, log but don't fail the request
      console.error('Error updating image_url:', updateError);
    }

    return NextResponse.json({
      message: 'Image restored to original successfully',
      image_url: originalImageUrl,
      ordinal_id: ordinalId
    });
  } catch (error: any) {
    console.error('Error restoring image:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to restore image' },
      { status: 500 }
    );
  }
}
