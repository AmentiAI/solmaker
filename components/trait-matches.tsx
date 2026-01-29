"use client"

import type { Ordinal } from "@/types/ordinal"
import type { TraitFilters } from "@/components/trait-filter"

export interface TraitMatchesProps {
  ordinals: Ordinal[]
  traitFilters: TraitFilters
}

export function TraitMatches({ ordinals, traitFilters }: TraitMatchesProps) {
  // Find characters with matching traits
  const findMatchingCharacters = () => {
    const matches: Record<string, Ordinal[]> = {}
    
    Object.entries(traitFilters).forEach(([category, selectedTraits]) => {
      selectedTraits.forEach(trait => {
        const matchingOrdinals = ordinals.filter(ordinal => {
          const traitValue = ordinal.traits[category as keyof typeof ordinal.traits]
          return traitValue === trait
        })
        
        if (matchingOrdinals.length > 0) {
          const key = `${category}:${trait}`
          matches[key] = matchingOrdinals
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
        {Object.entries(matches).map(([key, matchingOrdinals]) => {
          const [category, trait] = key.split(':')
          return (
            <div key={key} className="bg-[#FDFCFA] dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200 capitalize">
                  {category}
                </span>
                <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                  {matchingOrdinals.length} match{matchingOrdinals.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>{trait}</strong>
              </div>
              <div className="flex flex-wrap gap-1">
                {matchingOrdinals.slice(0, 5).map(ordinal => (
                  <span
                    key={ordinal.id}
                    className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                  >
                    #{ordinal.number}
                  </span>
                ))}
                {matchingOrdinals.length > 5 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{matchingOrdinals.length - 5} more
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
