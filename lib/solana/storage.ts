/**
 * Storage utilities for uploading NFT images and metadata
 * Supports multiple storage providers
 */

import { put } from '@vercel/blob'

export type StorageProvider = 'vercel-blob' | 'arweave' | 'shadow-drive'

export interface UploadResult {
  uri: string
  provider: StorageProvider
  size: number
}

/**
 * Upload image to storage
 * For MVP, we'll use Vercel Blob (already integrated in your app)
 * Can expand to Arweave/Shadow Drive later
 */
export async function uploadImage(
  imageData: Buffer | Blob,
  filename: string,
  provider: StorageProvider = 'vercel-blob'
): Promise<UploadResult> {
  if (provider === 'vercel-blob') {
    return uploadToVercelBlob(imageData, filename)
  }
  
  // TODO: Add Arweave and Shadow Drive support
  throw new Error(`Storage provider ${provider} not yet implemented`)
}

/**
 * Upload metadata JSON to storage
 */
export async function uploadMetadata(
  metadata: any,
  filename: string,
  provider: StorageProvider = 'vercel-blob'
): Promise<UploadResult> {
  const jsonString = JSON.stringify(metadata, null, 2)
  const buffer = Buffer.from(jsonString, 'utf-8')
  
  if (provider === 'vercel-blob') {
    return uploadToVercelBlob(buffer, `${filename}.json`)
  }
  
  throw new Error(`Storage provider ${provider} not yet implemented`)
}

/**
 * Upload to Vercel Blob storage
 * This is the quickest solution for MVP
 */
async function uploadToVercelBlob(
  data: Buffer | Blob,
  filename: string
): Promise<UploadResult> {
  const blob = data instanceof Buffer ? new Blob([data]) : data
  
  const result = await put(filename, blob, {
    access: 'public',
    addRandomSuffix: true,
  })

  return {
    uri: result.url,
    provider: 'vercel-blob',
    size: blob.size,
  }
}

/**
 * Batch upload images for a collection
 */
export async function batchUploadImages(
  images: Array<{ data: Buffer; filename: string }>,
  provider: StorageProvider = 'vercel-blob'
): Promise<UploadResult[]> {
  const uploads = await Promise.all(
    images.map(img => uploadImage(img.data, img.filename, provider))
  )
  return uploads
}

/**
 * Batch upload metadata JSONs for a collection
 */
export async function batchUploadMetadata(
  metadataList: Array<{ metadata: any; filename: string }>,
  provider: StorageProvider = 'vercel-blob'
): Promise<UploadResult[]> {
  const uploads = await Promise.all(
    metadataList.map(meta => uploadMetadata(meta.metadata, meta.filename, provider))
  )
  return uploads
}

/**
 * Upload collection assets (images + metadata)
 * Returns URIs for Candy Machine config lines
 */
export async function uploadCollectionAssets(params: {
  nfts: Array<{
    id: string
    name: string
    imageData: Buffer
    metadata: any
  }>
  provider?: StorageProvider
}): Promise<Array<{
  nftId: string
  imageUri: string
  metadataUri: string
}>> {
  const provider = params.provider || 'vercel-blob'
  const results = []

  for (const nft of params.nfts) {
    // Upload image
    const imageResult = await uploadImage(
      nft.imageData,
      `${nft.id}.png`,
      provider
    )

    // Update metadata with image URI
    const metadataWithImage = {
      ...nft.metadata,
      image: imageResult.uri,
    }

    // Upload metadata
    const metadataResult = await uploadMetadata(
      metadataWithImage,
      nft.id,
      provider
    )

    results.push({
      nftId: nft.id,
      imageUri: imageResult.uri,
      metadataUri: metadataResult.uri,
    })
  }

  return results
}

/**
 * Estimate storage costs
 */
export function estimateStorageCost(params: {
  numImages: number
  avgImageSizeKb: number
  provider: StorageProvider
}): {
  totalCostUsd: number
  perImageCostUsd: number
  notes: string
} {
  if (params.provider === 'vercel-blob') {
    // Vercel Blob is included in hosting, essentially free for reasonable usage
    return {
      totalCostUsd: 0,
      perImageCostUsd: 0,
      notes: 'Vercel Blob storage included in hosting plan',
    }
  }

  if (params.provider === 'arweave') {
    // Approximate: $5-10 per GB permanent storage
    const totalSizeGb = (params.numImages * params.avgImageSizeKb) / 1024 / 1024
    const costPerGb = 7.5
    return {
      totalCostUsd: totalSizeGb * costPerGb,
      perImageCostUsd: (totalSizeGb * costPerGb) / params.numImages,
      notes: 'Arweave permanent storage (~$7.50/GB one-time)',
    }
  }

  if (params.provider === 'shadow-drive') {
    // Shadow Drive: ~$1/GB/year
    const totalSizeGb = (params.numImages * params.avgImageSizeKb) / 1024 / 1024
    return {
      totalCostUsd: totalSizeGb * 1.0,
      perImageCostUsd: (totalSizeGb * 1.0) / params.numImages,
      notes: 'Shadow Drive (~$1/GB/year, paid in SOL)',
    }
  }

  return {
    totalCostUsd: 0,
    perImageCostUsd: 0,
    notes: 'Unknown provider',
  }
}
