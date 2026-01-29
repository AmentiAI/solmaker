/**
 * Metadata builder for Solana NFTs
 * Creates JSON metadata following Metaplex Token Metadata standard
 */

export interface NftAttribute {
  trait_type: string
  value: string | number
}

export interface NftMetadata {
  name: string
  symbol: string
  description: string
  image: string // URI to image
  external_url?: string
  attributes?: NftAttribute[]
  properties?: {
    category?: 'image' | 'video' | 'audio'
    files?: Array<{
      uri: string
      type: string
    }>
    creators?: Array<{
      address: string
      share: number
    }>
  }
  seller_fee_basis_points?: number
  collection?: {
    name: string
    family: string
  }
}

/**
 * Build NFT metadata JSON following Metaplex standard
 */
export function buildNftMetadata(params: {
  name: string
  symbol: string
  description: string
  imageUri: string
  attributes?: Array<{ trait_type: string; value: string | number }>
  creators?: Array<{ address: string; share: number }>
  sellerFeeBasisPoints?: number
  collectionName?: string
  collectionFamily?: string
  externalUrl?: string
}): NftMetadata {
  const metadata: NftMetadata = {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    image: params.imageUri,
  }

  if (params.externalUrl) {
    metadata.external_url = params.externalUrl
  }

  if (params.attributes && params.attributes.length > 0) {
    metadata.attributes = params.attributes
  }

  if (params.sellerFeeBasisPoints !== undefined) {
    metadata.seller_fee_basis_points = params.sellerFeeBasisPoints
  }

  // Properties section
  metadata.properties = {
    category: 'image',
    files: [{
      uri: params.imageUri,
      type: 'image/png', // Adjust based on actual type
    }],
  }

  if (params.creators && params.creators.length > 0) {
    metadata.properties.creators = params.creators
  }

  if (params.collectionName && params.collectionFamily) {
    metadata.collection = {
      name: params.collectionName,
      family: params.collectionFamily,
    }
  }

  return metadata
}

/**
 * Build collection metadata JSON
 */
export function buildCollectionMetadata(params: {
  name: string
  symbol: string
  description: string
  imageUri: string
  externalUrl?: string
  creators?: Array<{ address: string; share: number }>
  sellerFeeBasisPoints?: number
}): NftMetadata {
  return {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    image: params.imageUri,
    external_url: params.externalUrl,
    seller_fee_basis_points: params.sellerFeeBasisPoints || 0,
    properties: {
      category: 'image',
      files: [{
        uri: params.imageUri,
        type: 'image/png',
      }],
      creators: params.creators,
    },
  }
}

/**
 * Validate metadata JSON
 */
export function validateMetadata(metadata: NftMetadata): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!metadata.name || metadata.name.length === 0) {
    errors.push('Name is required')
  }
  if (!metadata.symbol || metadata.symbol.length === 0) {
    errors.push('Symbol is required')
  }
  if (!metadata.image || metadata.image.length === 0) {
    errors.push('Image URI is required')
  }
  if (!metadata.description || metadata.description.length === 0) {
    errors.push('Description is required')
  }

  // Validate attributes if present
  if (metadata.attributes) {
    metadata.attributes.forEach((attr, index) => {
      if (!attr.trait_type) {
        errors.push(`Attribute ${index} missing trait_type`)
      }
      if (attr.value === undefined || attr.value === null) {
        errors.push(`Attribute ${index} missing value`)
      }
    })
  }

  // Validate creators shares sum to 100 if present
  if (metadata.properties?.creators) {
    const totalShare = metadata.properties.creators.reduce((sum, c) => sum + c.share, 0)
    if (totalShare !== 100) {
      errors.push(`Creator shares must sum to 100, got ${totalShare}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Convert database ordinal attributes to NFT metadata attributes
 */
export function convertOrdinalAttributesToMetadata(
  attributes: Record<string, any>
): NftAttribute[] {
  return Object.entries(attributes).map(([key, value]) => ({
    trait_type: key,
    value: value,
  }))
}
