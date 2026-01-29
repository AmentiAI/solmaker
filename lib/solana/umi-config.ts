import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters'
import { Keypair as SolanaKeypair, Connection } from '@solana/web3.js'
import { createSignerFromKeypair, generateSigner, signerIdentity, Umi, KeypairSigner } from '@metaplex-foundation/umi'
import { getConnection } from './connection'

/**
 * Create and configure a Umi instance for Metaplex operations
 */
export function createUmiInstance(): Umi {
  const connection = getConnection()
  const endpoint = connection.rpcEndpoint
  
  const umi = createUmi(endpoint)
    .use(mplTokenMetadata())
    .use(mplCandyMachine())
  
  return umi
}

/**
 * Create a Umi instance with a specific wallet/signer
 * Use this for admin operations where you control the keypair
 */
export function createUmiWithSigner(secretKey: Uint8Array): Umi {
  const umi = createUmiInstance()
  
  // Create keypair signer from secret key
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey)
  const signer = createSignerFromKeypair(umi, keypair)
  
  umi.use(signerIdentity(signer))
  
  return umi
}

/**
 * Create a Umi instance with wallet adapter (for client-side wallet connections)
 * Use this when user needs to sign transactions with their connected wallet
 */
export function createUmiWithWalletAdapter(walletAdapter: any): Umi {
  const umi = createUmiInstance()
  umi.use(walletAdapterIdentity(walletAdapter))
  return umi
}

/**
 * Generate a new signer (for creating new accounts like NFT mints)
 */
export function createNewSigner(umi: Umi): KeypairSigner {
  return generateSigner(umi)
}

/**
 * Convert Solana web3.js Keypair to Umi keypair
 */
export function solanaKeypairToUmi(umi: Umi, keypair: SolanaKeypair): KeypairSigner {
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(keypair.secretKey)
  return createSignerFromKeypair(umi, umiKeypair)
}
