'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

interface Layer {
  id: string
  name: string
  display_order: number
  created_at: string
  updated_at: string
  collection_id: string
  collection_name: string
}

export default function EditLayerPage() {
  const params = useParams()
  const router = useRouter()
  const [layer, setLayer] = useState<Layer | null>(null)
  const [name, setName] = useState('')
  const [displayOrder, setDisplayOrder] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (params.layerId) {
      loadLayer()
    }
  }, [params.layerId])

  const loadLayer = async () => {
    try {
      const response = await fetch(`/api/layers/${params.layerId}`)
      if (response.ok) {
        const data = await response.json()
        setLayer(data.layer)
        setName(data.layer.name)
        setDisplayOrder(data.layer.display_order)
      }
    } catch (error) {
      console.error('Error loading layer:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Layer name is required')
      return
    }

    setSaving(true)
    
    try {
      const response = await fetch(`/api/layers/${params.layerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          display_order: displayOrder,
        }),
      })

      if (response.ok) {
        router.push(`/collections/${params.id}/layers/${params.layerId}`)
      } else {
        const error = await response.json()
        toast.error('Error updating layer', { description: error.error })
      }
    } catch (error) {
      console.error('Error updating layer:', error)
      toast.error('Failed to update layer')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this layer? This will also delete all traits in this layer.')) {
      try {
        const response = await fetch(`/api/layers/${params.layerId}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          router.push(`/collections/${params.id}`)
        }
      } catch (error) {
        console.error('Error deleting layer:', error)
        toast.error('Failed to delete layer')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a]">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center py-8">
              <div className="text-white/70">Loading layer...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!layer) {
    return (
      <div className="min-h-screen bg-[#0f172a]">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center py-8">
              <div className="text-white/70">Layer not found</div>
              <Link href={`/collections/${params.id}`} className="text-[#9945FF] hover:text-[#14F195] mt-4 inline-block">
                ← Back to Collection
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Link 
              href={`/collections/${params.id}/layers/${params.layerId}`} 
              className="text-[#9945FF] hover:text-[#14F195] mb-4 inline-block"
            >
              ← Back to Layer
            </Link>
            <h1 className="text-3xl font-bold text-white">Edit Layer</h1>
            <p className="text-white/70 mt-2">Update "{layer.name}" layer settings</p>
          </div>

          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#a8a8b8] mb-2">
                  Layer Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-white/5 text-white placeholder-white/40 focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                  placeholder="Enter layer name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a8a8b8] mb-2">
                  Display Order
                </label>
                <input
                  type="number"
                  min="1"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 1)}
                  className="w-full border border-[#9945FF]/30 rounded px-3 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md bg-white/5 text-white focus:border-[#9945FF] focus:outline-none focus:ring-2 focus:ring-[#9945FF]/20"
                />
                <p className="text-xs text-[#a8a8b8]/80 mt-1">
                  Lower numbers appear first in the layer stack
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#9945FF]/30">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-cosmic text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <Link
                  href={`/collections/${params.id}/layers/${params.layerId}`}
                  className="bg-white/10 hover:bg-white/20 text-[#a8a8b8] px-4 py-2 rounded-lg border border-[#9945FF]/30 transition-all duration-200"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg ml-auto transition-colors"
                >
                  Delete Layer
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
