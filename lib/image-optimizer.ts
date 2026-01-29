import sharp from 'sharp'

/**
 * Creates an optimized thumbnail from an image blob
 * @param imageBlob - Original image blob
 * @param maxWidth - Maximum width in pixels (default: 512)
 * @param quality - JPEG quality 1-100 (default: 80)
 * @returns Optimized image buffer
 */
export async function createThumbnail(
  imageBlob: Blob,
  maxWidth: number = 512,
  quality: number = 80
): Promise<Buffer> {
  // Convert Blob to Buffer
  const arrayBuffer = await imageBlob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Resize and compress
  const thumbnail = await sharp(buffer)
    .resize(maxWidth, maxWidth, {
      fit: 'inside', // Maintain aspect ratio
      withoutEnlargement: true, // Don't upscale smaller images
    })
    .jpeg({
      quality,
      mozjpeg: true, // Use mozjpeg for better compression
    })
    .toBuffer()

  return thumbnail
}

/**
 * Get file size in KB
 */
export function getFileSizeKB(buffer: Buffer): number {
  return Math.round(buffer.length / 1024)
}

/**
 * Creates multiple thumbnail sizes
 * @param imageBlob - Original image blob
 * @returns Object with different thumbnail sizes
 */
export async function createThumbnailSizes(imageBlob: Blob) {
  const arrayBuffer = await imageBlob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const [small, medium, large] = await Promise.all([
    // Small: 256px - for grid previews
    sharp(buffer)
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer(),
    
    // Medium: 512px - for detail view
    sharp(buffer)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
    
    // Large: 1024px - for high-res preview
    sharp(buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer(),
  ])

  return { small, medium, large }
}

/**
 * Creates a placeholder image with "contentviolation" text
 * @param width - Image width (default: 1024)
 * @param height - Image height (default: 1024)
 * @returns PNG buffer with contentviolation text
 */
export async function createContentViolationImage(
  width: number = 1024,
  height: number = 1024
): Promise<Buffer> {
  // Create SVG with text
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1a1a1a"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="${Math.floor(width / 10)}" 
        font-weight="bold" 
        fill="#ff4444" 
        text-anchor="middle" 
        dominant-baseline="middle"
      >
        contentviolation
      </text>
    </svg>
  `.trim();

  // Convert SVG to PNG using Sharp
  const buffer = await sharp(Buffer.from(svg))
    .resize(width, height)
    .png()
    .toBuffer();

  return buffer;
}

