"use client"

import { useState } from "react"

export interface CharacterManagerProps {
  onCharacterAdded: (characterName: string, description: string) => void
}

export function CharacterManager({ onCharacterAdded }: CharacterManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newCharacter, setNewCharacter] = useState({
    name: "",
    description: ""
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newCharacter.name && newCharacter.description) {
      onCharacterAdded(newCharacter.name, newCharacter.description)
      setNewCharacter({ name: "", description: "" })
      setIsOpen(false)
    }
  }

  return (
    <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Character Manager
        </h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
        >
          {isOpen ? 'Cancel' : 'Add New Character'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Character Name
            </label>
            <input
              type="text"
              value={newCharacter.name}
              onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              placeholder="e.g., ghost, demon, zombie"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Character Description
            </label>
            <textarea
              value={newCharacter.description}
              onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              rows={3}
              placeholder="Describe the character's appearance and key features"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add Character
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded shadow-lg shadow-blue-500/20 transition-all duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
