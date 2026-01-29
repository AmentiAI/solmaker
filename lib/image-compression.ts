import sharp from 'sharp';

/**
 * Compress an image using Sharp based on collection settings
 * @param imageBlob - The original image blob
 * @param quality - Compression quality (0-100, where 100 = lossless, lower = more compression)
 * @param dimensions - Target dimensions (width and height, must be square and <= 1024)
 * @param targetKB - Target file size in KB (optional, overrides quality/dimensions if specified)
 * @returns Compressed image blob
 */
export async function compressImage(
  imageBlob: Blob,
  quality: number = 100,
  dimensions: number = 1024,
  targetKB?: number
): Promise<Blob> {
  // If target KB is specified, use iterative compression to reach target size
  if (targetKB !== undefined && targetKB > 0) {
    return compressToTargetSize(imageBlob, targetKB);
  }
  // Ensure dimensions are valid (square, <= 1024, >= 1)
  const validDimensions = Math.max(1, Math.min(1024, Math.round(dimensions)));
  const validQuality = Math.max(0, Math.min(100, Math.round(quality)));

  // Convert blob to buffer for Sharp
  const arrayBuffer = await imageBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Build Sharp pipeline
  let sharpInstance = sharp(buffer);

  // Resize if needed
  if (validDimensions < 1024) {
    sharpInstance = sharpInstance.resize(validDimensions, validDimensions, {
      fit: 'cover', // Maintain square aspect ratio
      withoutEnlargement: true, // Don't upscale smaller images
    });
  }

  // Apply WebP compression
  // WebP is a modern lossy format that provides much better compression than PNG
  // Quality (0-100): Controls visual quality vs file size
  // - 100 = lossless (largest files)
  // - 80-90 = high quality (good balance)
  // - 70 = good quality with significant size reduction
  // - 50-60 = acceptable quality, very small files
  // - 0-40 = lower quality, smallest files
  const compressedBuffer = await sharpInstance
    .webp({
      quality: validQuality, // Use quality directly (0-100)
      effort: 6, // Compression effort (0-6, 6 = best compression but slower)
    })
    .toBuffer();

  // Convert back to blob
  return new Blob([compressedBuffer], { type: 'image/webp' });
}

/**
 * Compress image to target file size in KB using iterative approach
 * @param imageBlob - The original image blob
 * @param targetKB - Target file size in KB
 * @returns Compressed image blob
 */
async function compressToTargetSize(imageBlob: Blob, targetKB: number): Promise<Blob> {
  const targetBytes = targetKB * 1024;
  const arrayBuffer = await imageBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const metadata = await sharp(buffer).metadata();
  const originalSize = buffer.length;
  
  // If already smaller than target, return as-is
  if (originalSize <= targetBytes) {
    console.log(`[Compression] Image already ${(originalSize / 1024).toFixed(2)} KB, smaller than target ${targetKB} KB`);
    return imageBlob;
  }
  
  console.log(`[Compression] Compressing from ${(originalSize / 1024).toFixed(2)} KB to target ${targetKB} KB`);
  
  const currentDimensions = Math.min(1024, metadata.width || 1024, metadata.height || 1024);
  let bestResult: Blob | null = null;
  let bestSizeDiff = Infinity; // Track how close we are to target (absolute difference)
  
  // Try different dimensions and quality levels
  // Start with larger dimensions and work down
  const dimensionSteps = [1024, 768, 512, 384, 256, 192, 128];
  const qualitySteps = [90, 80, 70, 60, 50, 40, 30, 20, 10]; // WebP quality levels
  
  for (const dim of dimensionSteps) {
    if (dim > currentDimensions) continue;
    
    for (const quality of qualitySteps) {
      try {
        const testBuffer = await sharp(buffer)
          .resize(dim, dim, {
            fit: 'cover',
            withoutEnlargement: true,
          })
          .webp({
            quality: quality,
            effort: 6, // Best compression
          })
          .toBuffer();
        
        const testSize = testBuffer.length;
        const sizeDiff = Math.abs(testSize - targetBytes);
        
        // If we're very close to target (within 2%), use this immediately
        if (sizeDiff <= targetBytes * 0.02) {
          console.log(`[Compression] Found perfect match: ${(testSize / 1024).toFixed(2)} KB (target: ${targetKB} KB) at ${dim}x${dim}, quality ${quality}`);
          return new Blob([testBuffer], { type: 'image/webp' });
        }
        
        // Track the best result (closest to target)
        if (sizeDiff < bestSizeDiff) {
          bestSizeDiff = sizeDiff;
          bestResult = new Blob([testBuffer], { type: 'image/webp' });
          console.log(`[Compression] New best: ${(testSize / 1024).toFixed(2)} KB (diff: ${(sizeDiff / 1024).toFixed(2)} KB) at ${dim}x${dim}, quality ${quality}`);
        }
        
        // If we're smaller than target, we can stop trying higher quality levels for this dimension
        // and move to next dimension (smaller) to get closer to target
        if (testSize < targetBytes * 0.8) {
          break; // Move to next dimension
        }
      } catch (error) {
        console.error(`[Compression] Error compressing with dim=${dim}, quality=${quality}:`, error);
        continue;
      }
    }
  }
  
  // If we found a result, return it
  if (bestResult) {
    const bestSize = (await bestResult.arrayBuffer()).byteLength;
    console.log(`[Compression] Using best result: ${(bestSize / 1024).toFixed(2)} KB (target: ${targetKB} KB, diff: ${(bestSizeDiff / 1024).toFixed(2)} KB)`);
    return bestResult;
  }
  
  // Fallback: use maximum compression
  console.log(`[Compression] Using fallback: maximum compression`);
  const fallbackBuffer = await sharp(buffer)
    .resize(256, 256, {
      fit: 'cover',
      withoutEnlargement: true,
    })
    .webp({
      quality: 20, // Low quality for maximum compression
      effort: 6,
    })
    .toBuffer();
  
  const fallbackSize = fallbackBuffer.length;
  console.log(`[Compression] Fallback result: ${(fallbackSize / 1024).toFixed(2)} KB`);
  return new Blob([fallbackBuffer], { type: 'image/webp' });
}

/**
 * Check if compression settings are at defaults (no compression needed)
 */
export function needsCompression(quality: number, dimensions: number, targetKB?: number): boolean {
  if (targetKB !== undefined && targetKB > 0) {
    return true; // KB-based compression always needs compression
  }
  return quality < 100 || dimensions < 1024;
}

