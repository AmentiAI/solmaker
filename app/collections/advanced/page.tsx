"use client"

import { useState, useEffect } from "react"
import { TraitManager } from "@/components/trait-manager"
import { CharacterManager } from "@/components/character-manager"
import { RulesManager } from "@/components/rules-manager"
import Link from "next/link"

interface Collection {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

interface CustomRule {
  id: string
  type: string
  content: string
  createdAt: string
}

export default function AdvancedCollections() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [customRules, setCustomRules] = useState<CustomRule[]>([])
  const [activeTab, setActiveTab] = useState<'traits' | 'characters' | 'rules'>('traits')

  useEffect(() => {
    loadCollections()
    loadCustomRules()
  }, [])

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/collections')
      if (response.ok) {
        const data = await response.json()
        setCollections(data.collections)
      }
    } catch (error) {
      console.error('Error loading collections:', error)
    }
  }

  const loadCustomRules = async () => {
    try {
      const response = await fetch('/api/custom-rules')
      if (response.ok) {
        const data = await response.json()
        setCustomRules(data.rules)
      }
    } catch (error) {
      console.error('Error loading custom rules:', error)
    }
  }

  const handleTraitAdded = async (category: string, traitName: string, description: string, rarity: string) => {
    try {
      const response = await fetch('/api/traits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          trait_name: traitName,
          description,
          rarity
        })
      })
      
      if (response.ok) {
        console.log('Trait added successfully')
        // You could add a success notification here
      }
    } catch (error) {
      console.error('Error adding trait:', error)
    }
  }

  const handleCharacterAdded = async (characterName: string, description: string) => {
    try {
      const response = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: characterName,
          description
        })
      })
      
      if (response.ok) {
        console.log('Character added successfully')
        // You could add a success notification here
      }
    } catch (error) {
      console.error('Error adding character:', error)
    }
  }

  const handleRuleAdded = async (ruleType: string, ruleContent: string) => {
    try {
      const response = await fetch('/api/custom-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: ruleType,
          content: ruleContent
        })
      })
      
      if (response.ok) {
        console.log('Rule added successfully')
        loadCustomRules() // Reload rules
      }
    } catch (error) {
      console.error('Error adding rule:', error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background/95 backdrop-blur-sm sticky top-0 z-10 border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-balance">Advanced Collection Management</h1>
              <p className="text-sm text-muted-foreground">
                Create custom traits, characters, and rules for your collections
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/collections" 
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Back to Collections
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-gray-100 dark:bg-[#1a1a24] p-1 rounded-lg">
            {[
              { id: 'traits', label: 'Trait Manager', icon: '🎭' },
              { id: 'characters', label: 'Character Manager', icon: '👤' },
              { id: 'rules', label: 'Rules Manager', icon: '📋' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'traits' | 'characters' | 'rules')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#FDFCFA] dark:bg-[#1a1a24]/80 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-[#a8a8b8] hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'traits' && (
            <div>
              <TraitManager onTraitAdded={handleTraitAdded} />
            </div>
          )}

          {activeTab === 'characters' && (
            <div>
              <CharacterManager onCharacterAdded={handleCharacterAdded} />
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-6">
              <RulesManager onRuleAdded={handleRuleAdded} />
              
              {/* Display existing custom rules */}
              {customRules.length > 0 && (
                <div className="bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Existing Custom Rules
                  </h3>
                  <div className="space-y-3">
                    {customRules.map(rule => (
                      <div key={rule.id} className="bg-gray-50 dark:bg-[#1a1a24]/80 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                              {rule.type} Rule
                            </span>
                            <p className="text-sm text-gray-600 dark:text-[#a8a8b8] mt-1">
                              {rule.content}
                            </p>
                          </div>
                          <span className="text-xs text-[#a8a8b8]/80 dark:text-[#a8a8b8]">
                            {new Date(rule.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collection Overview */}
        <div className="mt-8 bg-[#FDFCFA] dark:bg-[#1a1a24] border border-gray-200 dark:border-[#9945FF]/20 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Collection Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#9945FF] dark:text-blue-400">
                {collections.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-[#a8a8b8]">
                Total Collections
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {collections.filter(c => c.isActive).length}
              </div>
              <div className="text-sm text-gray-600 dark:text-[#a8a8b8]">
                Active Collections
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {customRules.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-[#a8a8b8]">
                Custom Rules
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
