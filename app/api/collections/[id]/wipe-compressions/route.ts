import { NextRequest, NextResponse } from 'next/server';

import { del, list } from '@vercel/blob';
import { sql } from '@/lib/database';



// POST /api/collections/[id]/wipe-compressions - Delete all compressed images for a collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sql) {
    return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
  }

  try {
    const { id: collectionId } = await params;

    // Get all compressed image URLs for this collection
    const result = await sql`
      SELECT compressed_image_url
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND compressed_image_url IS NOT NULL
    ` as any[];

    const compressedUrls = Array.isArray(result) 
      ? result.map(row => row.compressed_image_url).filter(Boolean)
      : [];

    if (compressedUrls.length === 0) {
      return NextResponse.json({ 
        message: 'No compressed images found for this collection',
        deleted: 0 
      });
    }

    // Delete compressed images from Vercel Blob
    let deletedCount = 0;
    const errors: string[] = [];

    for (const url of compressedUrls) {
      try {
        // Extract blob path from URL
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        // Vercel blob URLs are like: https://xxx.public.blob.vercel-storage.com/filename-xxx
        // We need to extract the filename part
        const parts = pathname.split('/');
        const filename = parts[parts.length - 1];
        
        // List blobs to find the exact match
        const { blobs } = await list({ prefix: `compressed-${collectionId}-` });
        const matchingBlob = blobs.find(b => b.url === url);
        
        if (matchingBlob) {
          await del(matchingBlob.url);
          deletedCount++;
        }
      } catch (error: any) {
        console.error(`Error deleting compressed image ${url}:`, error);
        errors.push(url);
      }
    }

    // Clear compressed_image_url and compressed_size_kb from database
    await sql`
      UPDATE generated_ordinals
      SET compressed_image_url = NULL,
          compressed_size_kb = NULL
      WHERE collection_id = ${collectionId}
    `;

    return NextResponse.json({
      message: `Deleted ${deletedCount} compressed image(s)`,
      deleted: deletedCount,
      total: compressedUrls.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('Error wiping compressions:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to wipe compressions' },
      { status: 500 }
    );
  }
}

