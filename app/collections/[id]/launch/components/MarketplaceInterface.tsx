'use client'

import { Collection } from '../types'

interface MarketplaceInterfaceProps {
  collection: Collection
  collectionId: string
  currentAddress: string | null
  onLoadData: () => Promise<void>
}

export default function MarketplaceInterface({
  collection,
  collectionId,
  currentAddress,
  onLoadData,
}: MarketplaceInterfaceProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">💰 List Collection on Marketplace</h2>
          <p className="text-gray-600">
            Sell your entire collection (as generated images) for credits or BTC. The buyer will receive full ownership to generate more, inscribe, or launch as they wish.
          </p>
        </div>
        <p className="text-[#a8a8b8]/80">Marketplace interface - to be implemented</p>
      </div>
    </div>
  )
}

