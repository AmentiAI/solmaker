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
  collaborator_role?: string
  wallet_address?: string
}

export function ProfileCollabs() {
  const { profile } = useProfile()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.username) {
      loadCollabs()
    } else {
      setLoading(false)
    }
  }, [profile?.username])

  const loadCollabs = async () => {
    if (!profile?.username) return

    setLoading(true)
    setError(null)

    try {
      // Always attempt to fetch, even if empty
      const response = await fetch(`/api/profile/${profile.username}/collections`)
      if (response.ok) {
        const data = await response.json()
        // Get collaborator collections (is_owner === false)
        const collabCollections = data.collaborator_collections || 
          (data.collections || []).filter((col: any) => col.is_owner === false)
        setCollections(collabCollections)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load collaborations')
      }
    } catch (err) {
      console.error('Error loading collaborations:', err)
      setError('Failed to load collaborations')
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
        <h3 className="text-xl font-bold text-white mb-4">My Collaborations</h3>
        <p className="text-white/70">Loading collaborations...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">My Collaborations</h3>
      </div>

      {error && (
        <div className="mb-4 p-3 cosmic-card border border-[#ff4757]/50 text-[#ff4757] rounded-lg">
          {error}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="text-center py-8 text-white/70">
          <p>No collaborations yet.</p>
          <p className="text-sm text-white/60 mt-2">
            You'll see collections you're collaborating on here once you accept collaboration invitations.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`cosmic-card border-2 rounded-lg p-4 ${
                collection.is_active 
                  ? 'border-[#ff6b35]/50' 
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
                    {collection.collaborator_role && (
                      <span className="px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] text-xs rounded capitalize border border-[#ff6b35]/30">
                        {collection.collaborator_role}
                      </span>
                    )}
                    <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] text-xs rounded border border-[#00d4ff]/30">
                      Collaborator
                    </span>
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
                    Joined: {new Date(collection.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Link
                    href={`/collections/${collection.id}`}
                    className="px-3 py-1 text-sm bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded font-semibold transition-colors"
                  >
                    View
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

