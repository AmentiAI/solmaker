import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';

// POST /api/collections/[id]/ordinals/check-sizes - Check file sizes of ordinals
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
    const { page = 1, limit = 20 } = body;
    const MAX_SIZE_KB = 200;

    // Get all ordinals with their compressed images (prioritize compressed_image_url)
    // Also get original image_url for comparison
    const ordinalsResult = await sql`
      SELECT 
        id, 
        ordinal_number,
        compressed_image_url,
        compressed_size_kb,
        image_url,
        original_size_kb
      FROM generated_ordinals
      WHERE collection_id = ${collectionId}
        AND (compressed_image_url IS NOT NULL OR image_url IS NOT NULL)
      ORDER BY created_at ASC
    ` as any[];

    const ordinals = Array.isArray(ordinalsResult) ? ordinalsResult : [];
    const sizeChecks: Array<{
      id: string;
      ordinal_number: number | null;
      size_kb: number;
      exceeds_limit: boolean;
      has_compressed: boolean;
      filename: string;
      image_url: string;
      original_image_url: string | null;
    }> = [];

    // Check each ordinal's file size (prioritize compressed_image_url)
    for (const ordinal of ordinals) {
      // Use compressed_image_url if available, otherwise fall back to image_url
      const imageUrl = ordinal.compressed_image_url || ordinal.image_url;
      if (!imageUrl) continue;

      let sizeKB = 0;
      
      // Try to use stored compressed size first (most accurate)
      if (ordinal.compressed_image_url && ordinal.compressed_size_kb) {
        sizeKB = parseFloat(ordinal.compressed_size_kb);
      } else if (ordinal.compressed_image_url) {
        // Has compressed URL but no stored size - fetch it
        try {
          const response = await fetch(ordinal.compressed_image_url, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            sizeKB = parseFloat((parseInt(contentLength) / 1024).toFixed(2));
          } else {
            const fullResponse = await fetch(ordinal.compressed_image_url);
            const blob = await fullResponse.blob();
            sizeKB = parseFloat((blob.size / 1024).toFixed(2));
          }
        } catch (error) {
          console.error(`Failed to fetch compressed size for ordinal ${ordinal.id}:`, error);
          // Fall back to original size if available
          if (ordinal.original_size_kb) {
            sizeKB = parseFloat(ordinal.original_size_kb);
          } else {
            continue;
          }
        }
      } else if (ordinal.original_size_kb) {
        // No compressed image, use original size
        sizeKB = parseFloat(ordinal.original_size_kb);
      } else {
        // Fetch actual size from URL
        try {
          const response = await fetch(imageUrl, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            sizeKB = parseFloat((parseInt(contentLength) / 1024).toFixed(2));
          } else {
            const fullResponse = await fetch(imageUrl);
            const blob = await fullResponse.blob();
            sizeKB = parseFloat((blob.size / 1024).toFixed(2));
          }
        } catch (error) {
          console.error(`Failed to fetch size for ordinal ${ordinal.id}:`, error);
          continue;
        }
      }

      // Extract filename from URL (use compressed if available, otherwise original)
      const imageUrlForFilename = ordinal.compressed_image_url || ordinal.image_url;
      const filename = imageUrlForFilename ? imageUrlForFilename.split('/').pop() || imageUrlForFilename : '';
      const filenameEnd = filename.length > 30 ? '...' + filename.slice(-30) : filename;

      // Get original image URL (image_url is always the original, compressed_image_url is the compressed)
      // If we have compressed_image_url, then image_url is the original. Otherwise, there's no original to compare.
      const originalImageUrl = ordinal.compressed_image_url ? ordinal.image_url : null
      
      sizeChecks.push({
        id: ordinal.id,
        ordinal_number: ordinal.ordinal_number,
        size_kb: sizeKB,
        exceeds_limit: sizeKB > MAX_SIZE_KB,
        has_compressed: !!ordinal.compressed_image_url,
        filename: filenameEnd,
        image_url: imageUrl, // Compressed URL for dimension loading on client
        original_image_url: originalImageUrl, // Original uncompressed URL for comparison
      });
    }

    const exceedsLimit = sizeChecks.filter(s => s.exceeds_limit);
    const allUnderLimit = exceedsLimit.length === 0;

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrdinals = sizeChecks.slice(startIndex, endIndex);
    const totalPages = Math.ceil(sizeChecks.length / limit);

    return NextResponse.json({
      total: sizeChecks.length,
      exceeds_limit: exceedsLimit.length,
      all_under_limit: allUnderLimit,
      max_size_kb: MAX_SIZE_KB,
      ordinals: paginatedOrdinals,
      pagination: {
        page,
        limit,
        total_pages: totalPages,
        total_items: sizeChecks.length,
      },
      summary: {
        total: sizeChecks.length,
        under_limit: sizeChecks.length - exceedsLimit.length,
        over_limit: exceedsLimit.length,
        average_size_kb: sizeChecks.length > 0 
          ? parseFloat((sizeChecks.reduce((sum, s) => sum + s.size_kb, 0) / sizeChecks.length).toFixed(2))
          : 0,
        max_size_kb: sizeChecks.length > 0
          ? Math.max(...sizeChecks.map(s => s.size_kb))
          : 0,
      }
    });
  } catch (error: any) {
    console.error('Error checking file sizes:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check file sizes' },
      { status: 500 }
    );
  }
}

