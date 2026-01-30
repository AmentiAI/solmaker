"use client"

import { useState } from "react"
// Simple SVG icons to avoid dependency issues
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
)

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
)

export interface CharacterTypeFilterProps {
  characterTypes: string[]
  selectedTypes: string[]
  onTypeToggle: (type: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  totalCount: number
  filteredCount: number
}

export function CharacterTypeFilter({
  characterTypes,
  selectedTypes,
  onTypeToggle,
  onSelectAll,
  onClearAll,
  totalCount,
  filteredCount
}: CharacterTypeFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      skull: "💀",
      zombie: "🧟",
      ghoul: "👻",
      werewolf: "🐺",
      skeleton: "🦴",
      vampire: "🧛",
      witch: "🧙",
      demon: "👹",
      mummy: "🧿",
      reaper: "☠️"
    }
    return icons[type] || "👤"
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      skull: "bg-gray-100 text-gray-800 border-gray-300",
      zombie: "bg-green-100 text-green-800 border-green-300",
      ghoul: "bg-purple-100 text-purple-800 border-purple-300",
      werewolf: "bg-orange-100 text-orange-800 border-orange-300",
      skeleton: "bg-[#FDFCFA] text-gray-800 border-gray-300",
      vampire: "bg-red-100 text-red-800 border-red-300",
      witch: "bg-indigo-100 text-indigo-800 border-indigo-300",
      demon: "bg-red-100 text-red-800 border-red-300",
      mummy: "bg-yellow-100 text-yellow-800 border-yellow-300",
      reaper: "bg-black text-white border-[#9945FF]/30"
    }
    return colors[type] || "bg-gray-100 text-gray-800 border-gray-300"
  }

  return (
    <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white hover:text-gray-900 dark:hover:text-gray-100"
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
            Character Types
          </button>
          <span className="text-xs text-[#a8a8b8]/80 dark:text-[#a8a8b8]">
            ({filteredCount} of {totalCount})
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-[#9945FF] hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Select All
          </button>
          <button
            onClick={onClearAll}
            className="text-xs text-gray-600 hover:text-gray-800 dark:text-[#a8a8b8] dark:hover:text-white"
          >
            Clear All
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {characterTypes.map((type) => (
            <label
              key={type}
              className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                selectedTypes.includes(type)
                  ? getTypeColor(type)
                  : "bg-gray-50 dark:bg-[#1a1a24]/80 text-gray-700 dark:text-white border-gray-200 dark:border-[#9945FF]/30 hover:bg-gray-100 dark:hover:bg-gray-600"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedTypes.includes(type)}
                onChange={() => onTypeToggle(type)}
                className="rounded"
              />
              <span className="text-lg">{getTypeIcon(type)}</span>
              <span className="text-sm font-medium capitalize">{type}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
