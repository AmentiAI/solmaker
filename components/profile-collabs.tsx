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
        <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 text-[#EF4444] rounded-lg">
          {error}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="text-center py-8 text-white/70">
          <p>No collaborations yet.</p>
          <p className="text-sm text-[#a8a8b8]/80 mt-2">
            You'll see collections you're collaborating on here once you accept collaboration invitations.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className={`bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 rounded-lg p-4 ${
                collection.is_active 
                  ? 'border-[#DC1FFF]/50' 
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
                      <span className="px-2 py-1 bg-[#DC1FFF]/20 text-[#DC1FFF] text-xs rounded capitalize border border-[#DC1FFF]/30">
                        {collection.collaborator_role}
                      </span>
                    )}
                    <span className="px-2 py-1 bg-[#00d4ff]/20 text-[#00d4ff] text-xs rounded border border-[#00d4ff]/30">
                      Collaborator
                    </span>
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
                    Joined: {new Date(collection.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Link
                    href={`/collections/${collection.id}`}
                    className="px-3 py-1 text-sm bg-[#00d4ff] hover:bg-[#14F195] text-white rounded font-semibold transition-colors"
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

