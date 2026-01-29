'use client'

import { GeneratedOrdinal } from '../types'
import { OrdinalCard } from './OrdinalCard'

interface OrdinalsGridProps {
  ordinals: GeneratedOrdinal[]
  totalOrdinals: number
  currentPage: number
  imageSliders: Record<string, number>
  setImageSliders: React.Dispatch<React.SetStateAction<Record<string, number>>>
  expandedTraits: Record<string, boolean>
  setExpandedTraits: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  showPromptId: string | null
  setShowPromptId: (id: string | null) => void
  flippingOrdinal: string | null
  onDownload: (ordinal: GeneratedOrdinal) => void
  onDelete: (id: string) => void
  onFlip: (id: string) => void
  onShowCompression: (ordinal: GeneratedOrdinal) => void
  collectionArtStyle?: string | null
}

export function OrdinalsGrid({
  ordinals,
  totalOrdinals,
  currentPage,
  imageSliders,
  setImageSliders,
  expandedTraits,
  setExpandedTraits,
  showPromptId,
  setShowPromptId,
  flippingOrdinal,
  onDownload,
  onDelete,
  onFlip,
  onShowCompression,
  collectionArtStyle,
}: OrdinalsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {ordinals.map((ordinal, index) => {
        const displayNumber = ordinal.ordinal_number !== null && ordinal.ordinal_number !== undefined
          ? ordinal.ordinal_number
          : totalOrdinals - (currentPage - 1) * 15 - index

        return (
          <OrdinalCard
            key={ordinal.id}
            ordinal={ordinal}
            displayNumber={displayNumber}
            imageSliders={imageSliders}
            setImageSliders={setImageSliders}
            expandedTraits={expandedTraits}
            setExpandedTraits={setExpandedTraits}
            showPromptId={showPromptId}
            setShowPromptId={setShowPromptId}
            flippingOrdinal={flippingOrdinal}
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

