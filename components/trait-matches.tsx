"use client"

import type { Nft } from "@/types/nft"
import type { TraitFilters } from "@/components/trait-filter"

export interface TraitMatchesProps {
  nfts: Nft[]
  traitFilters: TraitFilters
}

export function TraitMatches({ nfts, traitFilters }: TraitMatchesProps) {
  // Find characters with matching traits
  const findMatchingCharacters = () => {
    const matches: Record<string, Nft[]> = {}
    
    Object.entries(traitFilters).forEach(([category, selectedTraits]) => {
      selectedTraits.forEach(trait => {
        const matchingNfts = nfts.filter(nft => {
          const traitValue = nft.traits[category as keyof typeof nft.traits]
          return traitValue === trait
        })
        
        if (matchingNfts.length > 0) {
          const key = `${category}:${trait}`
          matches[key] = matchingNfts
        }
      })
    })
    
    return matches
  }

  const matches = findMatchingCharacters()
  const totalMatches = Object.values(matches).flat().length
  const uniqueMatches = new Set(Object.values(matches).flat().map(o => o.id)).size

  if (Object.keys(matches).length === 0) {
    return null
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔍</span>
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          Trait Matches Found
        </h3>
        <span className="bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-sm px-2 py-1 rounded-full">
          {uniqueMatches} unique characters
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(matches).map(([key, matchingNfts]) => {
          const [category, trait] = key.split(':')
          return (
            <div key={key} className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-blue-200 dark:border-blue-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200 capitalize">
                  {category}
                </span>
                <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                  {matchingNfts.length} match{matchingNfts.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-white mb-2">
                <strong>{trait}</strong>
              </div>
              <div className="flex flex-wrap gap-1">
                {matchingNfts.slice(0, 5).map(nft => (
                  <span
                    key={nft.id}
                    className="text-xs bg-gray-100 dark:bg-[#1a1a24]/80 text-gray-700 dark:text-white px-2 py-1 rounded"
                  >
                    #{nft.number}
                  </span>
                ))}
                {matchingNfts.length > 5 && (
                  <span className="text-xs text-[#a8a8b8]/80 dark:text-[#a8a8b8]">
                    +{matchingNfts.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
