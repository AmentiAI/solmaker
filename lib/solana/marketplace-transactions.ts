import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { getConnection } from './connection'

/**
 * Build transaction to transfer NFT from owner to platform escrow
 * User must sign this transaction to list their NFT
 */
export async function buildTransferToEscrow(
  nftMint: PublicKey,
  ownerWallet: PublicKey,
  platformWallet: PublicKey
): Promise<{ transaction: Transaction; escrowTokenAccount: PublicKey }> {
  const connection = getConnection()
  
  // Import the getNftTokenAccount function
  const { getNftTokenAccount } = await import('./nft-fetcher')

  // Get the actual token account that holds the NFT
  const nftAccountInfo = await getNftTokenAccount(
    nftMint.toBase58(),
    ownerWallet.toBase58()
  )

  if (!nftAccountInfo) {
    throw new Error('Could not find NFT token account. Make sure you own this NFT.')
  }

  const { tokenAccount: ownerTokenAccount, tokenProgram } = nftAccountInfo
  
  // Determine which token program and ATA program to use
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
  const isToken2022 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID)
  const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID

  // Get escrow token account (always use same program as the NFT)
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    platformWallet,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const transaction = new Transaction()
  const { blockhash } = await connection.getLatestBlockhash('finalized')
  transaction.recentBlockhash = blockhash
  transaction.feePayer = ownerWallet

  // Check if escrow token account exists, create if not
  const escrowAccountInfo = await connection.getAccountInfo(escrowTokenAccount)
  if (!escrowAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        ownerWallet, // Payer
        escrowTokenAccount, // ATA address
        platformWallet, // Owner
        nftMint, // Mint
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    )
  }

  // Verify the owner token account has the NFT before building transfer
  const ownerAccountInfo = await connection.getParsedAccountInfo(ownerTokenAccount)
  if (!ownerAccountInfo.value) {
    throw new Error(`Owner token account ${ownerTokenAccount.toBase58()} does not exist`)
  }

  const accountData = ownerAccountInfo.value.data as any
  const amount = accountData.parsed?.info?.tokenAmount?.uiAmount
  const accountOwner = accountData.parsed?.info?.owner

  if (amount !== 1) {
    throw new Error(`Owner token account does not have the NFT (amount: ${amount})`)
  }

  if (accountOwner !== ownerWallet.toBase58()) {
    throw new Error(`Owner token account is not owned by seller wallet`)
  }

  // Transfer NFT (amount = 1 for NFTs)
  transaction.add(
    createTransferInstruction(
      ownerTokenAccount, // From (actual token account holding the NFT)
      escrowTokenAccount, // To
      ownerWallet, // Owner
      1, // Amount
      [], // Multisig signers (none)
      tokenProgramId
    )
  )

  return { transaction, escrowTokenAccount }
}

/**
 * Build transaction to transfer NFT from escrow to buyer
 * Platform wallet must sign this transaction to deliver the NFT
 */
export async function buildTransferToBuyer(
  nftMint: PublicKey,
  buyerWallet: PublicKey,
  platformWallet: PublicKey
): Promise<{ transaction: Transaction; buyerTokenAccount: PublicKey }> {
  const connection = getConnection()

  // Get associated token accounts
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    platformWallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const buyerTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    buyerWallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const transaction = new Transaction()
  const { blockhash } = await connection.getLatestBlockhash('finalized')
  transaction.recentBlockhash = blockhash
  transaction.feePayer = platformWallet // Platform pays for delivery

  // Check if buyer token account exists, create if not
  const buyerAccountInfo = await connection.getAccountInfo(buyerTokenAccount)
  if (!buyerAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        platformWallet, // Payer (platform pays)
        buyerTokenAccount, // ATA address
        buyerWallet, // Owner
        nftMint, // Mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    )
  }

  // Transfer NFT from escrow to buyer (amount = 1 for NFTs)
  transaction.add(
    createTransferInstruction(
      escrowTokenAccount, // From
      buyerTokenAccount, // To
      platformWallet, // Owner (platform wallet)
      1, // Amount
      [], // Multisig signers
      TOKEN_PROGRAM_ID
    )
  )

  return { transaction, buyerTokenAccount }
}

