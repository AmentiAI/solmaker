'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useWallet } from '@/lib/wallet/compatibility'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useRouter } from 'next/navigation'

interface Layer {
  id: string
  name: string
  display_order: number
  trait_count: number
}

interface LayersSectionProps {
  collectionId: string
  layers: Layer[]
  onLayerDeleted?: () => void
}

export function LayersSection({ collectionId, layers, onLayerDeleted }: LayersSectionProps) {
  const { currentAddress } = useWallet()
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ layerId: string; layerName: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [generatingLazy, setGeneratingLazy] = useState(false)

  const handleDeleteClick = (layerId: string, layerName: string) => {
    setShowDeleteConfirm({ layerId, layerName })
  }

  const handleDeleteConfirm = async () => {
    if (!showDeleteConfirm || !currentAddress) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/layers/${showDeleteConfirm.layerId}?wallet_address=${encodeURIComponent(currentAddress)}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        if (onLayerDeleted) {
          onLayerDeleted()
        } else {
          // Fallback: reload the page
          window.location.reload()
        }
      } else {
        const error = await response.json()
        toast.error('Error deleting layer', { description: error.error || 'Unknown error' })
      }
    } catch (error) {
      console.error('Error deleting layer:', error)
      toast.error('Failed to delete layer. Please try again.')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(null)
  }

  const handleLazyMode = async () => {
    if (!currentAddress) {
      toast.error('Please connect your wallet first')
      return
    }

    setGeneratingLazy(true)
    try {
      const response = await fetch(`/api/collections/${collectionId}/lazy-layers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: currentAddress,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(`Successfully created ${data.layersCreated} layers with ${data.totalTraits} traits!`)
        // Reload the page to show new layers
        router.refresh()
        if (onLayerDeleted) {
          onLayerDeleted()
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to generate layers and traits')
      }
    } catch (error) {
      console.error('Error generating lazy layers:', error)
      toast.error('Failed to generate layers and traits. Please try again.')
    } finally {
      setGeneratingLazy(false)
    }
  }
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 pt-8">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Layers</h2>
        <Link
          href={`/collections/${collectionId}/layers/create`}
          className="bg-[#00d4ff] hover:bg-[#14F195] text-black px-3 sm:px-4 py-2 text-sm rounded text-center sm:text-left shadow-lg shadow-[#00d4ff]/20 transition-all duration-200 font-bold drop-shadow-lg"
        >
          Add Layer
        </Link>
      </div>

      <div className="border border-[#00d4ff]/30 rounded-lg overflow-hidden bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md">
        <table className="w-full">
          <thead className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-b border-[#00d4ff]/30">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-white">Layer Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-white">Traits</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-white">Order</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#00d4ff]/20">
            {layers.map((layer) => (
              <tr key={layer.id} className="hover:bg-[#00d4ff]/10 transition-colors">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteClick(layer.id, layer.name)}
                      className="p-1.5 bg-[#EF4444] hover:bg-[#ff3838] text-white rounded transition-colors flex items-center justify-center flex-shrink-0"
                      title="Delete layer and all its traits"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-white">{layer.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-[#a8a8b8]">{layer.trait_count} traits</td>
                <td className="px-4 py-2 text-sm text-[#a8a8b8]">{layer.display_order}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/collections/${collectionId}/layers/${layer.id}`}
                      className="px-3 py-1 text-xs bg-[#00d4ff] hover:bg-[#14F195] text-black rounded shadow-lg shadow-[#00d4ff]/20 transition-all duration-200 font-bold drop-shadow-md"
                    >
                      Traits
                    </Link>
                    <Link
                      href={`/collections/${collectionId}/layers/${layer.id}/edit`}
                      className="px-3 py-1 text-xs bg-[#DC1FFF] text-white rounded hover:bg-[#9945FF] transition-colors flex items-center gap-1 shadow-lg shadow-[#DC1FFF]/20"
                      title="Edit layer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {layers.length === 0 && (
        <div className="border border-[#00d4ff]/30 rounded-lg overflow-hidden bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md p-8">
          <div className="text-center">
            <p className="text-[#a8a8b8] mb-4">No layers created yet. Add your first layer to get started!</p>
            <button
              onClick={handleLazyMode}
              disabled={generatingLazy || !currentAddress}
              className="px-6 py-3 bg-gradient-to-r from-[#00d4ff] to-[#14F195] hover:from-[#14F195] hover:to-[#00a3cc] text-black font-bold rounded-lg shadow-lg shadow-[#00d4ff]/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
            >
              {generatingLazy ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Generating Layers & Traits...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Use Lazy Mode - Auto-Generate Layers & Traits
                </>
              )}
            </button>
            <p className="text-[#a8a8b8]/80 text-sm mt-3">
              This will create 6 standard layers (Background, Character Skin, Eyes, Mouth, Outfit, Headwear) with 8 AI-generated traits each
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!showDeleteConfirm}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Layer"
        message={showDeleteConfirm ? `Are you sure you want to delete "${showDeleteConfirm.layerName}"? This will also delete all ${layers.find(l => l.id === showDeleteConfirm.layerId)?.trait_count || 0} trait${layers.find(l => l.id === showDeleteConfirm.layerId)?.trait_count !== 1 ? 's' : ''} in this layer.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        loading={deleting}
      />
    </>
  )
}

