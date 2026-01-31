/**
 * Frontend helper for Solana Candy Machine deployment
 * Use this in the collection launch page
 */

import { VersionedTransaction } from '@solana/web3.js'

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  error?: string
}

export class SolanaDeployment {
  collectionId: string
  walletAddress: string
  steps: DeploymentStep[]
  onUpdate: (steps: DeploymentStep[]) => void

  constructor(collectionId: string, walletAddress: string, onUpdate: (steps: DeploymentStep[]) => void) {
    this.collectionId = collectionId
    this.walletAddress = walletAddress
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
        title: 'Create Collection NFT',
        description: 'Creating master collection NFT on-chain',
        status: 'pending',
      },
      {
        id: 'create_candy_machine',
        title: 'Deploy Candy Machine',
        description: 'Deploying Candy Machine smart contract',
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
      // Step 1: Upload Metadata
      await this.uploadMetadata()

      // Step 2: Create Collection NFT
      await this.createCollectionNFT()

      // Step 3: Deploy Candy Machine
      await this.deployCandyMachine()

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

  async createCollectionNFT() {
    this.updateStep('create_collection_nft', { status: 'in_progress' })

    try {
      // Build transaction
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-collection-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create collection NFT transaction')
      }

      // Sign and send transaction
      if (!window.solana || !window.solana.isConnected) {
        throw new Error('Wallet not connected')
      }

      const transaction = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'))
      const { signature } = await window.solana.signAndSendTransaction(transaction)

      // Confirm with backend
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

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm collection NFT')
      }

      this.updateStep('create_collection_nft', { 
        status: 'completed',
        description: `Collection NFT created: ${data.collectionMint.substring(0, 8)}...`
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
      // Build transactions
      const response = await fetch(`/api/collections/${this.collectionId}/deploy/create-candy-machine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: this.walletAddress }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create Candy Machine transactions')
      }

      // Sign and send all transactions
      if (!window.solana || !window.solana.isConnected) {
        throw new Error('Wallet not connected')
      }

      const signatures: string[] = []

      for (let i = 0; i < data.transactions.length; i++) {
        const txData = data.transactions[i]
        
        this.updateStep('create_candy_machine', { 
          description: `Signing transaction ${i + 1} of ${data.transactions.length}: ${txData.description}`
        })

        const transaction = VersionedTransaction.deserialize(Buffer.from(txData.transaction, 'base64'))
        const { signature } = await window.solana.signAndSendTransaction(transaction)
        signatures.push(signature)

        // Wait a bit between transactions
        if (i < data.transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Confirm with backend
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

      if (!confirmResponse.ok) {
        throw new Error(confirmData.error || 'Failed to confirm Candy Machine')
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
 * Mint an NFT from a Candy Machine
 */
export async function mintFromCandyMachine(
  collectionId: string,
  walletAddress: string,
  phaseId?: string
): Promise<{ success: boolean; nftMint?: string; signature?: string; error?: string }> {
  try {
    // Build mint transaction
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

    // Sign and send
    if (!window.solana || !window.solana.isConnected) {
      throw new Error('Wallet not connected')
    }

    const transaction = VersionedTransaction.deserialize(Buffer.from(buildData.transaction, 'base64'))
    const { signature } = await window.solana.signAndSendTransaction(transaction)

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
