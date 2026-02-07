import { Connection, PublicKey } from '@solana/web3.js'
import { getConnectionAsync } from './connection'
import { sql } from '@/lib/database'

export interface SolanaNft {
  mintAddress: string
  name: string
  symbol: string
  image: string
  collectionName?: string
  collectionAddress?: string
  attributes: Array<{ trait_type: string; value: string }>
  ownerAddress: string
  uri?: string
  tokenProgram?: string
}

export interface NftMetadata {
  name: string
  symbol: string
  uri: string
  sellerFeeBasisPoints: number
  creators: Array<{ address: string; share: number; verified: boolean }>
  collection?: {
    verified: boolean
    key: string
  }
  image?: string
  attributes?: Array<{ trait_type: string; value: string }>
  properties?: {
    files?: Array<{ uri: string; type: string }>
    category?: string
  }
}

/**
 * Fetch all NFTs owned by a wallet using Helius DAS API
 * Falls back to on-chain queries if Helius not available
 */
export async function fetchUserNfts(walletAddress: string): Promise<SolanaNft[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY

  if (heliusApiKey) {
    return fetchNftsViaHelius(walletAddress, heliusApiKey)
  } else {
    console.warn('HELIUS_API_KEY not set, using on-chain fetch (slower)')
    return fetchNftsOnChain(walletAddress)
  }
}

/**
 * Fetch NFTs using Helius DAS API (fast, recommended)
 */
async function fetchNftsViaHelius(
  walletAddress: string,
  apiKey: string
): Promise<SolanaNft[]> {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/nfts?api-key=${apiKey}`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.statusText}`)
    }

    const data = await response.json()
    const nfts: SolanaNft[] = []

    for (const nft of data) {
      // Skip if missing required data
      if (!nft.mint || !nft.metadata) continue

      nfts.push({
        mintAddress: nft.mint,
        name: nft.metadata.name || 'Unknown NFT',
        symbol: nft.metadata.symbol || '',
        image: nft.metadata.image || nft.metadata.uri || '',
        collectionName: nft.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || undefined,
        collectionAddress: nft.grouping?.find((g: any) => g.group_key === 'collection')?.collection_metadata?.name || undefined,
        attributes: nft.metadata.attributes || [],
        ownerAddress: walletAddress,
        uri: nft.metadata.uri,
        tokenProgram: nft.token_info?.token_program || 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      })
    }

    return nfts
  } catch (error) {
    console.error('Error fetching NFTs via Helius:', error)
    // Fall back to on-chain if Helius fails
    return fetchNftsOnChain(walletAddress)
  }
}

/**
 * Fetch NFTs using on-chain Metaplex queries (slower, but works without API key)
 */
