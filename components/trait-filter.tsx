"use client"

import { useState } from "react"

export interface TraitFilterProps {
  nfts: unknown[]
  onFiltersChange: (filters: TraitFilters) => void
}

export interface TraitFilters {
  background: string[]
  accessories: string[]
  eyes: string[]
  mouth: string[]
  headwear: string[]
  outfits: string[]
  props: string[]
}

export function TraitFilter({ nfts, onFiltersChange }: TraitFilterProps) {
  const [selectedTraits, setSelectedTraits] = useState<TraitFilters>({
    background: [],
    accessories: [],
    eyes: [],
    mouth: [],
    headwear: [],
    outfits: [],
    props: []
  })

  // Extract all unique traits from NFTs
  const allTraits = nfts.reduce((acc, nft) => {
    if (!nft || !nft.traits) return acc
    
    const traits = nft.traits
    Object.entries(traits).forEach(([category, value]) => {
      if (category !== 'characterType' && typeof value === 'string' && value.trim()) {
        if (!acc[category]) acc[category] = new Set()
        acc[category].add(value)
      }
    })
    return acc
  }, {} as Record<string, Set<string>>)

  // Convert sets to sorted arrays
  const traitOptions = Object.fromEntries(
    Object.entries(allTraits).map(([category, traits]) => [
      category,
      Array.from(traits).sort()
    ])
  )

  const handleTraitChange = (category: keyof TraitFilters, value: string) => {
    const newSelectedTraits = {
      ...selectedTraits,
      [category]: value ? [value] : []
    }
    setSelectedTraits(newSelectedTraits)
    onFiltersChange(newSelectedTraits)
  }

  const clearAllFilters = () => {
    const emptyFilters: TraitFilters = {
      background: [],
      accessories: [],
      eyes: [],
      mouth: [],
      headwear: [],
      outfits: [],
      props: []
    }
    setSelectedTraits(emptyFilters)
    onFiltersChange(emptyFilters)
  }

  const getActiveFilterCount = () => {
    return Object.values(selectedTraits).reduce((total, traits) => total + traits.length, 0)
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      background: "🌍",
      accessories: "💎",
      eyes: "👁️",
      mouth: "👄",
      headwear: "👑",
      outfits: "👕",
      props: "🎭"
    }
    return icons[category] || "🔍"
  }

  return (
    <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trait Filters</h3>
          {getActiveFilterCount() > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
              {getActiveFilterCount()} active
            </span>
          )}
        </div>
        <button
          onClick={clearAllFilters}
          className="text-sm text-gray-600 hover:text-gray-800 dark:text-[#a8a8b8] dark:hover:text-white"
        >
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(traitOptions).map(([category, traits]) => (
          <div key={category} className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white">
              <span className="text-lg">{getCategoryIcon(category)}</span>
              <span className="capitalize">{category}</span>
            </label>
            <select
              value={selectedTraits[category as keyof TraitFilters][0] || ""}
              onChange={(e) => handleTraitChange(category as keyof TraitFilters, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">All {category}</option>
              {traits.map((trait) => (
                <option key={trait} value={trait}>
                  {trait}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
