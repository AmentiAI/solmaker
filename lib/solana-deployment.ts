/**
 * Frontend helper for Solana Core Candy Machine deployment.
 *
 * Uses signTransaction + sendRawTransaction pattern instead of sendTransaction.
 * This gives us:
 * - Better error messages (we see signing vs sending errors separately)
 * - Control over which RPC we send to (avoids Phantom's internal RPC issues)
 * - Ability to partial-sign with co-signers before wallet signing
 *
 * Keypairs that need to co-sign (collection signer, candy machine signer)
 * are generated server-side and returned to the frontend. We partial-sign
 * with them, then ask the wallet to sign, then we send ourselves.
 */

import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js'

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  error?: string
}

export interface WalletAdapter {
  signTransaction: <T extends VersionedTransaction>(transaction: T) => Promise<T>
  signAllTransactions?: <T extends VersionedTransaction>(transactions: T[]) => Promise<T[]>
}

async function getConnection(): Promise<Connection> {
  try {
    const res = await fetch('/api/solana/network')
    const data = await res.json()
    const rpcUrl = data.rpcUrl || 'https://api.devnet.solana.com'
    return new Connection(rpcUrl, 'confirmed')
  } catch {
    return new Connection('https://api.devnet.solana.com', 'confirmed')
  }
}

export class SolanaDeployment {
  collectionId: string
  walletAddress: string
  wallet: WalletAdapter
  steps: DeploymentStep[]
  onUpdate: (steps: DeploymentStep[]) => void

  constructor(
    collectionId: string,
    walletAddress: string,
    wallet: WalletAdapter,
    onUpdate: (steps: DeploymentStep[]) => void
  ) {
    this.collectionId = collectionId
    this.walletAddress = walletAddress
    this.wallet = wallet
    this.onUpdate = onUpdate
    this.steps = [
      {
        id: 'upload_metadata',
        title: 'Upload Metadata',
        description: 'Uploading all NFT images and metadata to storage',
        status: 'pending',
      },
      {
        id: 'create_collection_nft',
        title: 'Create Collection',
        description: 'Creating Core Collection on-chain',
        status: 'pending',
      },
      {
        id: 'create_candy_machine',
        title: 'Deploy Candy Machine',
        description: 'Deploying Core Candy Machine with guards',
        status: 'pending',
      },
      {
        id: 'complete',
        title: 'Complete',
        description: 'Collection deployed and ready to launch',
        status: 'pending',
      },
    ]
  }

