'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/lib/wallet/compatibility'
import { isAdmin } from '@/lib/auth/access-control'
import { WalletConnect } from '@/components/wallet-connect'
import { AdminSidebar } from '@/components/admin-sidebar'
import { POSITION_PRESETS } from '@/app/components/WireframeEditor'

interface PresetPreview {
  id: string
  preset_id: string
  image_url: string
  prompt: string
  created_at: string
  updated_at: string
}

export default function AdminPresetPreviewsPage() {
  const { isConnected, currentAddress } = useWallet()
  const [loading, setLoading] = useState(true)
  const [previews, setPreviews] = useState<PresetPreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const authorized = isAdmin(currentAddress || null)

  useEffect(() => {
    if (isConnected && authorized) {
      loadPreviews()
    }
  }, [isConnected, authorized, currentAddress])

  const loadPreviews = async () => {
    if (!currentAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/preset-previews?wallet_address=${encodeURIComponent(currentAddress)}`
      )

      if (!response.ok) {
        if (response.status === 403) {
          setError('Unauthorized. Admin access only.')
        } else {
          const errorData = await response.json()
          setError(errorData.error || 'Failed to load preset previews')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setPreviews(data.previews || [])
    } catch (err) {
      console.error('Error loading preset previews:', err)
      setError('Failed to load preset previews')
    } finally {
      setLoading(false)
    }
  }

  const handleEditPrompt = (preview: PresetPreview) => {
    setEditingId(preview.preset_id)
    setEditPrompt(preview.prompt)
  }

  const handleSavePrompt = async (presetId: string) => {
    if (!currentAddress) return

    setSaving(true)
    try {
      const response = await fetch(
        `/api/admin/preset-previews?wallet_address=${encodeURIComponent(currentAddress)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preset_id: presetId,
            prompt: editPrompt,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error updating prompt: ${errorData.error || 'Unknown error'}`)
        return
      }

      await loadPreviews()
      setEditingId(null)
      setEditPrompt('')
    } catch (error) {
      console.error('Error saving prompt:', error)
      alert('Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async (preview: PresetPreview) => {
    if (!currentAddress) return
    if (!confirm(`Are you sure you want to regenerate the image for "${preview.preset_id}"? This will replace the existing blob URL.`)) {
      return
    }

    setRegeneratingId(preview.preset_id)
    try {
      const response = await fetch(
        `/api/admin/preset-previews/regenerate?wallet_address=${encodeURIComponent(currentAddress)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preset_id: preview.preset_id,
            prompt: preview.prompt, // Use existing prompt
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        alert(`Error regenerating image: ${errorData.error || 'Unknown error'}`)
        return
      }

      await loadPreviews()
      alert('Image regenerated successfully!')
    } catch (error) {
      console.error('Error regenerating image:', error)
      alert('Failed to regenerate image')
    } finally {
      setRegeneratingId(null)
    }
  }

  const getPresetName = (presetId: string) => {
    const preset = POSITION_PRESETS.find(p => p.id === presetId)
    return preset ? preset.name : presetId
  }

  if (!isConnected) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <AdminSidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <WalletConnect />
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen bg-slate-900">
        <AdminSidebar />
        <div className="flex-1 ml-64 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
              <h2 className="text-2xl font-bold text-red-200 mb-2">Access Denied</h2>
              <p className="text-red-300">You do not have admin access to this page.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-900">
      <AdminSidebar />

      <div className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent mb-2">
              Preset Preview Management
            </h1>
            <p className="text-gray-400 text-lg">Manage positioning preset preview images and prompts</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-200">
              {error}
            </div>
          )}

          <div className="mb-6 flex gap-4">
            <button
              onClick={loadPreviews}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              <p className="text-gray-400 mt-4">Loading preset previews...</p>
            </div>
          ) : previews.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">No preset previews found</p>
              <p className="text-sm mt-2">Preview images will be created when generated in the Wireframe Editor</p>
            </div>
          ) : (
            <div className="space-y-6">
              {previews.map((preview) => (
                <div
                  key={preview.id}
                  className="bg-slate-800/50 border border-gray-800 rounded-xl p-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Preview Image */}
                    <div className="lg:col-span-1">
                      <h3 className="text-white font-semibold mb-3">
                        {getPresetName(preview.preset_id)}
                      </h3>
                      <div className="aspect-square bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                        <img
                          src={preview.image_url}
                          alt={preview.preset_id}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="mt-3 text-xs text-gray-400 space-y-1">
                        <div>Preset ID: <span className="font-mono">{preview.preset_id}</span></div>
                        <div>Created: {new Date(preview.created_at).toLocaleString()}</div>
                        <div>Updated: {new Date(preview.updated_at).toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Prompt Editor */}
                    <div className="lg:col-span-2">
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Generation Prompt
                        </label>
                        {editingId === preview.preset_id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              rows={8}
                              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none font-mono text-sm"
                              placeholder="Enter prompt for generating preview image..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSavePrompt(preview.preset_id)}
                                disabled={saving || !editPrompt.trim()}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
                              >
                                {saving ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    <span>Saving...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Save Prompt</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null)
                                  setEditPrompt('')
                                }}
                                disabled={saving}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm whitespace-pre-wrap break-words">
                              {preview.prompt}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditPrompt(preview)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Edit Prompt</span>
                              </button>
                              <button
                                onClick={() => handleRegenerate(preview)}
                                disabled={regeneratingId === preview.preset_id}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
                              >
                                {regeneratingId === preview.preset_id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    <span>Regenerating...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Regenerate Image</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Image URL */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Image URL
                        </label>
                        <div className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg">
                          <a
                            href={preview.image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 font-mono text-xs break-all hover:underline"
                          >
                            {preview.image_url}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

