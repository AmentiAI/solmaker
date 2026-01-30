'use client'

import { GeneratedOrdinal } from '../types'
import { NftCard } from './OrdinalCard'

interface NftsGridProps {
  nfts: GeneratedOrdinal[]
  totalNfts: number
  currentPage: number
  imageSliders: Record<string, number>
  setImageSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>
  expandedTraits: Record<string, boolean>
  setExpandedTraits: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  showPromptId: string | null
  setShowPromptId: (id: string | null) => void
  flippingNft: string | null
  onDownload: (nft: GeneratedOrdinal) => void
  onDelete: (id: string) => void
  onFlip: (id: string) => void
  onShowCompression: (nft: GeneratedOrdinal) => void
  collectionArtStyle?: string | null
}

export function NftsGrid({
  nfts,
  totalNfts,
  currentPage,
  imageSliders,
  setImageSliders,
  expandedTraits,
  setExpandedTraits,
  showPromptId,
  setShowPromptId,
  flippingNft,
  onDownload,
  onDelete,
  onFlip,
  onShowCompression,
  collectionArtStyle,
}: NftsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {nfts.map((nft, index) => {
        const displayNumber = nft.ordinal_number !== null && nft.ordinal_number !== undefined
          ? nft.ordinal_number
          : totalNfts - (currentPage - 1) * 15 - index

        return (
          <NftCard
            key={nft.id}
            nft={nft}
            displayNumber={displayNumber}
            imageSliders={imageSliders}
            setImageSliders={setImageSliders}
            expandedTraits={expandedTraits}
            setExpandedTraits={setExpandedTraits}
            showPromptId={showPromptId}
            setShowPromptId={setShowPromptId}
            flippingNft={flippingNft}
            onDownload={onDownload}
            onDelete={onDelete}
            onFlip={onFlip}
            onShowCompression={onShowCompression}
            collectionArtStyle={collectionArtStyle}
          />
        )
      })}
    </div>
  )
}

/** @deprecated Use NftsGrid instead */
export const OrdinalsGrid = NftsGrid