  updateStep(stepId: string, updates: Partial<DeploymentStep>) {
    this.steps = this.steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    )
    this.onUpdate(this.steps)
  }

  async deploy() {
    try {
      const stateResponse = await fetch(`/api/collections/${this.collectionId}/deploy/status?wallet_address=${this.walletAddress}`)
      const state = stateResponse.ok ? await stateResponse.json() : {}

      // Step 1: Upload Metadata (no wallet popup, safe to update UI)
      if (state.metadata_uploaded) {
        this.updateStep('upload_metadata', { status: 'completed', description: 'Metadata already uploaded' })
      } else {
        await this.uploadMetadata()
      }

      // Let React flush any pending re-renders before wallet popups start
      await new Promise(r => setTimeout(r, 100))

      // Step 2: Create Core Collection (skip if already done)
      if (state.collection_mint_address) {
        this.updateStep('create_collection_nft', {
          status: 'completed',
          description: `Collection exists: ${state.collection_mint_address.substring(0, 8)}...`
        })
      } else {
        await this.createCollectionNFT()
      }

      // Let React flush before next wallet popup
      await new Promise(r => setTimeout(r, 100))

      // Step 3: Deploy Core Candy Machine (skip if already done)
      if (state.candy_machine_address) {
        this.updateStep('create_candy_machine', {
          status: 'completed',
          description: `Candy Machine exists: ${state.candy_machine_address.substring(0, 8)}...`
        })
      } else {
        await this.deployCandyMachine()
      }

      this.updateStep('complete', { status: 'completed' })
      return { success: true }
    } catch (error: any) {
      console.error('Deployment failed:', error)
      return { success: false, error: error.message }
    }
  }

  async uploadMetadata() {
    this.updateStep('upload_metadata', { status: 'in_progress' })
    try {
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/upload-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to upload metadata')

      this.updateStep('upload_metadata', {
        status: 'completed',
        description: `Uploaded ${data.count} NFTs successfully`
      })
      return data
    } catch (error: any) {
      this.updateStep('upload_metadata', { status: 'failed', error: error.message })
      throw error
    }
  }

  /**
   * Create Collection NFT.
   *
   * Uses signTransaction + sendRawTransaction pattern:
   * 1. Partial-sign with collection signer keypair
   * 2. Wallet signs (one popup)
   * 3. We send via our own RPC connection
   *
   * CRITICAL: ZERO updateStep calls until AFTER the wallet popup closes.
   */
  async createCollectionNFT() {
    try {
      console.log('[Deploy] Building collection NFT transaction...')
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-collection-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create collection transaction')

      const connection = await getConnection()
      const transaction = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'))

      // Partial-sign with collection signer keypair (co-signer)
      if (data.signerSecretKey) {
        const collectionSigner = Keypair.fromSecretKey(new Uint8Array(Buffer.from(data.signerSecretKey, 'base64')))
        transaction.sign([collectionSigner])
        console.log('[Deploy] Partial-signed with collection signer')
      }

      // Wallet signs — this opens the popup
      console.log('[Deploy] Requesting wallet approval for collection NFT...')
      const signedTx = await this.wallet.signTransaction(transaction)

      // Wallet popup closed — NOW safe to update UI
      this.updateStep('create_collection_nft', { status: 'in_progress', description: 'Sending transaction...' })

      // We send via our RPC (not the wallet's internal RPC)
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      console.log('[Deploy] Collection NFT tx sent:', signature)

      this.updateStep('create_collection_nft', { description: 'Confirming on-chain...' })

      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      })

      const confirmResponse = await fetch(`/api/collections/${this.collectionId}/deploy/create-collection-nft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_mint_address: data.collectionMint,
          tx_signature: signature,
          wallet_address: this.walletAddress,
        }),
      })
      const confirmData = await confirmResponse.json()
      if (!confirmResponse.ok) throw new Error(confirmData.error || 'Failed to confirm collection')

      this.updateStep('create_collection_nft', {
        status: 'completed',
        description: `Collection created: ${data.collectionMint.substring(0, 8)}...`
      })
      return confirmData
    } catch (error: any) {
      this.updateStep('create_collection_nft', { status: 'failed', error: error.message })
      throw error
    }
  }

  /**
   * Deploy Candy Machine — TWO-PHASE approach.
   *
   * Phase 1: Build CM creation tx (fresh blockhash) → sign → send → confirm
   * Phase 2: Build config line txs (fresh blockhash) → sign all → send with rate limiting → confirm
   *
   * Each phase gets its own blockhash, preventing expiration.
   *
   * CRITICAL: ZERO updateStep calls until AFTER wallet popups close.
   */
  async deployCandyMachine() {
    try {
      const connection = await getConnection()

      // ========== PHASE 1: Create Candy Machine ==========
      console.log('[Deploy Phase 1] Building CM creation transaction...')
      const phase1Response = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress, step: 'create' }),
      })
      const phase1Data = await phase1Response.json()
      if (!phase1Response.ok) throw new Error(phase1Data.error || 'Failed to build Candy Machine transaction')

      const candyMachineAddress = phase1Data.candyMachine
      console.log(`[Deploy Phase 1] CM address: ${candyMachineAddress}, config batches needed: ${phase1Data.configLineBatches}`)

      // Deserialize and partial-sign CM tx
      const cmTx = VersionedTransaction.deserialize(Buffer.from(phase1Data.transaction, 'base64'))
      if (phase1Data.cmSignerSecretKey) {
        const cmSigner = Keypair.fromSecretKey(new Uint8Array(Buffer.from(phase1Data.cmSignerSecretKey, 'base64')))
        cmTx.sign([cmSigner])
        console.log('[Deploy Phase 1] Partial-signed CM tx with candy machine signer')
      }

      // Wallet signs CM tx — POPUP 1
      console.log('[Deploy Phase 1] Requesting wallet approval for CM creation...')
      const signedCmTx = await this.wallet.signTransaction(cmTx)

      // Popup closed — safe to update UI
      this.updateStep('create_candy_machine', { status: 'in_progress', description: 'Sending Candy Machine transaction...' })

      // Send CM tx
      const cmSig = await connection.sendRawTransaction(signedCmTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      console.log(`[Deploy Phase 1] CM tx sent: ${cmSig}`)

      this.updateStep('create_candy_machine', { description: 'Confirming Candy Machine on-chain...' })

      const cmBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature: cmSig,
        blockhash: cmBlockhash.blockhash,
        lastValidBlockHeight: cmBlockhash.lastValidBlockHeight,
      })
      console.log(`[Deploy Phase 1] CM confirmed on-chain: ${cmSig}`)

      const signatures: string[] = [cmSig]

      // ========== PHASE 2: Add Config Lines (fresh blockhash) ==========
      if (phase1Data.configLineBatches > 0) {
        this.updateStep('create_candy_machine', {
          description: `Building ${phase1Data.configLineBatches} config line transactions...`,
        })

        console.log(`[Deploy Phase 2] Requesting config line txs with fresh blockhash...`)
        const phase2Response = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: this.walletAddress,
            step: 'config_lines',
            candy_machine_address: candyMachineAddress,
          }),
        })
        const phase2Data = await phase2Response.json()
        if (!phase2Response.ok) throw new Error(phase2Data.error || 'Failed to build config line transactions')

        const txList = phase2Data.transactions
        console.log(`[Deploy Phase 2] Built ${txList.length} config line txs with fresh blockhash`)

        // Deserialize config line txs
        const configTxs = txList.map((tx: any) =>
          VersionedTransaction.deserialize(Buffer.from(tx.transaction, 'base64'))
        )

        // No updateStep before wallet popup!
        // Sign config txs in batches to prevent Phantom timeout on large sets.
        // Each batch gets its own signAllTransactions popup.
        const SIGN_BATCH_SIZE = 6
        let signedConfigTxs: VersionedTransaction[] = []

        if (this.wallet.signAllTransactions && configTxs.length > 1) {
          for (let b = 0; b < configTxs.length; b += SIGN_BATCH_SIZE) {
            const batch = configTxs.slice(b, b + SIGN_BATCH_SIZE)
            console.log(`[Deploy Phase 2] Requesting wallet approval for config txs ${b + 1}-${b + batch.length} of ${configTxs.length}...`)
            const signed = await this.wallet.signAllTransactions(batch)
            signedConfigTxs.push(...signed)
          }
        } else {
          for (const tx of configTxs) {
            signedConfigTxs.push(await this.wallet.signTransaction(tx))
          }
        }

        // Popup closed — safe to update UI
        this.updateStep('create_candy_machine', {
          description: `Sending ${signedConfigTxs.length} config line transactions...`,
        })

        // Send config line txs with rate limiting
        const BATCH_SIZE = 3
        const DELAY_BETWEEN_BATCHES_MS = 1500
        const configSigs: string[] = []

        for (let i = 0; i < signedConfigTxs.length; i++) {
          const sig = await connection.sendRawTransaction(signedConfigTxs[i].serialize(), {
            skipPreflight: true,
            preflightCommitment: 'confirmed',
          })
          configSigs.push(sig)
          console.log(`[Deploy Phase 2] Sent config tx ${i + 1}/${signedConfigTxs.length}: ${sig}`)

          if ((i + 1) % BATCH_SIZE === 0 && i < signedConfigTxs.length - 1) {
            this.updateStep('create_candy_machine', {
              description: `Sending config lines... ${i + 1}/${signedConfigTxs.length}`,
            })
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
          }
        }

        this.updateStep('create_candy_machine', {
          description: `Confirming ${configSigs.length} config line transactions...`,
        })

        const confirmBlockhash = await connection.getLatestBlockhash()
        for (const sig of configSigs) {
          try {
            await connection.confirmTransaction({
              signature: sig,
              blockhash: confirmBlockhash.blockhash,
              lastValidBlockHeight: confirmBlockhash.lastValidBlockHeight,
            })
          } catch (confirmErr: any) {
            console.warn(`[Deploy Phase 2] Config tx confirm warning: ${confirmErr.message}`)
          }
          signatures.push(sig)
        }
        console.log(`[Deploy Phase 2] All ${configSigs.length} config line transactions confirmed`)
      }

      // ========== Save to database ==========
      this.updateStep('create_candy_machine', { description: 'Saving deployment to database...' })

      const confirmResponse = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candy_machine_address: candyMachineAddress,
          tx_signatures: signatures,
          wallet_address: this.walletAddress,
        }),
      })
      const confirmData = await confirmResponse.json()
      if (!confirmResponse.ok) throw new Error(confirmData.error || 'Failed to confirm Candy Machine')

      this.updateStep('create_candy_machine', {
        status: 'completed',
        description: `Candy Machine deployed: ${candyMachineAddress?.substring(0, 8)}...`
      })
      return confirmData
    } catch (error: any) {
      this.updateStep('create_candy_machine', { status: 'failed', error: error.message })
      throw error
    }
  }
}

/**
 * Mint an NFT from a Core Candy Machine
 */
export async function mintFromCandyMachine(
  collectionId: string,
  walletAddress: string,
  wallet: WalletAdapter,
  phaseId?: string
): Promise<{ success: boolean; nftMint?: string; signature?: string; error?: string }> {
  try {
    const buildResponse = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress, phase_id: phaseId }),
    })
    const buildData = await buildResponse.json()
    if (!buildResponse.ok) throw new Error(buildData.error || 'Failed to build mint transaction')

    const connection = await getConnection()
    const transaction = VersionedTransaction.deserialize(Buffer.from(buildData.transaction, 'base64'))

    // Partial-sign with NFT mint signer if provided
    if (buildData.signerSecretKey) {
      const nftSigner = Keypair.fromSecretKey(new Uint8Array(Buffer.from(buildData.signerSecretKey, 'base64')))
      transaction.sign([nftSigner])
    }

    // Wallet signs
    const signedTx = await wallet.signTransaction(transaction)

    // We send via our RPC
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    // Confirm with backend
    const confirmResponse = await fetch(`/api/launchpad/${collectionId}/mint/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature,
        nft_mint_address: buildData.nftMint,
        wallet_address: walletAddress,
      }),
    })
    const confirmData = await confirmResponse.json()
    if (!confirmResponse.ok) throw new Error(confirmData.error || 'Failed to confirm mint')

    return { success: true, nftMint: buildData.nftMint, signature }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Check mint status
 */
export async function checkMintStatus(
  collectionId: string,
  signature: string
): Promise<{ confirmed: boolean; status: string; error?: string }> {
  try {
    const response = await fetch(`/api/launchpad/${collectionId}/mint/confirm?signature=${signature}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Failed to check mint status')
    return { confirmed: data.mint.confirmed, status: data.mint.status }
  } catch (error: any) {
    return { confirmed: false, status: 'unknown', error: error.message }
  }
}
