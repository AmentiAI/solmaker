/**
 * Metaplex Core Collection creation
 * Uses the new MPL Core standard instead of the legacy Token Metadata program.
 * Core Collections are lightweight on-chain accounts (no SPL tokens involved).
 */

import {
  createCollection,
  fetchCollection,
} from '@metaplex-foundation/mpl-core'
import {
  generateSigner,
  publicKey,
  PublicKey as UmiPublicKey,
  Umi,
  TransactionBuilder,
  createNoopSigner,
  signerIdentity,
} from '@metaplex-foundation/umi'
import { createUmiInstanceAsync } from './umi-config'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'

export interface CreateCollectionParams {
  name: string
  uri: string // Metadata JSON URI (contains image, description, etc.)
  creators?: Array<{
    address: string
    share: number // Percentage (0-100)
  }>
  royaltyBasisPoints?: number // Royalties in basis points (500 = 5%)
}

export interface CollectionNftResult {
  collectionMint: string
  transaction: string // Serialized UNSIGNED transaction — frontend signs via sendTransaction
  signerSecretKey: string // Base64-encoded secret key — frontend passes as signer to sendTransaction
}

/**
 * Create a Core Collection on-chain.
 * This replaces the old Token Metadata "Collection NFT".
 * Core collections are just accounts - no SPL token minting.
 */
export async function createCollectionNFT(
  umi: Umi,
  params: CreateCollectionParams
): Promise<{ builder: TransactionBuilder; collectionMint: UmiPublicKey; collectionMintSigner: any }> {
  const collectionSigner = generateSigner(umi)

  // Build plugins array for royalties if provided
  const plugins: any[] = []

  if (params.royaltyBasisPoints && params.creators && params.creators.length > 0) {
    plugins.push({
      type: 'Royalties',
      basisPoints: params.royaltyBasisPoints,
      creators: params.creators.map(c => ({
        address: publicKey(c.address),
        percentage: c.share,
      })),
      ruleSet: { type: 'None' as const },
    })
  }

  const builder = createCollection(umi, {
    collection: collectionSigner,
    name: params.name,
    uri: params.uri,
    ...(plugins.length > 0 ? { plugins } : {}),
  })

  return {
    builder,
    collectionMint: collectionSigner.publicKey,
    collectionMintSigner: collectionSigner,
  }
}

/**
 * Build collection creation transaction.
 * Returns serialized transaction for frontend to sign.
 */
export async function buildCollectionNftTransaction(
  params: CreateCollectionParams & { authority: string }
): Promise<CollectionNftResult> {
  const umi = await createUmiInstanceAsync()

  // Set the authority as identity (noop signer - user will sign on frontend)
  const authorityPubkey = publicKey(params.authority)
  const tempSigner = createNoopSigner(authorityPubkey)
  umi.use(signerIdentity(tempSigner))

  const { builder, collectionMint, collectionMintSigner } = await createCollectionNFT(umi, params)

  // Build the transaction WITHOUT partial signing.
  // The frontend will pass the collection signer as a `signer` to sendTransaction,
  // which lets the wallet adapter handle signing properly for ALL wallets.
  const built = await builder.buildWithLatestBlockhash(umi)

  const web3JsTx = toWeb3JsTransaction(built)
  const serialized = Buffer.from(web3JsTx.serialize()).toString('base64')

  // Export the collection signer's secret key so the frontend can reconstruct it
  // and pass it to sendTransaction({ signers: [keypair] })
  const signerSecretKey = Buffer.from(collectionMintSigner.secretKey).toString('base64')

  return {
    collectionMint: collectionMint.toString(),
    transaction: serialized,
    signerSecretKey,
  }
}

/**
 * Verify a Core Collection exists on-chain
 */
export async function verifyCollectionNft(
  collectionMintAddress: string
): Promise<boolean> {
  try {
    const umi = await createUmiInstanceAsync()
    const collection = await fetchCollection(umi, publicKey(collectionMintAddress))
    return !!collection
  } catch {
    return false
  }
}

/**
 * Get Core Collection metadata
 */
export async function getCollectionNftMetadata(collectionMintAddress: string) {
  const umi = await createUmiInstanceAsync()
  try {
    const collection = await fetchCollection(umi, publicKey(collectionMintAddress))
    return {
      name: collection.name,
      uri: collection.uri,
      updateAuthority: collection.updateAuthority.toString(),
      numMinted: collection.numMinted,
      currentSize: collection.currentSize,
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch collection metadata: ${error.message}`)
  }
}
