'use client'

import { Phase, Whitelist } from '../../types'

interface PhasesTabProps {
  collectionId: string
  phases: Phase[]
  whitelists: Whitelist[]
  currentAddress: string | null
  onLoadData: () => Promise<void>
}

export default function PhasesTab({
  collectionId,
  phases,
  whitelists,
  currentAddress,
  onLoadData,
}: PhasesTabProps) {
  return (
    <div className="space-y-6">
      <p className="text-[#a8a8b8]/80">Phases tab - to be implemented</p>
    </div>
  )
}

