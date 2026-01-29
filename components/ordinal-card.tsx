"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Trash2 } from "lucide-react"
import type { Ordinal } from "@/types/ordinal"
import { TraitDisplay } from "@/components/trait-display"
import { RarityBadge } from "@/components/rarity-badge"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"

interface OrdinalCardProps {
  ordinal: Ordinal
  onDelete?: (id: string) => void
}

export function OrdinalCard({ ordinal, onDelete }: OrdinalCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDownload = async () => {
    try {
      const response = await fetch(ordinal.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ordinal-${ordinal.number}.png`
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
        body: JSON.stringify({ url: ordinal.imageUrl }),
      })

      if (response.ok) {
        onDelete?.(ordinal.id)
        toast.success(`Ordinal #${ordinal.number} deleted`)
        setShowDeleteConfirm(false)
      } else {
        console.error("Failed to delete ordinal")
        toast.error("Failed to delete ordinal. Please try again.")
      }
    } catch (error) {
      console.error("Delete error:", error)
      toast.error("Failed to delete ordinal. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="overflow-hidden group">
      <div className="aspect-square relative bg-background mb-3">
        <img
          src={ordinal.imageUrl || "/placeholder.svg"}
          alt={`Ordinal #${ordinal.number}`}
          className="w-full h-full object-cover rounded-lg"
        />
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="font-mono font-bold shadow-lg">
            #{ordinal.number}
          </Badge>
        </div>
        {ordinal.rarityTier && (
          <div className="absolute top-3 right-3">
            <RarityBadge rarity={ordinal.rarityTier} score={ordinal.rarityScore} size="sm" />
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
          <h3 className="font-semibold text-sm">Ordinal #{ordinal.number}</h3>
          {ordinal.rarityTier && <RarityBadge rarity={ordinal.rarityTier} size="sm" />}
        </div>
        <TraitDisplay traits={ordinal.traits} showRarity={false} />
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={executeDelete}
        title="Delete Ordinal"
        message={`Delete Ordinal #${ordinal.number}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        loading={isDeleting}
      />
    </div>
  )
}
