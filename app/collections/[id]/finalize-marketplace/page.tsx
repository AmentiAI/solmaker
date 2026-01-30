'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { addAuthToBody } from '@/lib/wallet/api-auth'

interface Collection {
  id: string
  name: string
  collection_status?: string
}

export default function FinalizeMarketplacePage() {
  const params = useParams()
  const router = useRouter()
  const { currentAddress, signMessage } = useWallet()
  const collectionId = params.id as string

  const [collection, setCollection] = useState<Collection | null>(null)
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)

  useEffect(() => {
    if (currentAddress) {
      loadCollection()
    } else {
      // Wait a bit for wallet to connect
      const timer = setTimeout(() => {
        if (!currentAddress) {
          setLoading(false)
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [collectionId, currentAddress])

  const loadCollection = async () => {
    if (!currentAddress) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/collections/${collectionId}/full?wallet_address=${encodeURIComponent(currentAddress)}`)
      if (response.ok) {
        const data = await response.json()
        setCollection(data.collection)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to load collection:', errorData)
        toast.error('Failed to load collection', { description: errorData.error || 'Unknown error' })
        router.push('/collections')
      }
    } catch (error) {
      console.error('Error loading collection:', error)
      toast.error('Failed to load collection')
      router.push('/collections')
    } finally {
      setLoading(false)
    }
  }

  const handleFinalize = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setFinalizing(true)
    try {
      // Add signature authentication
      const body = await addAuthToBody({
        wallet_address: currentAddress,
        collection_status: 'marketplace',
      }, currentAddress, signMessage)

      const response = await fetch(`/api/launchpad/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        // Redirect to list marketplace page
        router.push(`/collections/${collectionId}/list-marketplace`)
      } else {
        const err = await response.json()
        toast.error('Error', { description: err.error || err.details || 'Failed to finalize status' })
      }
    } catch (error) {
      console.error('Error finalizing status:', error)
      toast.error('Failed to finalize status')
    } finally {
      setFinalizing(false)
    }
  }

  const handleCancel = () => {
    router.push('/marketplace')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFCFA] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-[#FDFCFA] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#a8a8b8]/80 mb-4">Collection not found</p>
          <button
            onClick={() => router.push('/collections')}
            className="px-4 py-2 bg-[#4561ad] hover:bg-[#3a5294] text-white rounded-lg font-semibold transition-colors"
          >
            Go to Collections
          </button>
        </div>
      </div>
    )
  }

  // If already finalized, redirect to list marketplace page
  if (collection.collection_status === 'marketplace') {
    router.push(`/collections/${collectionId}/list-marketplace`)
    return null
  }

  // Only show confirmation dialog if collection is draft
  const isDraft = !collection.collection_status || collection.collection_status === 'draft'
  
  if (!isDraft) {
    // If not draft, automatically finalize and redirect
    if (currentAddress && !finalizing) {
      handleFinalize()
      return (
        <div className="min-h-screen bg-[#FDFCFA] flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#4561ad] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Updating collection status...</p>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="bg-[#FDFCFA]">
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Change Collection Status to Marketplace?</h2>
            <p className="text-gray-600 mb-6">
              This collection is currently in <strong>{collection.collection_status || 'draft'}</strong> status. 
              To access the marketplace, you need to change the status to <strong>Marketplace</strong>.
            </p>
            <p className="text-[#a8a8b8]/80 text-sm mb-6">
              This will make your collection available for marketplace listing. You can still edit all settings after this change.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Collection:</strong> {collection.name}
              </p>
              <p className="text-sm text-blue-800 mt-1">
                <strong>Current Status:</strong> {collection.collection_status || 'Draft'}
              </p>
              <p className="text-sm text-blue-800 mt-1">
                <strong>New Status:</strong> Marketplace
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleCancel}
                disabled={finalizing}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing || !currentAddress}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {finalizing ? 'Updating...' : 'Yes, Change to Marketplace'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

