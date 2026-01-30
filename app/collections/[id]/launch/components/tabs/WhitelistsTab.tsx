'use client'

import { Whitelist } from '../../types'

interface WhitelistsTabProps {
  collectionId: string
  whitelists: Whitelist[]
  currentAddress: string | null
  onLoadData: () => Promise<void>
}

export default function WhitelistsTab({
  collectionId,
  whitelists,
  currentAddress,
  onLoadData,
}: WhitelistsTabProps) {
  return (
    <div className="space-y-6">
      <p className="text-[#a8a8b8]/80">Whitelists tab - to be implemented</p>
    </div>
  )
}

