"use client"

import { useState } from "react"

export interface TraitManagerProps {
  onTraitAdded: (category: string, traitName: string, description: string, rarity: string) => void
}

export function TraitManager({ onTraitAdded }: TraitManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newTrait, setNewTrait] = useState({
    category: "",
    name: "",
    description: "",
    rarity: "common"
  })

  const categories = [
    "background", "accessories", "eyes", "mouth", 
    "headwear", "outfits", "props"
  ]

  const rarities = [
    { value: "common", label: "Common", color: "bg-gray-100 text-gray-800" },
    { value: "rare", label: "Rare", color: "bg-blue-100 text-blue-800" },
    { value: "epic", label: "Epic", color: "bg-purple-100 text-purple-800" },
    { value: "legendary", label: "Legendary", color: "bg-yellow-100 text-yellow-800" }
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newTrait.category && newTrait.name && newTrait.description) {
      onTraitAdded(newTrait.category, newTrait.name, newTrait.description, newTrait.rarity)
      setNewTrait({ category: "", name: "", description: "", rarity: "common" })
      setIsOpen(false)
    }
  }

  return (
    <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Trait Manager
        </h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-[#9945FF] text-sm"
        >
          {isOpen ? 'Cancel' : 'Add New Trait'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Category
              </label>
              <select
                value={newTrait.category}
                onChange={(e) => setNewTrait({ ...newTrait, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
                required
              >
                <option value="">Select Category</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Rarity
              </label>
              <select
                value={newTrait.rarity}
                onChange={(e) => setNewTrait({ ...newTrait, rarity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              >
                {rarities.map(rarity => (
                  <option key={rarity.value} value={rarity.value}>
                    {rarity.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Trait Name
            </label>
            <input
              type="text"
              value={newTrait.name}
              onChange={(e) => setNewTrait({ ...newTrait, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              placeholder="Enter trait name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Description
            </label>
            <textarea
              value={newTrait.description}
              onChange={(e) => setNewTrait({ ...newTrait, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              rows={4}
              placeholder="Enter detailed description for AI generation"
              required
            />
          </div>
 
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add Trait
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
 
