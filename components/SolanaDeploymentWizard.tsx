'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, Loader2, XCircle, Rocket } from 'lucide-react'
import { SolanaDeployment, DeploymentStep } from '@/lib/solana-deployment'
import { useWallet } from '@solana/wallet-adapter-react'

interface SolanaDeploymentWizardProps {
  collectionId: string
  onComplete?: () => void
}

export function SolanaDeploymentWizard({ collectionId, onComplete }: SolanaDeploymentWizardProps) {
  const { publicKey, connected } = useWallet()
  const [steps, setSteps] = useState<DeploymentStep[]>([])
  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [network, setNetwork] = useState<string>('devnet')
  const [loadingNetwork, setLoadingNetwork] = useState(true)

  // Load network on mount
  useState(() => {
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
  })

  const handleDeploy = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    setIsDeploying(true)
    setError(null)

    const deployment = new SolanaDeployment(
      collectionId,
      publicKey.toBase58(),
      (updatedSteps) => setSteps(updatedSteps)
    )

    setSteps(deployment.steps)

    const result = await deployment.deploy()

    setIsDeploying(false)

    if (result.success) {
      onComplete?.()
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
                {network === 'mainnet-beta' ? '🚀 Mainnet (Production)' : '🧪 Devnet (Testing)'}
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
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Action Button */}
        {steps.length === 0 && (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-sm text-blue-900 mb-2">
                Before you deploy:
              </h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
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
