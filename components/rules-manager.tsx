"use client"

import { useState } from "react"

export interface RulesManagerProps {
  onRuleAdded: (ruleType: string, ruleContent: string) => void
}

export function RulesManager({ onRuleAdded }: RulesManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newRule, setNewRule] = useState({
    type: "",
    content: ""
  })

  const ruleTypes = [
    { value: "generation", label: "Generation Rules", description: "Rules for how characters are generated" },
    { value: "trait", label: "Trait Rules", description: "Rules for specific traits" },
    { value: "composition", label: "Composition Rules", description: "Rules for image composition" },
    { value: "style", label: "Style Rules", description: "Rules for artistic style" },
    { value: "custom", label: "Custom Rules", description: "Your own custom rules" }
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newRule.type && newRule.content) {
      onRuleAdded(newRule.type, newRule.content)
      setNewRule({ type: "", content: "" })
      setIsOpen(false)
    }
  }

  return (
    <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Custom Rules Manager
        </h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
        >
          {isOpen ? 'Cancel' : 'Add New Rule'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Rule Type
            </label>
            <select
              value={newRule.type}
              onChange={(e) => setNewRule({ ...newRule, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              required
            >
              <option value="">Select Rule Type</option>
              {ruleTypes.map(ruleType => (
                <option key={ruleType.value} value={ruleType.value}>
                  {ruleType.label} - {ruleType.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
              Rule Content
            </label>
            <textarea
              value={newRule.content}
              onChange={(e) => setNewRule({ ...newRule, content: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-[#9945FF]/30 rounded-md bg-[#FDFCFA] dark:bg-[#14141e] text-gray-900 dark:text-gray-100"
              rows={4}
              placeholder="Enter your custom rule (this will be added to the generation prompt)"
              required
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              Rule Examples:
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• <strong>Generation:</strong> "All characters must face forward"</li>
              <li>• <strong>Trait:</strong> "Props must be held in right hand only"</li>
              <li>• <strong>Composition:</strong> "Head must be centered in frame"</li>
              <li>• <strong>Style:</strong> "Use dark, moody lighting"</li>
              <li>• <strong>Custom:</strong> "No modern clothing items"</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add Rule
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
