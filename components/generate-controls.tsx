"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Sparkles } from "lucide-react"
import type { Nft } from "@/types/nft"
import { useWallet } from "@/lib/wallet/compatibility"

interface GenerateControlsProps {
  onGenerate: (nft: Nft) => void
  currentCount: number
}

const COLLECTION_GOAL = 2500
const LEGENDARY_GOAL = 50

export function GenerateControls({ onGenerate, currentCount }: GenerateControlsProps) {
  const { isConnected, currentAddress } = useWallet()
  
  // Determine active wallet (Bitcoin only)
  const { activeWalletAddress, activeWalletConnected } = useMemo(() => {
    if (currentAddress && isConnected) {
      return { activeWalletAddress: currentAddress, activeWalletConnected: true }
    }
    return { activeWalletAddress: null, activeWalletConnected: false }
  }, [currentAddress, isConnected])
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [batchSize, setBatchSize] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const remaining = Math.max(0, COLLECTION_GOAL - currentCount)
  const progressPercent = Math.min(100, (currentCount / COLLECTION_GOAL) * 100)

  const handleGenerate = async () => {
    if (!activeWalletConnected || !activeWalletAddress) {
      setError("Please connect your wallet to generate NFTs")
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      for (let i = 0; i < batchSize; i++) {
        const number = currentCount + i + 1

        const response = await fetch("/api/generate-ordinal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ number, wallet_address: activeWalletAddress }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to generate NFT")
        }

        const data = await response.json()

        // Trigger credit refresh in header after successful generation
        window.dispatchEvent(new CustomEvent('refreshCredits'))

        const nft: Nft = {
          id: `nft-${number}`,
          number: data.number,
          imageUrl: data.imageUrl,
          metadataUrl: data.metadataUrl,
          traits: data.traits,
          prompt: data.prompt,
          createdAt: new Date().toISOString(),
          rarityScore: data.rarityScore,
          rarityTier: data.rarityTier,
        }

        onGenerate(nft)

        // Small delay between generations to avoid rate limits
        if (i < batchSize - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      
      // Show success message with credit deduction info
      setSuccessMessage(
        `Successfully generated ${batchSize} character${batchSize > 1 ? 's' : ''}! ${batchSize} credit${batchSize > 1 ? 's' : ''} deducted.`
      )
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      console.error("[v0] Generation error:", err)
      setError(err instanceof Error ? err.message : "Failed to generate NFT")
      setSuccessMessage(null) // Clear success message on error
    } finally {
      setIsGenerating(false)
    }
  }

  const quickBatchSizes = [1, 5, 10, 25, 50]

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Collection Progress</span>
          <span className="text-muted-foreground">
            {currentCount} / {COLLECTION_GOAL} ({progressPercent.toFixed(1)}%)
          </span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground text-center">{remaining} NFTs remaining to reach your goal</p>
        )}
        {currentCount >= COLLECTION_GOAL && (
          <p className="text-sm font-medium text-center text-green-600 dark:text-green-400">
            Collection goal reached! 🎉
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="batch-size">Batch Size</Label>
          <div className="flex gap-2 flex-wrap">
            {quickBatchSizes.map((size) => (
              <Button
                key={size}
                variant={batchSize === size ? "default" : "outline"}
                size="sm"
                onClick={() => setBatchSize(size)}
                disabled={isGenerating}
              >
                {size}
              </Button>
            ))}
          </div>
          <Input
            id="batch-size"
            type="number"
            min={1}
            max={10}
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(1, Math.min(10, Number.parseInt(e.target.value) || 1)))}
            disabled={isGenerating}
            className="mt-2"
          />
        </div>

        <Button onClick={handleGenerate} disabled={isGenerating} size="lg" className="w-full gap-2">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Summoning {batchSize} Character{batchSize > 1 ? "s" : ""}...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Summon {batchSize} Character{batchSize > 1 ? "s" : ""}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive font-medium">{error}</p>
          {error.includes("API key") && (
            <p className="text-xs text-muted-foreground mt-2">
              Add your OpenAI API key in the environment variables section.
            </p>
          )}
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-green-900/50 border border-green-700 rounded-lg">
          <p className="text-sm text-green-200 font-medium">✓ {successMessage}</p>
        </div>
      )}
    </div>
  )
}
