import { 
  createNft,
  CreateNftInput,
  TokenStandard,
  fetchDigitalAsset,
} from '@metaplex-foundation/mpl-token-metadata'
import { 
  generateSigner,
  percentAmount,
  publicKey,
  PublicKey as UmiPublicKey,
  Umi,
  TransactionBuilder,
} from '@metaplex-foundation/umi'
import { createUmiInstance, createUmiWithSigner } from './umi-config'

export interface CreateCollectionParams {
  name: string
  symbol: string
  uri: string // Metadata JSON URI
  sellerFeeBasisPoints: number // Royalties in basis points (500 = 5%)
  creators?: Array<{
    address: string
    share: number // Percentage (0-100)
  }>
}

export interface CollectionNftResult {
  collectionMint: string
  transaction: string // Serialized transaction for user to sign
  signer: any // Mint signer to pass back to frontend
}

/**
 * Create a Collection NFT on-chain
 * This is the master NFT that all minted NFTs will be part of
 * 
 * The user (collection owner) must sign this transaction
 */
export async function createCollectionNFT(
  umi: Umi,
  params: CreateCollectionParams
): Promise<{ builder: TransactionBuilder; collectionMint: UmiPublicKey }> {
  const collectionMint = generateSigner(umi)
  
  // Format creators
  const creators = params.creators 
    ? params.creators.map(c => ({
        address: publicKey(c.address),
        share: c.share,
        verified: false, // Will be verified when they sign
      }))
    : [{
        address: umi.identity.publicKey,
        share: 100,
        verified: true,
      }]

  const builder = createNft(umi, {
    mint: collectionMint,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    sellerFeeBasisPoints: percentAmount(params.sellerFeeBasisPoints / 100), // Convert basis points to percentage
    creators,
    isCollection: true, // This makes it a Collection NFT
    tokenStandard: TokenStandard.NonFungible,
  })

  return {
    builder,
    collectionMint: collectionMint.publicKey,
  }
}

/**
 * Build collection NFT creation transaction
 * Returns serialized transaction for frontend to sign
 */
export async function buildCollectionNftTransaction(
  params: CreateCollectionParams & { authority: string }
): Promise<CollectionNftResult> {
  const umi = createUmiInstance()
  
  // Set the authority as identity temporarily (just for building, not signing)
  const authorityPubkey = publicKey(params.authority)
  
  const { builder, collectionMint } = await createCollectionNFT(umi, params)
  
  // Build the transaction but don't sign yet
  const transaction = await builder.buildWithLatestBlockhash(umi)
  
  // Serialize for sending to frontend
  const serialized = Buffer.from(umi.transactions.serialize(transaction)).toString('base64')
  
  return {
    collectionMint: collectionMint.toString(),
    transaction: serialized,
    signer: {
      publicKey: collectionMint.toString(),
      secretKey: null, // Frontend will handle signing
    },
  }
}

/**
 * Verify a collection NFT exists on-chain
 */
export async function verifyCollectionNft(
  collectionMintAddress: string
): Promise<boolean> {
  try {
    const umi = createUmiInstance()
    const asset = await fetchDigitalAsset(umi, publicKey(collectionMintAddress))
    return asset.metadata.collection === null // Collection NFTs don't have a parent collection
  } catch {
    return false
  }
}

/**
 * Get collection NFT metadata
 */
export async function getCollectionNftMetadata(collectionMintAddress: string) {
  const umi = createUmiInstance()
  try {
    const asset = await fetchDigitalAsset(umi, publicKey(collectionMintAddress))
    return {
      name: asset.metadata.name,
      symbol: asset.metadata.symbol,
      uri: asset.metadata.uri,
      sellerFeeBasisPoints: asset.metadata.sellerFeeBasisPoints,
      creators: asset.metadata.creators,
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch collection metadata: ${error.message}`)
  }
}
