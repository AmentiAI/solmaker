/**
 * Frontend helper for Solana Core Candy Machine deployment.
 *
 * Key changes from legacy:
 * - No setMintAuthority step needed
 * - Creates Core Assets (not SPL tokens)
 * - Guards enforce fees on-chain
 */

import { VersionedTransaction, Connection } from '@solana/web3.js'

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  error?: string
}

export interface WalletSigner {
  signTransaction: <T extends VersionedTransaction>(transaction: T) => Promise<T>
}

export class SolanaDeployment {
  collectionId: string
  walletAddress: string
  wallet: WalletSigner
  steps: DeploymentStep[]
  onUpdate: (steps: DeploymentStep[]) => void

  constructor(
    collectionId: string,
    walletAddress: string,
    wallet: WalletSigner,
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
      // Check current deployment state to skip completed steps
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

      // Complete
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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload metadata')
      }

      this.updateStep('upload_metadata', {
        status: 'completed',
        description: `Uploaded ${data.count} NFTs successfully`
      })

      return data
    } catch (error: any) {
      this.updateStep('upload_metadata', {
        status: 'failed',
        error: error.message
      })
      throw error
    }
  }

  /**
   * Sign a partially-signed transaction and send it via RPC
   */
  async signAndSend(serializedTx: string): Promise<string> {
    const transaction = VersionedTransaction.deserialize(Buffer.from(serializedTx, 'base64'))

    const signed = await this.wallet.signTransaction(transaction)

    const networkResponse = await fetch('/api/solana/network')
    const networkData = await networkResponse.json()
    const rpcUrl = networkData.rpcUrl || 'https://api.devnet.solana.com'

    const connection = new Connection(rpcUrl, 'confirmed')
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    })

    const confirmation = await connection.confirmTransaction(signature, 'confirmed')
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    return signature
  }

  async createCollectionNFT() {
    this.updateStep('create_collection_nft', { status: 'in_progress' })

    try {
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-collection-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create collection transaction')
      }

      const signature = await this.signAndSend(data.transaction)

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
      console.log('[SolanaDeployment] Collection confirm response:', JSON.stringify(confirmData, null, 2))

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm collection')
      }

      this.updateStep('create_collection_nft', {
        status: 'completed',
        description: `Collection created: ${data.collectionMint.substring(0, 8)}...`
      })

      return confirmData
    } catch (error: any) {
      this.updateStep('create_collection_nft', {
        status: 'failed',
        error: error.message
      })
      throw error
    }
  }

  async deployCandyMachine() {
    this.updateStep('create_candy_machine', { status: 'in_progress' })

    try {
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Candy Machine transactions')
      }

      const signatures: string[] = []

      for (let i = 0; i < data.transactions.length; i++) {
        const txData = data.transactions[i]

        this.updateStep('create_candy_machine', {
          description: `Signing transaction ${i + 1} of ${data.transactions.length}: ${txData.description}`
        })

        const signature = await this.signAndSend(txData.transaction)
        signatures.push(signature)

        if (i < data.transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      const confirmResponse = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candy_machine_address: data.candyMachine,
          tx_signatures: signatures,
          wallet_address: this.walletAddress,
        }),
      })

      const confirmData = await confirmResponse.json()
      console.log('[SolanaDeployment] Candy Machine confirm response:', JSON.stringify(confirmData, null, 2))

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm Candy Machine')
      }

      if (confirmData.dbVerification) {
        console.log('[SolanaDeployment] DB Verification:', JSON.stringify(confirmData.dbVerification, null, 2))
      }

      this.updateStep('create_candy_machine', {
        status: 'completed',
        description: `Candy Machine deployed: ${data.candyMachine.substring(0, 8)}...`
      })

      return confirmData
    } catch (error: any) {
      this.updateStep('create_candy_machine', {
        status: 'failed',
        error: error.message
      })
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
  wallet: WalletSigner,
  phaseId?: string
): Promise<{ success: boolean; nftMint?: string; signature?: string; error?: string }> {
  try {
    const buildResponse = await fetch(`/api/launchpad/${collectionId}/mint/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: walletAddress,
        phase_id: phaseId,
      }),
    })

    const buildData = await buildResponse.json()

    if (!buildResponse.ok) {
      throw new Error(buildData.error || 'Failed to build mint transaction')
    }

    // Deserialize the partially-signed transaction (only nftMint keypair signed)
    const transaction = VersionedTransaction.deserialize(Buffer.from(buildData.transaction, 'base64'))

    // User signs the transaction (as payer)
    const signed = await wallet.signTransaction(transaction)

    const networkResponse = await fetch('/api/solana/network')
    const networkData = await networkResponse.json()
    const rpcUrl = networkData.rpcUrl || 'https://api.devnet.solana.com'

    const connection = new Connection(rpcUrl, 'confirmed')
    const signature = await connection.sendRawTransaction(signed.serialize(), {
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

    if (!confirmResponse.ok) {
      throw new Error(confirmData.error || 'Failed to confirm mint')
    }

    return {
      success: true,
      nftMint: buildData.nftMint,
      signature,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    }
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

    if (!response.ok) {
      throw new Error(data.error || 'Failed to check mint status')
    }

    return {
      confirmed: data.mint.confirmed,
      status: data.mint.status,
    }
  } catch (error: any) {
    return {
      confirmed: false,
      status: 'unknown',
      error: error.message,
    }
  }
}
