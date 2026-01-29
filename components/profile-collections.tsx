'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useProfile } from '@/lib/profile/useProfile'

interface Collection {
  id: string
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
  generation_mode?: string
  art_style?: string
  border_requirements?: string
}

export function ProfileCollections() {
  const { profile } = useProfile()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.username) {
      loadCollections()
    } else {
      setLoading(false)
    }
  }, [profile?.username])

  const loadCollections = async () => {
    if (!profile?.username) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/profile/${profile.username}/collections`)
      if (response.ok) {
        const data = await response.json()
        // Filter to show only owned collections (is_owner === true)
        const ownedCollections = (data.owned_collections || data.collections || []).filter(
          (col: any) => col.is_owner !== false
        )
        setCollections(ownedCollections)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load collections')
      }
    } catch (err) {
      console.error('Error loading collections:', err)
      setError('Failed to load collections')
    } finally {
      setLoading(false)
    }
  }

  if (!profile?.username) {
    return null
  }

  if (loading) {
    return (
      <div>
        <h3 className="text-xl font-bold text-white mb-4">My Collections</h3>
        <p className="text-white/70">Loading collections...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">My Collections</h3>
        <Link
          href="/collections/create"
          className="px-4 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-[#00d4ff]/20"
        >
          Create Collection
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 cosmic-card border border-[#ff4757]/50 text-[#ff4757] rounded-lg">
          {error}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="text-center py-8 text-white/70">
          <p>No collections yet.</p>
          <Link
            href="/collections/create"
            className="text-[#00d4ff] hover:text-[#00b8e6] mt-2 inline-block"
          >
            Create your first collection →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`cosmic-card border-2 rounded-lg p-4 ${
                collection.is_active 
                  ? 'border-[#00d4ff]/50' 
                  : 'border-[#00d4ff]/30'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-lg text-white">{collection.name}</h4>
                    {collection.is_active && (
                      <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] text-xs rounded font-semibold border border-[#00d4ff]/30">
                        Active
                      </span>
                    )}
                    {collection.generation_mode && (
                      <span className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] text-xs rounded border border-[#ff6b35]/30">
                        {collection.generation_mode === 'prompt' ? 'Prompt' : 'Trait'}
                      </span>
                    )}
                  </div>
                  {collection.description && (
                    <p className="text-white/70 text-sm mb-2">{collection.description}</p>
                  )}
                  <p className="text-xs text-white/60">
                    Created: {new Date(collection.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Link
                    href={`/collections/${collection.id}`}
                    className="px-3 py-1 text-sm bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded font-semibold transition-colors"
                  >
                    View
                  </Link>
                  <Link
                    href={`/collections/${collection.id}/edit`}
                    className="px-3 py-1 text-sm bg-[#ff6b35] hover:bg-[#ff5722] text-white rounded font-semibold transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

 
