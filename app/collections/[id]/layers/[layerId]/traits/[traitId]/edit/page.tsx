'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface Trait {
  id: string
  name: string
  description?: string
  trait_prompt?: string
  rarity_weight: number
  layer_id: string
  layer_name: string
  collection_id: string
  collection_name: string
  created_at: string
  updated_at: string
}

export default function EditTraitPage() {
  const params = useParams()
  const router = useRouter()
  const [trait, setTrait] = useState<Trait | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rarityWeight, setRarityWeight] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (params.traitId) {
      loadTrait()
    }
  }, [params.traitId])

  const loadTrait = async () => {
    try {
      const response = await fetch(`/api/traits/${params.traitId}`)
      if (response.ok) {
        const data = await response.json()
        setTrait(data.trait)
        setName(data.trait.name)
        setDescription(data.trait.description || '')
        setRarityWeight(data.trait.rarity_weight)
      }
    } catch (error) {
      console.error('Error loading trait:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Trait name is required')
      return
    }

    setSaving(true)
    
    try {
      const response = await fetch(`/api/traits/${params.traitId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          rarity_weight: rarityWeight,
        }),
      })

      if (response.ok) {
        router.push(`/collections/${params.id}/layers/${params.layerId}`)
      } else {
        const error = await response.json()
        toast.error('Error updating trait', { description: error.error })
      }
    } catch (error) {
      console.error('Error updating trait:', error)
      toast.error('Failed to update trait')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-white">Loading trait...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!trait) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center py-8">
            <div className="text-white">Trait not found</div>
            <Link href={`/collections/${params.id}/layers/${params.layerId}`} className="text-[#9945FF] hover:text-[#14F195] mt-4 inline-block">
              ← Back to Layer
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link 
            href={`/collections/${params.id}/layers/${params.layerId}`} 
            className="text-[#9945FF] hover:text-[#14F195] mb-4 inline-block"
          >
            ← Back to Layer
          </Link>
          <h1 className="text-3xl font-bold text-white">Edit Trait</h1>
          <p className="text-white/70 mt-2">Editing "{trait.name}" in "{trait.layer_name}" layer</p>
        </div>

        <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Trait Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none"
                placeholder="Enter trait name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white placeholder-white/50 focus:border-[#9945FF] focus:outline-none"
                placeholder="Enter trait description"
                rows={4}
                required
              />
              <p className="text-xs text-[#a8a8b8]/80 mt-1">
                Visual description that will be used in AI image generation. This is what the AI reads to generate the trait.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Rarity Weight
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={rarityWeight}
                  onChange={(e) => setRarityWeight(parseInt(e.target.value) || 1)}
                  className="flex-1 border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white focus:border-[#9945FF] focus:outline-none"
                />
                <select
                  value={rarityWeight}
                  onChange={(e) => setRarityWeight(parseInt(e.target.value))}
                  className="w-40 border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md text-white focus:border-[#9945FF] focus:outline-none"
                >
                  <option value="40" className="bg-[#0f172a]">Common (40)</option>
                  <option value="25" className="bg-[#0f172a]">Rare (25)</option>
                  <option value="15" className="bg-[#0f172a]">Epic (15)</option>
                  <option value="2" className="bg-[#0f172a]">Legendary (2)</option>
                </select>
              </div>
              <p className="text-xs text-[#a8a8b8]/80 mt-1">
                <strong>Higher weight = More common</strong> (appears more often). Lower weight = Rarer (appears less often). 
                The system uses weighted random selection, so Common traits (40) appear much more frequently than Legendary (2).
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#9945FF] text-white px-4 py-2 rounded hover:bg-[#7C3AED] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link
                href={`/collections/${params.id}/layers/${params.layerId}`}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2 rounded shadow-lg shadow-blue-500/20 transition-all duration-200"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

