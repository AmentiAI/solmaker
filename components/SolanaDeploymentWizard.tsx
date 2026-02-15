'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, Loader2, XCircle, Rocket, RefreshCw, Copy } from 'lucide-react'
import { SolanaDeployment, DeploymentStep } from '@/lib/solana-deployment'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'

interface DeploymentResult {
  candyMachineAddress: string | null
  collectionMintAddress: string | null
  deploymentStatus: string | null
  metadataUploaded: boolean
  dbVerified: boolean
}

interface SolanaDeploymentWizardProps {
  collectionId: string
  onComplete?: () => void
}

export function SolanaDeploymentWizard({ collectionId, onComplete }: SolanaDeploymentWizardProps) {
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet()
  const { connection } = useConnection()
  const [steps, setSteps] = useState<DeploymentStep[]>([])
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [network, setNetwork] = useState<string>('devnet')
  const [loadingNetwork, setLoadingNetwork] = useState(true)
  const [deploymentResult, setDeploymentResult] = useState<DeploymentResult | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Load network on mount
  useEffect(() => {
    async function loadNetwork() {
      try {
        const response = await fetch('/api/solana/network')
        if (response.ok) {
          const data = await response.json()
          setNetwork(data.network)
        }
      } catch (error) {
        console.error('Failed to load network:', error)
      } finally {
        setLoadingNetwork(false)
      }
    }
    loadNetwork()
  }, [])

  const verifyDatabase = async (): Promise<DeploymentResult> => {
    setVerifying(true)
    try {
      const response = await fetch(`/api/collections/${collectionId}/deploy/status?wallet_address=${publicKey?.toBase58()}`)
      const data = await response.json()
      console.log('[DeploymentWizard] DB verification response:', JSON.stringify(data, null, 2))

      const result: DeploymentResult = {
        candyMachineAddress: data.candy_machine_address || null,
        collectionMintAddress: data.collection_mint_address || null,
        deploymentStatus: data.deployment_status || null,
        metadataUploaded: data.metadata_uploaded || false,
        dbVerified: !!(data.candy_machine_address && data.collection_mint_address),
      }
      setDeploymentResult(result)
      return result
    } catch (err: any) {
      console.error('[DeploymentWizard] DB verification failed:', err)
      const result: DeploymentResult = {
        candyMachineAddress: null,
        collectionMintAddress: null,
        deploymentStatus: null,
        metadataUploaded: false,
        dbVerified: false,
      }
      setDeploymentResult(result)
      return result
    } finally {
      setVerifying(false)
    }
  }

  const handleDeploy = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    if (!signTransaction) {
      setError('Wallet does not support signing transactions')
      return
    }

    // Batch all initial state updates together, then wait for React to flush
    // before starting deploy (which opens wallet popups).
    setIsDeploying(true)
    setError(null)
    setDeploymentResult(null)

    // Pass signTransaction + signAllTransactions from the wallet adapter.
    // We use signTransaction + sendRawTransaction pattern instead of sendTransaction
    // because it gives better error messages and avoids Phantom's internal RPC issues.
    const deployment = new SolanaDeployment(
      collectionId,
      publicKey.toBase58(),
      {
        signTransaction: (tx) => signTransaction(tx),
        signAllTransactions: signAllTransactions || undefined,
      },
      (updatedSteps) => setSteps([...updatedSteps])
    )

    setSteps([...deployment.steps])

    // Wait for React to flush the initial render before any wallet popups
    await new Promise(r => setTimeout(r, 100))

    const result = await deployment.deploy()

    setIsDeploying(false)

    if (result.success) {
      const dbResult = await verifyDatabase()
      console.log('[DeploymentWizard] Post-deploy DB check:', JSON.stringify(dbResult, null, 2))

      if (!dbResult.dbVerified) {
        setError('WARNING: Deployment succeeded on-chain but database may not have saved. Check the details below. You may need to reload the page and try again.')
      }
    } else {
      setError(result.error || 'Deployment failed')
    }
  }

  const getStepIcon = (status: DeploymentStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />
      case 'in_progress':
        return <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />
      default:
        return <Circle className="h-6 w-6 text-white" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Deploy to Solana
        </CardTitle>
        <CardDescription>
          Deploy your collection as a Candy Machine on Solana blockchain
        </CardDescription>
        {!loadingNetwork && (
          <div className="mt-3 px-3 py-2 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/70">Network:</span>
              <span className={`font-semibold ${network === 'mainnet-beta' ? 'text-green-400' : 'text-blue-400'}`}>
                {network === 'mainnet-beta' ? 'Mainnet (Production)' : 'Devnet (Testing)'}
              </span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Deployment Steps */}
        {steps.length > 0 && (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {getStepIcon(step.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{step.title}</h4>
                    <span className="text-xs text-muted-foreground capitalize">
                      {step.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.description}
                  </p>
                  {step.error && (
                    <p className="text-sm text-red-500 mt-1">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Deployment Result / DB Verification */}
        {deploymentResult && (
          <div className={`p-4 rounded-lg border ${deploymentResult.dbVerified ? 'bg-green-900/20 border-green-500/50' : 'bg-yellow-900/20 border-yellow-500/50'}`}>
            <h4 className={`font-bold text-sm mb-3 ${deploymentResult.dbVerified ? 'text-green-400' : 'text-yellow-400'}`}>
              {deploymentResult.dbVerified ? 'Deployment Verified in Database' : 'Database Verification'}
            </h4>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between items-center">
                <span className="text-white/50">DB Status:</span>
                <span className={deploymentResult.deploymentStatus === 'deployed' ? 'text-green-400' : 'text-yellow-400'}>
                  {deploymentResult.deploymentStatus || 'NOT SET'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50">Metadata Uploaded:</span>
                <span className={deploymentResult.metadataUploaded ? 'text-green-400' : 'text-red-400'}>
                  {deploymentResult.metadataUploaded ? 'YES' : 'NO'}
                </span>
              </div>
              <div>
                <span className="text-white/50">Collection Mint:</span>
                <div className="mt-1 p-2 bg-black/40 rounded text-xs break-all flex items-center gap-2">
                  <span className={deploymentResult.collectionMintAddress ? 'text-[#00d4ff]' : 'text-red-400'}>
                    {deploymentResult.collectionMintAddress || 'NOT SAVED'}
                  </span>
                  {deploymentResult.collectionMintAddress && (
                    <button
                      onClick={() => navigator.clipboard.writeText(deploymentResult.collectionMintAddress!)}
                      className="text-white/30 hover:text-white/70 flex-shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-white/50">Candy Machine:</span>
                <div className="mt-1 p-2 bg-black/40 rounded text-xs break-all flex items-center gap-2">
                  <span className={deploymentResult.candyMachineAddress ? 'text-[#00d4ff]' : 'text-red-400'}>
                    {deploymentResult.candyMachineAddress || 'NOT SAVED'}
                  </span>
                  {deploymentResult.candyMachineAddress && (
                    <button
                      onClick={() => navigator.clipboard.writeText(deploymentResult.candyMachineAddress!)}
                      className="text-white/30 hover:text-white/70 flex-shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => verifyDatabase()}
                disabled={verifying}
                variant="outline"
                size="sm"
              >
                {verifying ? (
                  <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Checking DB...</>
                ) : (
                  <><RefreshCw className="mr-2 h-3 w-3" /> Re-check Database</>
                )}
              </Button>
              {deploymentResult.dbVerified && (
                <Button
                  onClick={() => {
                    onComplete?.()
                    window.location.reload()
                  }}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="mr-2 h-3 w-3" /> Continue (Reload Page)
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        {steps.length === 0 && !deploymentResult && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <h4 className="font-medium text-sm text-blue-300 mb-2">
                Before you deploy:
              </h4>
              <ul className="text-sm text-blue-200/70 space-y-1 list-disc list-inside">
                <li>Make sure all NFT images are generated</li>
                <li>Ensure you have ~0.2 SOL in your wallet for deployment costs</li>
                <li>Double-check your collection settings and royalties</li>
              </ul>
            </div>

            <Button
              onClick={handleDeploy}
              disabled={isDeploying || !connected}
              className="w-full"
              size="lg"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Deploy Candy Machine
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
