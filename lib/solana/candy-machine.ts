import {
  create,
  addConfigLines,
  fetchCandyMachine,
  mintV2,
  CandyMachine,
  getMerkleRoot,
  getMerkleProof,
} from '@metaplex-foundation/mpl-candy-machine'
import {
  generateSigner,
  percentAmount,
  publicKey,
  some,
  TransactionBuilder,
  Umi,
  PublicKey as UmiPublicKey,
} from '@metaplex-foundation/umi'
import { createUmiInstance } from './umi-config'

export interface CandyMachineConfig {
  collectionMint: string // Collection NFT address
  collectionUpdateAuthority: string // Who can update the collection
  itemsAvailable: number // Total NFTs in collection
  sellerFeeBasisPoints: number // Royalties (500 = 5%)
  symbol: string
  maxEditionSupply: number // Usually 0 for unique NFTs
  isMutable: boolean
  creators: Array<{
    address: string
    percentageShare: number
    verified: boolean
  }>
  configLineSettings?: {
    prefixName: string
    nameLength: number
    prefixUri: string
    uriLength: number
    isSequential: boolean
  }
}

export interface CandyMachineGuards {
  solPayment?: {
    lamports: bigint
    destination: string
  }
  startDate?: {
    date: bigint // Unix timestamp
  }
  endDate?: {
    date: bigint
  }
  mintLimit?: {
    id: number
    limit: number
  }
  allowList?: {
    merkleRoot: Uint8Array
  }
}

/**
 * Create a new Candy Machine
 * Returns the transaction builder for the user to sign
 */
export async function createCandyMachine(
  umi: Umi,
  config: CandyMachineConfig
): Promise<{ builder: TransactionBuilder; candyMachine: UmiPublicKey }> {
  const candyMachine = generateSigner(umi)

  // Default config line settings if not provided
  const configLineSettings = config.configLineSettings || {
    prefixName: '',
    nameLength: 32,
    prefixUri: '',
    uriLength: 200,
    isSequential: false,
  }

  const builder = create(umi, {
    candyMachine,
    collectionMint: publicKey(config.collectionMint),
    collectionUpdateAuthority: publicKey(config.collectionUpdateAuthority),
    itemsAvailable: config.itemsAvailable,
    sellerFeeBasisPoints: percentAmount(config.sellerFeeBasisPoints / 100),
    symbol: config.symbol,
    maxEditionSupply: config.maxEditionSupply,
    isMutable: config.isMutable,
    creators: config.creators.map(c => ({
      address: publicKey(c.address),
      percentageShare: c.percentageShare,
      verified: c.verified,
    })),
    configLineSettings: some(configLineSettings),
  })

  return {
    builder,
    candyMachine: candyMachine.publicKey,
  }
}

/**
 * Add config lines (NFT metadata URIs) to Candy Machine
 * This tells the CM where each NFT's metadata is located
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

/**
 * Build a mint transaction from Candy Machine
 * User will sign and broadcast this
 */
export async function buildCandyMachineMint(
  umi: Umi,
  params: {
    candyMachineAddress: string
    collectionMint: string
    collectionUpdateAuthority: string
    minterPublicKey: string
    merkleProof?: Uint8Array[] // For whitelist
  }
): Promise<{ builder: TransactionBuilder; nftMint: UmiPublicKey }> {
  const nftMint = generateSigner(umi)
  const candyMachine = await fetchCandyMachine(umi, publicKey(params.candyMachineAddress))

  const mintArgs: any = {}
  
  // Add merkle proof if whitelist is enabled
  if (params.merkleProof) {
    mintArgs.allowList = some({ merkleProof: params.merkleProof })
  }

  const builder = mintV2(umi, {
    candyMachine: candyMachine.publicKey,
    nftMint,
    collectionMint: publicKey(params.collectionMint),
    collectionUpdateAuthority: publicKey(params.collectionUpdateAuthority),
    tokenStandard: candyMachine.tokenStandard,
    mintArgs,
  })

  return {
    builder,
    nftMint: nftMint.publicKey,
  }
}

/**
 * Fetch Candy Machine data from chain
 */
export async function getCandyMachineData(
  candyMachineAddress: string
): Promise<CandyMachine> {
  const umi = createUmiInstance()
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
    itemsAvailable: Number(cm.itemsAvailable),
    itemsRedeemed: Number(cm.itemsRedeemed),
    itemsRemaining: Number(cm.itemsAvailable) - Number(cm.itemsRedeemed),
  }
}

/**
 * Build complete Candy Machine with config lines in batches
 * This is the full deployment flow
 */
export async function deployCandyMachineWithMetadata(
  umi: Umi,
  config: CandyMachineConfig,
  metadataUris: Array<{ name: string; uri: string }>
): Promise<{ candyMachine: UmiPublicKey; transactions: TransactionBuilder[] }> {
  // Step 1: Create Candy Machine
  const { builder: createBuilder, candyMachine } = await createCandyMachine(umi, config)
  
  const transactions: TransactionBuilder[] = [createBuilder]
  
  // Step 2: Add config lines in batches (max 10-20 per transaction)
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
    transactions,
  }
}

/**
 * Estimate Candy Machine deployment costs
 */
export function estimateCandyMachineCost(itemsAvailable: number): {
  candyMachineRent: number // SOL
  configLinesRent: number // SOL
  totalCost: number // SOL
} {
  // Approximate costs (may vary slightly)
  const candyMachineRent = 0.15 // Base CM account
  const configLinesRent = itemsAvailable * 0.000005 // Per config line
  
  return {
    candyMachineRent,
    configLinesRent,
    totalCost: candyMachineRent + configLinesRent,
  }
}
