'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import Link from 'next/link'

interface Invitation {
  id: string
  collection_id: string
  collection_name: string
  collection_description?: string
  role: string
  invited_by: string
  inviter_username?: string
  status: string
  created_at: string
}
 
export function CollaborationInvitations() {
  const { currentAddress } = useWallet()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    if (currentAddress) {
      loadInvitations()
    } else {
      setLoading(false)
    }
  }, [currentAddress])

  const loadInvitations = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/collaborations/invitations?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setInvitations(data.invitations || [])
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to load invitations')
      }
    } catch (err) {
      console.error('Error loading invitations:', err)
      setError('Failed to load invitations')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (invitationId: string) => {
    if (!currentAddress) return

    setProcessing(invitationId)
    setError(null)

    try {
      const response = await fetch('/api/collaborations/invitations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitation_id: invitationId,
          action: 'accept',
          wallet_address: currentAddress,
        }),
      })

      if (response.ok) {
        // Remove accepted invitation from list
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
        // Dispatch event to update notification badge
        window.dispatchEvent(new CustomEvent('invitationUpdated'))
        // Optionally reload to show the collection
        window.location.reload()
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to accept invitation')
      }
    } catch (err) {
      console.error('Error accepting invitation:', err)
      setError('Failed to accept invitation')
    } finally {
      setProcessing(null)
    }
  }

  const handleDecline = async (invitationId: string) => {
    if (!currentAddress) return

    setProcessing(invitationId)
    setError(null)

    try {
      const response = await fetch('/api/collaborations/invitations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitation_id: invitationId,
          action: 'decline',
          wallet_address: currentAddress,
        }),
      })

      if (response.ok) {
        // Remove declined invitation from list
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
        // Dispatch event to update notification badge
        window.dispatchEvent(new CustomEvent('invitationUpdated'))
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to decline invitation')
      }
    } catch (err) {
      console.error('Error declining invitation:', err)
      setError('Failed to decline invitation')
    } finally {
      setProcessing(null)
    }
  }

  if (!currentAddress) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/30 rounded-xl p-6 shadow-lg">
        <h3 className="text-xl font-bold text-white mb-4">Collaboration Invitations</h3>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#DC1FFF] border-t-transparent"></div>
          <p className="text-white/70">Loading invitations...</p>
        </div>
      </div>
    )
  }

  if (invitations.length === 0) {
    return null // Don't show section if no invitations
  }

  return (
    <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/30 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Collaboration Invitations</h3>
        <span className="px-3 py-1 bg-[#DC1FFF]/20 text-[#DC1FFF] text-sm font-semibold rounded-full border border-[#DC1FFF]/30">
          {invitations.length} pending
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#EF4444]/50 text-[#EF4444] rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 border-[#DC1FFF]/30 rounded-xl p-4"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h4 className="font-semibold text-lg text-white mb-1">
                  {invitation.collection_name}
                </h4>
                {invitation.collection_description && (
                  <p className="text-white/70 text-sm mb-2">{invitation.collection_description}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-[#a8a8b8]/80">
                  <span>
                    Invited by: <strong className="text-[#a8a8b8]">{invitation.inviter_username || invitation.invited_by.substring(0, 10) + '...'}</strong>
                  </span>
                  <span>
                    Role: <strong className="capitalize text-[#a8a8b8]">{invitation.role}</strong>
                  </span>
                  <span>
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleAccept(invitation.id)}
                disabled={processing === invitation.id}
                className="px-4 py-2 bg-[#00d4ff] hover:bg-[#14F195] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing === invitation.id ? 'Processing...' : 'Accept'}
              </button>
              <button
                onClick={() => handleDecline(invitation.id)}
                disabled={processing === invitation.id}
                className="px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 text-white/70 hover:text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing === invitation.id ? 'Processing...' : 'Decline'}
              </button>
              <Link
                href={`/collections/${invitation.collection_id}`}
                className="px-4 py-2 bg-[#DC1FFF] hover:bg-[#9945FF] text-white rounded-lg font-semibold transition-colors"
              >
                View Collection
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

