"use client"

import { OrdinalCard } from "@/components/ordinal-card"
import type { Ordinal } from "@/types/ordinal"

export interface CharacterTypeGroupsProps {
  ordinals: Ordinal[]
  selectedTypes: string[]
  onDelete: (id: string) => void
}

export function CharacterTypeGroups({ ordinals, selectedTypes, onDelete }: CharacterTypeGroupsProps) {
  // Group ordinals by character type
  const groupedOrdinals = ordinals.reduce((groups, ordinal) => {
    const characterType = ordinal.traits.characterType
    if (!groups[characterType]) {
      groups[characterType] = []
    }
    groups[characterType].push(ordinal)
    return groups
  }, {} as Record<string, Ordinal[]>)

  // Filter groups based on selected types
  const filteredGroups = Object.entries(groupedOrdinals).filter(([type]) => 
    selectedTypes.length === 0 || selectedTypes.includes(type)
  )

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
      reaper: "bg-black text-white border-gray-600"
    }
    return colors[type] || "bg-gray-100 text-gray-800 border-gray-300"
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <span className="text-2xl">👤</span>
        </div>
        <h3 className="text-lg font-semibold mb-2">No Characters Found</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {selectedTypes.length > 0 
            ? "No characters match the selected character types"
            : "No characters have been generated yet"
          }
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {filteredGroups.map(([characterType, typeOrdinals]) => (
        <div key={characterType} className="space-y-4">
          {/* Character Type Header */}
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${getTypeColor(characterType)}`}>
            <span className="text-2xl">{getTypeIcon(characterType)}</span>
            <div>
              <h3 className="text-lg font-semibold capitalize">{characterType}s</h3>
              <p className="text-sm opacity-75">
                {typeOrdinals.length} {typeOrdinals.length === 1 ? 'character' : 'characters'}
              </p>
            </div>
          </div>

          {/* Characters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {typeOrdinals.map((ordinal) => (
              <OrdinalCard 
                key={ordinal.id} 
                ordinal={ordinal} 
                onDelete={onDelete} 
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
