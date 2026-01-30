"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Trash2 } from "lucide-react"
import type { Nft } from "@/types/nft"
import { TraitDisplay } from "@/components/trait-display"
import { RarityBadge } from "@/components/rarity-badge"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"

interface NftCardProps {
  nft: Nft
  onDelete?: (id: string) => void
}

export function NftCard({ nft, onDelete }: NftCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDownload = async () => {
    try {
      const response = await fetch(nft.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `nft-${nft.number}.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Failed to download image:", error)
    }
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const executeDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch("/api/ordinals/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nft.imageUrl }),
      })

      if (response.ok) {
        onDelete?.(nft.id)
        toast.success(`NFT #${nft.number} deleted`)
        setShowDeleteConfirm(false)
      } else {
        console.error("Failed to delete NFT")
        toast.error("Failed to delete NFT. Please try again.")
      }
    } catch (error) {
      console.error("Delete error:", error)
      toast.error("Failed to delete NFT. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="overflow-hidden group">
      <div className="aspect-square relative bg-background mb-3">
        <img
          src={nft.imageUrl || "/placeholder.svg"}
          alt={`NFT #${nft.number}`}
          className="w-full h-full object-cover rounded-lg"
        />
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="font-mono font-bold shadow-lg">
            #{nft.number}
          </Badge>
        </div>
        {nft.rarityTier && (
          <div className="absolute top-3 right-3">
            <RarityBadge rarity={nft.rarityTier} score={nft.rarityScore} size="sm" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
          <Button onClick={handleDownload} size="sm" variant="secondary">
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button onClick={handleDelete} size="sm" variant="destructive" disabled={isDeleting}>
            <Trash2 className="w-4 h-4 mr-2" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">NFT #${nft.number}</h3>
          {nft.rarityTier && <RarityBadge rarity={nft.rarityTier} size="sm" />}
        </div>
        <TraitDisplay traits={nft.traits} showRarity={false} />
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={executeDelete}
        title="Delete NFT"
        message={`Delete NFT #${nft.number}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        loading={isDeleting}
      />
    </div>
  )
}

/** @deprecated Use NftCard instead */
export const OrdinalCard = NftCard
