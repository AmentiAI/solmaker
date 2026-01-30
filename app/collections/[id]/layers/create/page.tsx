'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'

export default function CreateLayerPage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, isConnected } = useWallet()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [allShownSuggestions, setAllShownSuggestions] = useState<string[]>([]) // Track all suggestions shown so far
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Not connected - show connect prompt FIRST (before loading check)
  if (!isConnected || !currentAddress) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-8">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold text-white mb-4">Wallet Connection Required</h2>
            <p className="text-white/70 mb-6">
              Please connect your wallet to create layers.
            </p>
            <Link href={`/collections/${params.id}`} className="px-6 py-3 bg-[#4561ad] hover:bg-[#3a5294] text-white rounded-lg font-semibold transition-colors inline-block">
              ← Back to Collection
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleGetSuggestions = async (ignoreList: string[] = []) => {
    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setLoadingSuggestions(true)
    setShowSuggestions(true)
    
    try {
      const response = await fetch(`/api/collections/${params.id}/layers/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
          ignore_list: ignoreList,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const newSuggestions = data.suggestions || []
        setSuggestions(newSuggestions)
        // Add new suggestions to the ignore list for next time
        setAllShownSuggestions(prev => [...prev, ...newSuggestions])
      } else {
        const error = await response.json()
        toast.error('Error getting suggestions', { description: error.error })
        setShowSuggestions(false)
      }
    } catch (error) {
      console.error('Error getting suggestions:', error)
      toast.error('Failed to get suggestions')
      setShowSuggestions(false)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const handleGetMoreSuggestions = async () => {
    // Pass all previously shown suggestions as ignore list
    await handleGetSuggestions(allShownSuggestions)
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setName(suggestion)
    setShowSuggestions(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Layer name is required')
      return
    }

    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setLoading(true)
    
    try {
      const response = await fetch(`/api/collections/${params.id}/layers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          wallet_address: currentAddress,
        }),
      })

      if (response.ok) {
        router.push(`/collections/${params.id}`)
      } else {
        const error = await response.json()
        toast.error('Error creating layer', { description: error.error })
      }
    } catch (error) {
      console.error('Error creating layer:', error)
      toast.error('Failed to create layer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link 
            href={`/collections/${params.id}`} 
            className="text-[#9945FF] hover:text-[#14F195] mb-4 inline-block"
          >
            ← Back to Collection
          </Link>
          <h1 className="text-3xl font-bold text-white">Create New Layer</h1>
        </div>

        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-white">
                Layer Name *
              </label>
                <button
                  type="button"
                  onClick={() => {
                    setAllShownSuggestions([]) // Reset ignore list for fresh suggestions
                    handleGetSuggestions([])
                  }}
                  disabled={loadingSuggestions}
                  className="text-sm bg-[#9945FF] text-white px-3 py-1.5 rounded hover:bg-[#14F195] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingSuggestions ? 'Getting suggestions...' : '💡 Give suggestions'}
                </button>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none"
                placeholder="Enter layer name (e.g., Background, Eyes, Headwear, etc)"
                required
              />
              <p className="text-sm text-[#a8a8b8]/80 mt-1">Layers are used to group the different parts of the art or pfp, name it whatever you wish.</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-[#9945FF] text-white px-4 py-2 rounded hover:bg-[#7C3AED] disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Layer'}
              </button>
              <Link
                href={`/collections/${params.id}`}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded shadow-lg shadow-blue-500/20 transition-all duration-200"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Suggestions Modal */}
        {showSuggestions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Layer Suggestions</h2>
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="text-[#a8a8b8]/80 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              {loadingSuggestions ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-[#9945FF] border-t-transparent rounded-full mx-auto"></div>
                  <p className="mt-4 text-white/70">Getting AI suggestions...</p>
                </div>
              ) : suggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-white/70 mb-4">
                    Choose a suggestion to fill the layer name field:
                  </p>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md hover:bg-[#9945FF]/10 border border-[#9945FF]/30 hover:border-[#9945FF] rounded-lg transition-colors"
                    >
                      <span className="font-medium text-white">{suggestion}</span>
                    </button>
                  ))}
                  
                  {/* Give 5 more button */}
                  <div className="pt-4 border-t border-[#9945FF]/30 mt-4">
                    <button
                      onClick={handleGetMoreSuggestions}
                      disabled={loadingSuggestions}
                      className="w-full px-4 py-2 bg-[#9945FF] hover:bg-[#14F195] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingSuggestions ? 'Getting more suggestions...' : '💡 Give 5 more'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/70">No suggestions available</p>
                </div>
              )}
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowSuggestions(false)
                    setAllShownSuggestions([]) // Reset ignore list when closing
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors border border-[#9945FF]/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
