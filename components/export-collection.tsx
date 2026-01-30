"use client"

import { Button } from "@/components/ui/button"
import { Download, FileJson } from "lucide-react"
import type { Nft } from "@/types/nft"
import JSZip from "jszip"

interface ExportCollectionProps {
  nfts: Nft[]
}

export function ExportCollection({ nfts }: ExportCollectionProps) {
  const handleExportMetadata = () => {
    const metadata = nfts.map((nft) => ({
      number: nft.number,
      traits: nft.traits,
      rarityScore: nft.rarityScore,
      rarityTier: nft.rarityTier,
      imageUrl: nft.imageUrl,
    }))

    const dataStr = JSON.stringify(metadata, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = window.URL.createObjectURL(dataBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = "halloween-nfts-metadata.json"
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleExportAll = async () => {
    if (nfts.length === 0) return

    const zip = new JSZip()
    const imagesFolder = zip.folder("images")

    // Add metadata
    const metadata = nfts.map((nft) => ({
      number: nft.number,
      traits: nft.traits,
      rarityScore: nft.rarityScore,
      rarityTier: nft.rarityTier,
      filename: `nft-${nft.number}.png`,
    }))
    zip.file("metadata.json", JSON.stringify(metadata, null, 2))

    // Download all images
    for (const nft of nfts) {
      try {
        const response = await fetch(nft.imageUrl)
        const blob = await response.blob()
        imagesFolder?.file(`nft-${nft.number}.png`, blob)
      } catch (error) {
        console.error(`Failed to download NFT #${nft.number}:`, error)
      }
    }

    const content = await zip.generateAsync({ type: "blob" })
    const url = window.URL.createObjectURL(content)
    const a = document.createElement("a")
    a.href = url
    a.download = "halloween-nfts-collection.zip"
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (nfts.length === 0) return null

  return (
    <div className="flex gap-2">
      <Button onClick={handleExportMetadata} variant="outline" size="sm">
        <FileJson className="w-4 h-4 mr-2" />
        Export Metadata
      </Button>
      <Button onClick={handleExportAll} variant="default" size="sm">
        <Download className="w-4 h-4 mr-2" />
        Download All ({nfts.length})
      </Button>
    </div>
  )
}
