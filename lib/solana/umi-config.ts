import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplCore } from '@metaplex-foundation/mpl-core'
import { mplCandyMachine } from '@metaplex-foundation/mpl-core-candy-machine'
import { Keypair as SolanaKeypair, Connection } from '@solana/web3.js'
import { createSignerFromKeypair, generateSigner, signerIdentity, Umi, KeypairSigner } from '@metaplex-foundation/umi'
import { getConnection, getConnectionAsync } from './connection'

/**
 * Create and configure a Umi instance for Metaplex Core operations (sync - uses env vars)
 * WARNING: This uses env vars, not database settings. Prefer createUmiInstanceAsync() for server-side.
 */
export function createUmiInstance(): Umi {
  const connection = getConnection()
  const endpoint = connection.rpcEndpoint
  
  const umi = createUmi(endpoint)
    .use(mplCore())
    .use(mplCandyMachine())
  
  return umi
}

/**
 * Create and configure a Umi instance that respects database network settings
 * This is the preferred method for server-side deployment operations.
 */
export async function createUmiInstanceAsync(): Promise<Umi> {
  const connection = await getConnectionAsync()
  const endpoint = connection.rpcEndpoint
  
  console.log(`[UMI] Creating instance with endpoint: ${endpoint}`)
  
  const umi = createUmi(endpoint)
    .use(mplCore())
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
 * Create a Umi instance with a specific wallet/signer (async - respects DB network settings)
 * Use this for server-side deployment operations.
 */
export async function createUmiWithSignerAsync(secretKey: Uint8Array): Promise<Umi> {
  const umi = await createUmiInstanceAsync()
  
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
  const { walletAdapterIdentity } = require('@metaplex-foundation/umi-signer-wallet-adapters')
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
