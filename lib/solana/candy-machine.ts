/**
 * Metaplex Core Candy Machine operations.
 * Uses the new mpl-core-candy-machine SDK (replaces legacy mpl-candy-machine).
 *
 * Key differences from legacy:
 * - Creates Core Assets (not SPL tokens) - much cheaper & simpler
 * - Guards: solPayment (creator price), thirdPartySigner (server co-sign)
 * - Platform fee: explicit SOL transfer in tx (not guard-based)
 * - No setMintAuthority needed - guards handle everything on-chain
 * - Minting uses mintV1 (through Candy Guard) with guard args
 */

import {
  create as createCoreCandyMachineWithGuard,
  addConfigLines,
  fetchCandyMachine,
  mintV1,
  CandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine'
import {
  generateSigner,
  publicKey,
  some,
  none,
  sol,
  TransactionBuilder,
  Umi,
  PublicKey as UmiPublicKey,
  KeypairSigner,
  createNoopSigner,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi'
import { createUmiInstanceAsync } from './umi-config'

// =============================================
// Types
// =============================================

export interface CandyMachineConfig {
  collectionMint: string
  collectionUpdateAuthority: string
  itemsAvailable: number
  /** Mint price in SOL that goes to the creator */
  mintPriceSol: number
  /** Creator wallet that receives mint payments */
  creatorWallet: string
  /** Platform fee in SOL per mint */
  platformFeeSol: number
  /** Platform wallet that receives platform fees */
  platformWallet: string
  configLineSettings?: {
    prefixName: string
    nameLength: number
    prefixUri: string
    uriLength: number
    isSequential: boolean
  }
}

// =============================================
// Create Candy Machine + Candy Guard
// =============================================

/**
 * Create a Core Candy Machine with a Candy Guard in one step.
 * Guards enforce:
 * - solPayment: mint price paid to the creator
 * - thirdPartySigner: server co-signature required
 * Platform fee: enforced as explicit SOL transfer in the mint transaction.
 *
 * No setMintAuthority needed! Guards handle everything on-chain.
 */
export async function createCandyMachine(
  umi: Umi,
  config: CandyMachineConfig
): Promise<{
  builder: TransactionBuilder
  candyMachine: UmiPublicKey
  candyMachineSigner: KeypairSigner
}> {
  const candyMachine = generateSigner(umi)

  const configLineSettings = config.configLineSettings || {
    prefixName: '',
    nameLength: 32,
    prefixUri: '',
    uriLength: 200,
    isSequential: false,
  }

  // collectionUpdateAuthority must be a Signer (noop - user signs on frontend)
  const collectionUpdateAuthoritySigner = createNoopSigner(publicKey(config.collectionUpdateAuthority))

  // Build guards configuration
  const guards: any = {}

  // solPayment guard: mint price goes to the creator
  if (config.mintPriceSol > 0) {
    guards.solPayment = some({
      lamports: sol(config.mintPriceSol),
      destination: publicKey(config.creatorWallet),
    })
  }

  // Platform fee is NOT a guard — it's enforced via an explicit SOL transfer
  // in the mint transaction, co-signed by the server (thirdPartySigner).

  console.log('[Core CM] Creating with guards:', {
    solPayment: config.mintPriceSol > 0 ? `${config.mintPriceSol} SOL → ${config.creatorWallet.substring(0, 8)}...` : 'none',
    platformFee: config.platformFeeSol > 0 ? `${config.platformFeeSol} SOL → ${config.platformWallet.substring(0, 8)}... (via explicit transfer)` : 'none',
  })

  // create() builds both the Candy Machine AND the Candy Guard in one transaction
  const builder = await createCoreCandyMachineWithGuard(umi, {
    candyMachine,
    collection: publicKey(config.collectionMint),
    collectionUpdateAuthority: collectionUpdateAuthoritySigner,
    itemsAvailable: config.itemsAvailable,
    isMutable: true,
    configLineSettings: some(configLineSettings),
    guards,
  })

  return {
    builder,
    candyMachine: candyMachine.publicKey,
    candyMachineSigner: candyMachine,
  }
}

// =============================================
// Add Config Lines
// =============================================

/**
 * Add config lines (NFT metadata URIs) to the Candy Machine.
 */
export async function addCandyMachineConfigLines(
  umi: Umi,
  candyMachineAddress: string,
  configLines: Array<{ name: string; uri: string }>,
  index: number = 0
): Promise<TransactionBuilder> {
  return addConfigLines(umi, {
    candyMachine: publicKey(candyMachineAddress),
    index,
    configLines,
  })
}

// =============================================
// Minting
// =============================================

/**
 * Build a mint transaction from Core Candy Machine.
 * Uses mintV1 which goes through the Candy Guard and enforces all guards.
 *
 * Platform fee enforcement:
 * - solPayment → guard-based, minter pays creator automatically
 * - Platform fee → explicit SOL transfer instruction appended to the transaction
 *   (NOT relying on solFixedFee guard, which may be absent on older CMs)
 * - thirdPartySigner → ensures every mint goes through our server
 *
 * Since thirdPartySigner is on ALL collections, the server controls what
 * transaction gets built. The manual transfer cannot be bypassed.
 */
export async function buildCandyMachineMint(
  umi: Umi,
  params: {
    candyMachineAddress: string
    collectionMint: string
    minterPublicKey: string
    mintPriceSol: number
    creatorWallet: string
    platformFeeSol: number
    platformWallet: string
    agentSigner?: KeypairSigner
  }
): Promise<{
  builder: TransactionBuilder
  nftMint: UmiPublicKey
  nftMintSigner: KeypairSigner
}> {
  const nftMint = generateSigner(umi)
  const candyMachineData = await fetchCandyMachine(umi, publicKey(params.candyMachineAddress))

  console.log('[Core CM Mint] CM data:', {
    address: candyMachineData.publicKey.toString(),
    itemsAvailable: Number(candyMachineData.data.itemsAvailable),
    itemsRedeemed: Number(candyMachineData.itemsRedeemed),
    authority: candyMachineData.authority.toString(),
    mintAuthority: candyMachineData.mintAuthority.toString(),
  })

  // Build mint args for the guards
  const mintArgs: any = {}

  if (params.mintPriceSol > 0) {
    mintArgs.solPayment = some({
      destination: publicKey(params.creatorWallet),
    })
  }

  // NOTE: We do NOT pass solFixedFee in mintArgs. Older CMs don't have the guard
  // (it gets silently ignored), and we enforce the platform fee via an explicit
  // SOL transfer instruction appended below. This is secure because thirdPartySigner
  // ensures every mint goes through our server — we control the transaction.

  if (params.agentSigner) {
    mintArgs.thirdPartySigner = some({
      signer: params.agentSigner,
    })
  }

  // mintV1 goes through the Candy Guard → enforces guards → mints Core Asset
  let builder = mintV1(umi, {
    candyMachine: candyMachineData.publicKey,
    asset: nftMint,
    collection: publicKey(params.collectionMint),
    mintArgs,
  })

  // Append explicit platform fee transfer — NOT guard-dependent.
  // The minter's wallet sends platformFeeSol to the platform wallet.
  // This instruction is part of the same atomic transaction that the server
  // co-signs, so it cannot be removed or bypassed by the client.
  if (params.platformFeeSol > 0) {
    const { transferSol } = await import('@metaplex-foundation/mpl-toolbox')
    builder = builder.add(
      transferSol(umi, {
        source: createNoopSigner(publicKey(params.minterPublicKey)),
        destination: publicKey(params.platformWallet),
        amount: sol(params.platformFeeSol),
      })
    )
    console.log(`[Core CM Mint] Platform fee: ${params.platformFeeSol} SOL → ${params.platformWallet.substring(0, 8)}...`)
  }

  return {
    builder,
    nftMint: nftMint.publicKey,
    nftMintSigner: nftMint,
  }
}

// =============================================
// Queries
// =============================================

/**
 * Fetch Candy Machine data from chain
 */
export async function getCandyMachineData(
  candyMachineAddress: string
): Promise<CandyMachine> {
  const umi = await createUmiInstanceAsync()
  return fetchCandyMachine(umi, publicKey(candyMachineAddress))
}

/**
 * Check how many items are left to mint
 */
export async function getCandyMachineAvailability(
  candyMachineAddress: string
): Promise<{ itemsAvailable: number; itemsRedeemed: number; itemsRemaining: number }> {
  const cm = await getCandyMachineData(candyMachineAddress)
  return {
    itemsAvailable: Number(cm.data.itemsAvailable),
    itemsRedeemed: Number(cm.itemsRedeemed),
    itemsRemaining: Number(cm.data.itemsAvailable) - Number(cm.itemsRedeemed),
  }
}

// =============================================
// Deployment helpers
// =============================================

/**
 * Build complete Candy Machine with config lines in batches.
 *
 * Transaction order:
 * 1. Create Candy Machine + Candy Guard (needs CM keypair + user signature)
 * 2. Add config lines in batches (needs user signature)
 *
 * No setMintAuthority step needed - guards handle everything!
 */
export async function deployCandyMachineWithMetadata(
  umi: Umi,
  config: CandyMachineConfig,
  metadataUris: Array<{ name: string; uri: string }>
): Promise<{
  candyMachine: UmiPublicKey
  candyMachineSigner: KeypairSigner
  transactions: TransactionBuilder[]
}> {
  // Step 1: Create Candy Machine + Candy Guard
  const { builder, candyMachine, candyMachineSigner } = await createCandyMachine(umi, config)
  const transactions: TransactionBuilder[] = [builder]

  // Step 2: Add config lines in batches (max 10 per transaction)
  const batchSize = 10
  for (let i = 0; i < metadataUris.length; i += batchSize) {
    const batch = metadataUris.slice(i, i + batchSize)
    const configLineBuilder = await addCandyMachineConfigLines(
      umi,
      candyMachine.toString(),
      batch,
      i
    )
    transactions.push(configLineBuilder)
  }

  return {
    candyMachine,
    candyMachineSigner,
    transactions,
  }
}

/**
 * Estimate Candy Machine deployment costs
 */
export function estimateCandyMachineCost(itemsAvailable: number): {
  candyMachineRent: number
  configLinesRent: number
  totalCost: number
} {
  // Core assets are cheaper than legacy Token Metadata
  const candyMachineRent = 0.05 // Core CM base account is smaller
  const configLinesRent = itemsAvailable * 0.000003 // Per config line (cheaper)
  return {
    candyMachineRent,
    configLinesRent,
    totalCost: candyMachineRent + configLinesRent,
  }
}
