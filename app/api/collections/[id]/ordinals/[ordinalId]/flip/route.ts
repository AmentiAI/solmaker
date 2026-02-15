import { NextRequest, NextResponse } from 'next/server';

import { put } from '@vercel/blob';
import sharp from 'sharp';
import { sql } from '@/lib/database';



// POST /api/collections/[id]/ordinals/[ordinalId]/flip - Flip an image horizontally
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ordinalId: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId, ordinalId } = await params;

    // Get the ordinal - only use columns that actually exist
    const ordinalResult = await sql`
      SELECT 
        id, 
        image_url, 
        ordinal_number, 
        collection_id
      FROM generated_ordinals
      WHERE id = ${ordinalId}
        AND collection_id = ${collectionId}
    ` as any[];

    if (!ordinalResult || ordinalResult.length === 0) {
      return NextResponse.json({ error: 'Ordinal not found' }, { status: 404 });
    }

    const ordinal = ordinalResult[0];
    // Use image_url (the original full-size image), NOT compressed_image_url
    // We only flip the original high-quality image, compressed versions are left untouched
    const imageUrl = ordinal.image_url;
    const ordinalNumber = ordinal.ordinal_number;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL not found' }, { status: 404 });
    }

    // Download the original image (image_url, not compressed_image_url)
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to download image' }, { status: 500 });
    }

    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Flip the image horizontally using Sharp
    const flippedBuffer = await sharp(buffer)
      .flop() // Horizontal flip (left to right)
      .png() // Keep as PNG to preserve quality
      .toBuffer();

    // Calculate the size of the flipped image in KB
    const flippedSizeKB = parseFloat((flippedBuffer.length / 1024).toFixed(2));

    // Upload the flipped image with timestamp to prevent caching issues
    const timestamp = Date.now();
    const flippedFilename = `ordinal-${collectionId}-${ordinalNumber || ordinalId}-flipped-${timestamp}.png`;
    const flippedBlob = new Blob([flippedBuffer], { type: 'image/png' });
    const flippedBlobResult = await put(flippedFilename, flippedBlob, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false, // Don't overwrite - each flip gets a unique filename
    });

    // Update the database with the flipped image URL and size
    // Clear compressed_image_url so the page will auto-compress the new flipped image
    // Update original_size_kb with the flipped image size (if column exists)
    let updateResult;
    try {
      // Try to update image_url, clear compressed_image_url, and update original_size_kb
      // If original_size_kb column doesn't exist, it will fail gracefully
      try {
        updateResult = await sql`
          UPDATE generated_ordinals
          SET
            image_url = ${flippedBlobResult.url},
            thumbnail_url = NULL,
            compressed_image_url = NULL,
            compressed_size_kb = NULL,
            original_size_kb = ${flippedSizeKB}
          WHERE id = ${ordinalId}
            AND collection_id = ${collectionId}
        `;
        console.log('[Flip API] Updated image_url, cleared compressed_image_url, and updated original_size_kb');
      } catch (sizeError: any) {
        // If original_size_kb or compressed_size_kb column doesn't exist, update what we can
        if (sizeError?.message?.includes('original_size_kb') || sizeError?.message?.includes('compressed_size_kb') || sizeError?.message?.includes('column')) {
          console.warn('[Flip API] Some columns may not exist, updating available columns');
          try {
            // Try with compressed_size_kb
            updateResult = await sql`
              UPDATE generated_ordinals
              SET
                image_url = ${flippedBlobResult.url},
                thumbnail_url = NULL,
                compressed_image_url = NULL,
                compressed_size_kb = NULL
              WHERE id = ${ordinalId}
                AND collection_id = ${collectionId}
            `;
            console.log('[Flip API] Updated image_url and cleared compressed_image_url');
          } catch (compressedError: any) {
            // If compressed_size_kb doesn't exist either, just update image_url and clear compressed_image_url
            updateResult = await sql`
              UPDATE generated_ordinals
              SET
                image_url = ${flippedBlobResult.url},
                thumbnail_url = NULL,
                compressed_image_url = NULL
              WHERE id = ${ordinalId}
                AND collection_id = ${collectionId}
            `;
            console.log('[Flip API] Updated image_url and cleared compressed_image_url (no size columns)');
          }
        } else {
          throw sizeError;
        }
      }
      
      // Verify the update worked by querying the updated record
      const verifyResult = await sql`
        SELECT image_url, original_size_kb
        FROM generated_ordinals
        WHERE id = ${ordinalId}
          AND collection_id = ${collectionId}
      ` as any[];
      
      if (verifyResult && verifyResult.length > 0) {
        const updated = verifyResult[0];
        console.log('[Flip API] Verification - Updated image_url:', updated.image_url);
        console.log('[Flip API] Verification - Expected URL:', flippedBlobResult.url);
        console.log('[Flip API] Verification - URLs match:', updated.image_url === flippedBlobResult.url);
        
        if (updated.image_url !== flippedBlobResult.url) {
          console.error('[Flip API] ERROR - Database update did not persist correctly!');
          return NextResponse.json(
            { error: 'Database update failed - URL mismatch' },
            { status: 500 }
          );
        }
      } else {
        console.error('[Flip API] ERROR - Could not verify update, ordinal not found after update');
        return NextResponse.json(
          { error: 'Database update verification failed' },
          { status: 500 }
        );
      }
    } catch (updateError: any) {
      console.error('[Flip API] Database update error:', updateError);
      return NextResponse.json(
        { error: `Database update failed: ${updateError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Image flipped successfully',
      image_url: flippedBlobResult.url,
      ordinal_id: ordinalId,
      size_kb: flippedSizeKB
    });
  } catch (error: any) {
    console.error('Error flipping image:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to flip image' },
      { status: 500 }
    );
  }
}

