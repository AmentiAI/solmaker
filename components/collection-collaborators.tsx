'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'

interface Collaborator {
  id: string
  collection_id: string
  wallet_address: string
  role: 'owner' | 'editor' | 'viewer'
  invited_by: string
  status?: string
  created_at: string
}

interface CollaboratorWithUsername extends Collaborator {
  username?: string
}

interface CollectionCollaboratorsProps {
  collectionId: string
  collectionOwner: string
  currentUserRole?: 'owner' | 'editor' | 'viewer'
}

export function CollectionCollaborators({ 
  collectionId, 
  collectionOwner,
  currentUserRole = 'owner'
}: CollectionCollaboratorsProps) {
  const { currentAddress } = useWallet()
  const [collaborators, setCollaborators] = useState<CollaboratorWithUsername[]>([])
  const [loading, setLoading] = useState(true)
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null)
  const [inviteInput, setInviteInput] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inputType, setInputType] = useState<'auto' | 'username' | 'wallet'>('auto')

  const canInvite = currentUserRole === 'owner' || currentUserRole === 'editor'
  const isOwner = currentUserRole === 'owner'

  useEffect(() => {
    loadCollaborators()
  }, [collectionId])

  const loadCollaborators = async () => {
    try {
      const response = await fetch(`/api/collections/${collectionId}/collaborators`)
      if (response.ok) {
        const data = await response.json()
        const collabs = (data.collaborators || []).filter((c: Collaborator) => 
          !c.status || c.status === 'accepted'
        )
        
        // Fetch usernames for all collaborators
        const collabsWithUsernames = await Promise.all(
          collabs.map(async (collab: Collaborator) => {
            try {
              const profileResponse = await fetch(`/api/profile?wallet_address=${encodeURIComponent(collab.wallet_address)}`)
              if (profileResponse.ok) {
                const profileData = await profileResponse.json()
                return { ...collab, username: profileData.profile?.username || null }
              }
            } catch (error) {
              console.error(`Error fetching profile for ${collab.wallet_address}:`, error)
            }
            return { ...collab, username: null }
          })
        )
        
        setCollaborators(collabsWithUsernames)
        
        // Fetch owner username
        try {
          const ownerProfileResponse = await fetch(`/api/profile?wallet_address=${encodeURIComponent(collectionOwner)}`)
          if (ownerProfileResponse.ok) {
            const ownerProfileData = await ownerProfileResponse.json()
            setOwnerUsername(ownerProfileData.profile?.username || null)
          }
        } catch (error) {
          console.error('Error fetching owner profile:', error)
        }
      }
    } catch (error) {
      console.error('Error loading collaborators:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteInput.trim()) {
      alert('Please enter a username or wallet address')
      return
    }

    if (!currentAddress) {
      alert('Please connect your wallet')
      return
    }

    setInviting(true)
    try {
      // Determine if input is a wallet address (starts with 'bc1' or '1' or '3' and is longer) or username
      const trimmedInput = inviteInput.trim()
      const isWalletAddress = inputType === 'wallet' ||
                             trimmedInput.startsWith('bc1') || 
                             (trimmedInput.startsWith('1') && trimmedInput.length > 25) ||
                             (trimmedInput.startsWith('3') && trimmedInput.length > 25)
      
      const requestBody: any = {
        role: inviteRole,
        invited_by: currentAddress,
      }

      if (isWalletAddress) {
        requestBody.wallet_address = trimmedInput
      } else {
        requestBody.username = trimmedInput
      }

      const response = await fetch(`/api/collections/${collectionId}/collaborators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        setCollaborators([...collaborators, data.collaborator])
        setInviteInput('')
        setShowInviteForm(false)
        // Dispatch event to update notification badge for the invited user
        window.dispatchEvent(new CustomEvent('invitationUpdated'))
        alert('Collaborator invited successfully!')
      } else {
        const error = await response.json()
        alert(`Error: ${error.error || 'Failed to invite collaborator'}`)
      }
    } catch (error) {
      console.error('Error inviting collaborator:', error)
      alert('Failed to invite collaborator')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (collaboratorId: string, walletAddress: string) => {
    if (!confirm(`Remove collaborator ${walletAddress.substring(0, 8)}...?`)) {
      return
    }

    if (!currentAddress) {
      alert('Please connect your wallet')
      return
    }

    try {
      const response = await fetch(
        `/api/collections/${collectionId}/collaborators?collaborator_id=${collaboratorId}&requester_wallet=${encodeURIComponent(currentAddress)}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        setCollaborators(collaborators.filter(c => c.id !== collaboratorId))
        alert('Collaborator removed successfully')
      } else {
        const error = await response.json()
        alert(`Error: ${error.error || 'Failed to remove collaborator'}`)
      }
    } catch (error) {
      console.error('Error removing collaborator:', error)
      alert('Failed to remove collaborator')
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-900">
        Loading collaborators...
      </div>
    )
  }

  return (
    <div className="border border-gray-200 bg-[#FDFCFA] rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Collaborators</h3>
        {canInvite && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            {showInviteForm ? 'Cancel' : '+ Invite'}
          </button>
        )}
      </div>

      {showInviteForm && canInvite && (
        <div className="mb-4 p-3 bg-black rounded border border-gray-800">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Username or Wallet Address
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setInputType('auto')}
                  className={`px-2 py-1 text-xs rounded ${inputType === 'auto' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-white'}`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setInputType('username')}
                  className={`px-2 py-1 text-xs rounded ${inputType === 'username' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-white'}`}
                >
                  Username
                </button>
                <button
                  type="button"
                  onClick={() => setInputType('wallet')}
                  className={`px-2 py-1 text-xs rounded ${inputType === 'wallet' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-white'}`}
                >
                  Wallet
                </button>
              </div>
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder={inputType === 'username' ? 'Enter username' : inputType === 'wallet' ? 'Enter wallet address' : 'Enter username or wallet address'}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-xs text-white mt-1">
                {inputType === 'auto' && 'We\'ll automatically detect if it\'s a username or wallet address'}
                {inputType === 'username' && 'Enter the user\'s username (they must have created a profile)'}
                {inputType === 'wallet' && 'Enter the user\'s Bitcoin wallet address'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                className="w-full border border-gray-300 rounded px-3 py-2 bg-[#FDFCFA] text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="editor">Editor (can edit and generate)</option>
                <option value="viewer">Viewer (read-only)</option>
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteInput.trim()}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? 'Inviting...' : 'Send Invitation'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Owner */}
        <div className="flex items-center justify-between p-2 bg-black rounded border border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-purple-700">👑</span>
            <div>
              <div className="text-sm font-medium text-white">
                {ownerUsername ? `@${ownerUsername}` : `${collectionOwner.substring(0, 8)}...${collectionOwner.substring(collectionOwner.length - 6)}`}
              </div>
              <div className="text-xs text-gray-900">Owner</div>
            </div>
          </div>
        </div>

        {/* Collaborators */}
        {collaborators.map((collaborator) => (
          <div
            key={collaborator.id}
            className="flex items-center justify-between p-2 bg-gray-900 rounded border border-gray-700"
          >
            <div className="flex items-center gap-2">
              <span className="text-blue-700">
                {collaborator.role === 'editor' ? '✏️' : '👁️'}
              </span>
              <div>
                <div className="text-sm font-medium text-white">
                  {collaborator.username ? `@${collaborator.username}` : `${collaborator.wallet_address.substring(0, 8)}...${collaborator.wallet_address.substring(collaborator.wallet_address.length - 6)}`}
                </div>
                <div className="text-xs text-gray-900 capitalize">
                  {collaborator.role} • Invited {new Date(collaborator.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            {(isOwner || (currentAddress === collaborator.wallet_address)) && (
              <button
                onClick={() => handleRemove(collaborator.id, collaborator.wallet_address)}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {collaborators.length === 0 && (
          <div className="text-center py-4 text-gray-900 text-sm">
            No collaborators yet. Invite someone to help create this collection!
          </div>
        )}
      </div>
    </div>
  )
}

