/**
 * Frontend helper for Solana Core Candy Machine deployment.
 *
 * Uses the standard @solana/wallet-adapter pattern:
 * - sendTransaction(tx, connection, { signers }) for single transactions
 * - signAllTransactions + sendRawTransaction for batch config lines
 *
 * Keypairs that need to co-sign (collection signer, candy machine signer)
 * are generated server-side and returned to the frontend so we can pass
 * them as `signers` to the wallet adapter's sendTransaction method.
 * This lets the adapter handle wallet lifecycle properly for ALL wallets.
 */

import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js'

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  error?: string
}

/**
 * Matches what useWallet() provides — standard wallet adapter interface.
 * sendTransaction is the recommended way per Solana wallet adapter docs.
 */
export interface WalletAdapter {
  sendTransaction: (
    transaction: VersionedTransaction,
    connection: Connection,
    options?: { signers?: Keypair[] }
  ) => Promise<string>
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

      // Step 1: Upload Metadata (skip if already done)
      if (state.metadata_uploaded) {
        this.updateStep('upload_metadata', { status: 'completed', description: 'Metadata already uploaded' })
      } else {
        await this.uploadMetadata()
      }

      // Step 2: Create Core Collection (skip if already done)
      if (state.collection_mint_address) {
        this.updateStep('create_collection_nft', {
          status: 'completed',
          description: `Collection exists: ${state.collection_mint_address.substring(0, 8)}...`
        })
      } else {
        await this.createCollectionNFT()
      }

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
   * Create Collection NFT using sendTransaction (standard wallet adapter pattern).
   * Server returns unsigned tx + collection signer secret key.
   * We pass the signer to sendTransaction via the `signers` option.
   */
  async createCollectionNFT() {
    this.updateStep('create_collection_nft', { status: 'in_progress' })
    try {
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-collection-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create collection transaction')

      const connection = await getConnection()
      const transaction = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'))

      // Reconstruct the collection signer keypair from the secret key returned by server
      const collectionSigner = data.signerSecretKey
        ? Keypair.fromSecretKey(Uint8Array.from(Buffer.from(data.signerSecretKey, 'base64')))
        : undefined

      this.updateStep('create_collection_nft', {
        description: 'Approve transaction in your wallet...',
      })

      // sendTransaction handles signing + sending + wallet lifecycle for ALL wallets
      const signature = await this.wallet.sendTransaction(
        transaction,
        connection,
        collectionSigner ? { signers: [collectionSigner] } : undefined
      )

      // Wait for confirmation
      this.updateStep('create_collection_nft', {
        description: 'Confirming on-chain...',
      })

      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      })

      // Save to DB
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
   * Deploy Candy Machine.
   *
   * Flow:
   * 1. One API call builds ALL transactions (CM creation + config lines) — returns unsigned txs + CM signer key
   * 2. CM creation: sendTransaction with CM signer (1 wallet popup, standard adapter flow)
   * 3. Config lines: signAllTransactions (1 wallet popup) → blast-send via RPC
   * 4. Save to DB
   *
   * Total: 2 wallet popups for the entire candy machine deployment.
   */
  async deployCandyMachine() {
    this.updateStep('create_candy_machine', { status: 'in_progress' })

    try {
      // Step 1: Build ALL transactions
      this.updateStep('create_candy_machine', { description: 'Building all transactions...' })

      const buildResponse = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })
      const buildData = await buildResponse.json()
      if (!buildResponse.ok) throw new Error(buildData.error || 'Failed to build Candy Machine transactions')

      const { candyMachine: candyMachineAddress, transactions: txList } = buildData
      console.log(`[Deploy] Built ${txList.length} transactions for CM ${candyMachineAddress}`)

      const connection = await getConnection()
      const signatures: string[] = []

      // Step 2: Send CM creation (tx 0) using sendTransaction with CM signer
      this.updateStep('create_candy_machine', {
        description: 'Approve Candy Machine creation in your wallet...',
      })

      const cmTx = VersionedTransaction.deserialize(Buffer.from(txList[0].transaction, 'base64'))
      const cmSigner = buildData.cmSignerSecretKey
        ? Keypair.fromSecretKey(Uint8Array.from(Buffer.from(buildData.cmSignerSecretKey, 'base64')))
        : undefined

      const cmSig = await this.wallet.sendTransaction(
        cmTx,
        connection,
        cmSigner ? { signers: [cmSigner] } : undefined
      )

      this.updateStep('create_candy_machine', { description: 'Confirming Candy Machine creation...' })
      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature: cmSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      })
      signatures.push(cmSig)
      console.log(`[Deploy] CM created: ${cmSig}`)

      // Step 3: Config line transactions — signAllTransactions + blast send
      if (txList.length > 1) {
        const configTxs = txList.slice(1).map((tx: any) =>
          VersionedTransaction.deserialize(Buffer.from(tx.transaction, 'base64'))
        )

        this.updateStep('create_candy_machine', {
          description: `Approve ${configTxs.length} config line transactions in your wallet...`,
        })

        // Sign all config line txs at once (1 popup)
        let signedConfigTxs: VersionedTransaction[]
        if (this.wallet.signAllTransactions && configTxs.length > 1) {
          signedConfigTxs = await this.wallet.signAllTransactions(configTxs)
        } else {
          // Wallet doesn't support signAllTransactions — fall back to individual sendTransaction
          for (let i = 0; i < configTxs.length; i++) {
            this.updateStep('create_candy_machine', {
              description: `Sending config line tx ${i + 1}/${configTxs.length}...`,
            })
            const sig = await this.wallet.sendTransaction(configTxs[i], connection)
            signatures.push(sig)
          }
          signedConfigTxs = [] // already sent
        }

        // Blast-send all signed config txs
        if (signedConfigTxs.length > 0) {
          this.updateStep('create_candy_machine', {
            description: `Sending ${signedConfigTxs.length} config line transactions...`,
          })

          const configSigs: string[] = []
          for (let i = 0; i < signedConfigTxs.length; i++) {
            const sig = await connection.sendRawTransaction(signedConfigTxs[i].serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            })
            configSigs.push(sig)
            console.log(`[Deploy] Sent config tx ${i + 1}/${signedConfigTxs.length}: ${sig}`)
          }

          // Confirm all
          this.updateStep('create_candy_machine', {
            description: `Confirming ${configSigs.length} config line transactions...`,
          })

          const confirmBlockhash = await connection.getLatestBlockhash()
          for (const sig of configSigs) {
            await connection.confirmTransaction({
              signature: sig,
              blockhash: confirmBlockhash.blockhash,
              lastValidBlockHeight: confirmBlockhash.lastValidBlockHeight,
            })
            signatures.push(sig)
          }
          console.log(`[Deploy] All ${configSigs.length} config line transactions confirmed`)
        }
      }

      // Step 4: Save to database
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

    // Reconstruct the NFT mint signer if provided
    const nftSigner = buildData.signerSecretKey
      ? Keypair.fromSecretKey(Uint8Array.from(Buffer.from(buildData.signerSecretKey, 'base64')))
      : undefined

    const signature = await wallet.sendTransaction(
      transaction,
      connection,
      nftSigner ? { signers: [nftSigner] } : undefined
    )

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
