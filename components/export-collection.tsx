"use client"

import { Button } from "@/components/ui/button"
import { Download, FileJson } from "lucide-react"
import type { Ordinal } from "@/types/ordinal"
import JSZip from "jszip"

interface ExportCollectionProps {
  ordinals: Ordinal[]
}

export function ExportCollection({ ordinals }: ExportCollectionProps) {
  const handleExportMetadata = () => {
    const metadata = ordinals.map((ordinal) => ({
      number: ordinal.number,
      traits: ordinal.traits,
      rarityScore: ordinal.rarityScore,
      rarityTier: ordinal.rarityTier,
      imageUrl: ordinal.imageUrl,
    }))

    const dataStr = JSON.stringify(metadata, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = window.URL.createObjectURL(dataBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = "halloween-ordinals-metadata.json"
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleExportAll = async () => {
    if (ordinals.length === 0) return

    const zip = new JSZip()
    const imagesFolder = zip.folder("images")

    // Add metadata
    const metadata = ordinals.map((ordinal) => ({
      number: ordinal.number,
      traits: ordinal.traits,
      rarityScore: ordinal.rarityScore,
      rarityTier: ordinal.rarityTier,
      filename: `ordinal-${ordinal.number}.png`,
    }))
    zip.file("metadata.json", JSON.stringify(metadata, null, 2))

    // Download all images
    for (const ordinal of ordinals) {
      try {
        const response = await fetch(ordinal.imageUrl)
        const blob = await response.blob()
        imagesFolder?.file(`ordinal-${ordinal.number}.png`, blob)
      } catch (error) {
        console.error(`Failed to download ordinal #${ordinal.number}:`, error)
      }
    }

    const content = await zip.generateAsync({ type: "blob" })
    const url = window.URL.createObjectURL(content)
    const a = document.createElement("a")
    a.href = url
    a.download = "halloween-ordinals-collection.zip"
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (ordinals.length === 0) return null

  return (
    <div className="flex gap-2">
      <Button onClick={handleExportMetadata} variant="outline" size="sm">
        <FileJson className="w-4 h-4 mr-2" />
        Export Metadata
      </Button>
      <Button onClick={handleExportAll} variant="default" size="sm">
        <Download className="w-4 h-4 mr-2" />
        Download All ({ordinals.length})
      </Button>
    </div>
  )
}