async function fetchNftsOnChain(walletAddress: string): Promise<SolanaNft[]> {
  const connection = await getConnectionAsync()
  const walletPubkey = new PublicKey(walletAddress)

  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

  try {
    const nfts: SolanaNft[] = []

    // Check both token programs
    for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
          programId,
        })

        for (const { account, pubkey } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info

          // Only include NFTs (amount = 1, decimals = 0)
          if (
            parsedInfo.tokenAmount.decimals === 0 &&
            parsedInfo.tokenAmount.uiAmount === 1
          ) {
            const mintAddress = parsedInfo.mint

            try {
              const metadata = await getNftMetadata(mintAddress)

              nfts.push({
                mintAddress,
                name: metadata.name,
                symbol: metadata.symbol,
                image: metadata.image || metadata.uri,
                collectionName: metadata.collection?.key,
                collectionAddress: metadata.collection?.key,
                attributes: metadata.attributes || [],
                ownerAddress: walletAddress,
                uri: metadata.uri,
                tokenProgram: programId.toBase58(),
              })
            } catch (error) {
              console.error(`Failed to fetch metadata for ${mintAddress}:`, error)
              // Skip NFTs with metadata errors
              continue
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching from ${programId.toBase58()}:`, error)
        // Continue with next program
      }
    }

    return nfts
  } catch (error) {
    console.error('Error fetching NFTs on-chain:', error)
    return []
  }
}

/**
 * Get detailed NFT metadata from mint address
 */
export async function getNftMetadata(mintAddress: string): Promise<NftMetadata> {
  const connection = await getConnectionAsync()
  const mintPubkey = new PublicKey(mintAddress)

  try {
    // Derive metadata PDA (Metaplex standard)
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
      'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
    )

    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )

    const accountInfo = await connection.getAccountInfo(metadataPDA)
    if (!accountInfo) {
      throw new Error('Metadata account not found')
    }

    // Parse metadata account (simplified - use @metaplex-foundation/mpl-token-metadata for full parsing)
    const metadata = parseMetadataAccount(accountInfo.data)

    // Fetch off-chain metadata if URI exists
    if (metadata.uri) {
      try {
        const response = await fetch(metadata.uri)
        const offChainData = await response.json()

        return {
          ...metadata,
          image: offChainData.image,
          attributes: offChainData.attributes,
          properties: offChainData.properties,
        }
      } catch (error) {
        console.warn('Failed to fetch off-chain metadata:', error)
        return metadata
      }
    }

    return metadata
  } catch (error) {
    console.error('Error getting NFT metadata:', error)
    throw error
  }
}

/**
 * Parse Metaplex metadata account data (simplified parser)
 */
function parseMetadataAccount(data: Buffer): NftMetadata {
  try {
    // This is a simplified parser - for production use @metaplex-foundation/mpl-token-metadata
    // Metadata layout: key (1) | update_authority (32) | mint (32) | name (36) | symbol (14) | uri (204) | ...

    let offset = 1 // Skip key byte
    offset += 32 // Skip update authority
    offset += 32 // Skip mint

    // Read name (first 4 bytes = length, then string)
    const nameLength = data.readUInt32LE(offset)
    offset += 4
    const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '')
    offset += 32 // Name field is fixed 32 bytes

    // Read symbol (first 4 bytes = length, then string)
    const symbolLength = data.readUInt32LE(offset)
    offset += 4
    const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '')
    offset += 10 // Symbol field is fixed 10 bytes

    // Read URI (first 4 bytes = length, then string)
    const uriLength = data.readUInt32LE(offset)
    offset += 4
    const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '')

    return {
      name,
      symbol,
      uri,
      sellerFeeBasisPoints: 0,
      creators: [],
    }
  } catch (error) {
    console.error('Error parsing metadata account:', error)
    return {
      name: 'Unknown',
      symbol: '',
      uri: '',
      sellerFeeBasisPoints: 0,
      creators: [],
    }
  }
}

/**
 * Get available NFTs (filter out already listed)
 */
export async function getAvailableNfts(walletAddress: string): Promise<SolanaNft[]> {
  const allNfts = await fetchUserNfts(walletAddress)

  if (!sql) {
    return allNfts
  }

  try {
    // Get list of already-listed mint addresses
    const listedNfts = await sql`
      SELECT mint_address FROM nft_listings
      WHERE seller_wallet = ${walletAddress}
      AND status = 'active'
    `

    const listedMints = new Set(listedNfts.map((row: any) => row.mint_address))

    // Filter out listed NFTs
    return allNfts.filter(nft => !listedMints.has(nft.mintAddress))
  } catch (error) {
    console.error('Error filtering listed NFTs:', error)
    return allNfts
  }
}

/**
 * Verify NFT ownership on-chain
 */
export async function verifyNftOwnership(
  mintAddress: string,
  ownerAddress: string
): Promise<boolean> {
  const connection = await getConnectionAsync()

  try {
    const mintPubkey = new PublicKey(mintAddress)
    const ownerPubkey = new PublicKey(ownerAddress)

    // Get largest token accounts for this mint
    const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey)

    for (const account of largestAccounts.value) {
      const accountInfo = await connection.getParsedAccountInfo(account.address)

      if (accountInfo.value) {
        const data = accountInfo.value.data as any
        const owner = data.parsed?.info?.owner
        const amount = data.parsed?.info?.tokenAmount?.uiAmount

        // Check if this account is owned by the claimed owner and has amount 1
        if (owner === ownerAddress && amount === 1) {
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.error('Error verifying NFT ownership:', error)
    return false
  }
}

/**
 * Get the actual token account that holds the NFT
 */
export async function getNftTokenAccount(
  mintAddress: string,
  ownerAddress: string
): Promise<{ tokenAccount: PublicKey; tokenProgram: PublicKey } | null> {
  const connection = await getConnectionAsync()

  try {
    const mintPubkey = new PublicKey(mintAddress)

    // Get largest token accounts for this mint
    const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey)

    for (const account of largestAccounts.value) {
      const accountInfo = await connection.getParsedAccountInfo(account.address)

      if (accountInfo.value) {
        const data = accountInfo.value.data as any
        const owner = data.parsed?.info?.owner
        const amount = data.parsed?.info?.tokenAmount?.uiAmount

        // Check if this account is owned by the claimed owner and has amount 1
        if (owner === ownerAddress && amount === 1) {
          return {
            tokenAccount: account.address,
            tokenProgram: accountInfo.value.owner,
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error getting NFT token account:', error)
    return null
  }
}
