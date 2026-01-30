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
          className="px-4 py-2 bg-[#00d4ff] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-[#00d4ff]/20"
        >
          Create Collection
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 text-[#EF4444] rounded-lg">
          {error}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="text-center py-8 text-white/70">
          <p>No collections yet.</p>
          <Link
            href="/collections/create"
            className="text-[#00d4ff] hover:text-[#14F195] mt-2 inline-block"
          >
            Create your first collection →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 rounded-lg p-4 ${
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
                      <span className="px-2 py-1 bg-[#DC1FFF]/20 text-[#DC1FFF] text-xs rounded border border-[#DC1FFF]/30">
                        {collection.generation_mode === 'prompt' ? 'Prompt' : 'Trait'}
                      </span>
                    )}
                  </div>
                  {collection.description && (
                    <p className="text-white/70 text-sm mb-2">{collection.description}</p>
                  )}
                  <p className="text-xs text-[#a8a8b8]/80">
                    Created: {new Date(collection.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Link
                    href={`/collections/${collection.id}`}
                    className="px-3 py-1 text-sm bg-[#00d4ff] hover:bg-[#14F195] text-white rounded font-semibold transition-colors"
                  >
                    View
                  </Link>
                  <Link
                    href={`/collections/${collection.id}/edit`}
                    className="px-3 py-1 text-sm bg-[#DC1FFF] hover:bg-[#9945FF] text-white rounded font-semibold transition-colors"
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

 