/**
 * Build transaction to return NFT from escrow to seller (for cancellation)
 * Platform wallet must sign this transaction
 */
export async function buildReturnToSeller(
  nftMint: PublicKey,
  sellerWallet: PublicKey,
  platformWallet: PublicKey
): Promise<{ transaction: Transaction }> {
  const connection = getConnection()

  // Get associated token accounts
  const escrowTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    platformWallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const sellerTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    sellerWallet,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  )

  const transaction = new Transaction()
  const { blockhash } = await connection.getLatestBlockhash('finalized')
  transaction.recentBlockhash = blockhash
  transaction.feePayer = platformWallet // Platform pays for cancellation

  // Transfer NFT back to seller (amount = 1 for NFTs)
  transaction.add(
    createTransferInstruction(
      escrowTokenAccount, // From
      sellerTokenAccount, // To
      platformWallet, // Owner (platform wallet)
      1, // Amount
      [], // Multisig signers
      TOKEN_PROGRAM_ID
    )
  )

  return { transaction }
}

/**
 * Verify that NFT was transferred to escrow account
 */
export async function verifyNftInEscrow(
  nftMint: string,
  platformWallet: string
): Promise<boolean> {
  const connection = getConnection()

  try {
    const mintPubkey = new PublicKey(nftMint)
    const platformPubkey = new PublicKey(platformWallet)

    const escrowTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      platformPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    const accountInfo = await connection.getParsedAccountInfo(escrowTokenAccount)

    if (!accountInfo.value) {
      return false
    }

    const data = accountInfo.value.data as any
    const amount = data.parsed?.info?.tokenAmount?.uiAmount

    // NFT must have amount of 1
    return amount === 1
  } catch (error) {
    console.error('Error verifying NFT in escrow:', error)
    return false
  }
}

/**
 * Verify that buyer received the NFT
 */
export async function verifyNftReceived(
  nftMint: string,
  buyerWallet: string
): Promise<boolean> {
  const connection = getConnection()

  try {
    const mintPubkey = new PublicKey(nftMint)
    const buyerPubkey = new PublicKey(buyerWallet)

    const buyerTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      buyerPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    const accountInfo = await connection.getParsedAccountInfo(buyerTokenAccount)

    if (!accountInfo.value) {
      return false
    }

    const data = accountInfo.value.data as any
    const amount = data.parsed?.info?.tokenAmount?.uiAmount

    // NFT must have amount of 1
    return amount === 1
  } catch (error) {
    console.error('Error verifying NFT received:', error)
    return false
  }
}

/**
 * Get platform wallet keypair from environment variable
 * WARNING: This should only be used server-side
 */
export function getPlatformWalletKeypair(): Keypair {
  const privateKey = process.env.SOLANA_PLATFORM_PRIVATE_KEY

  if (!privateKey) {
    throw new Error('SOLANA_PLATFORM_PRIVATE_KEY not configured')
  }

  try {
    // Try to parse as JSON array first (e.g., [1,2,3,...])
    if (privateKey.startsWith('[')) {
      const arrayKey = JSON.parse(privateKey)
      return Keypair.fromSecretKey(Uint8Array.from(arrayKey))
    }
    
    // Try as base58 string
    const privateKeyBytes = bs58.decode(privateKey)
    
    // Solana secret keys should be 64 bytes
    if (privateKeyBytes.length !== 64) {
      throw new Error(`Invalid key length: ${privateKeyBytes.length} bytes (expected 64)`)
    }
    
    return Keypair.fromSecretKey(privateKeyBytes)
  } catch (error: any) {
    console.error('Error parsing SOLANA_PLATFORM_PRIVATE_KEY:', error.message)
    console.error('Private key preview:', privateKey.substring(0, 20) + '...')
    throw new Error(`Invalid SOLANA_PLATFORM_PRIVATE_KEY format: ${error.message}`)
  }
}

/**
 * Sign and send a transaction with platform wallet
 */
export async function signAndSendWithPlatform(
  transaction: Transaction
): Promise<string> {
  const connection = getConnection()
  const platformKeypair = getPlatformWalletKeypair()

  // Sign transaction
  transaction.sign(platformKeypair)

  // Send transaction
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed')

  return signature
}
