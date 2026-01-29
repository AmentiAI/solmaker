'use client'

import React from 'react'
import { Whitelist } from '../types'

interface WhitelistsStepProps {
  whitelists: Whitelist[]
  showNewWhitelistForm: boolean
  setShowNewWhitelistForm: (show: boolean) => void
  editingWhitelistId: string | null
  setEditingWhitelistId: (id: string | null) => void
  newWhitelistName: string
  setNewWhitelistName: (value: string) => void
  newWhitelistDescription: string
  setNewWhitelistDescription: (value: string) => void
  newWhitelistAddresses: string
  setNewWhitelistAddresses: (value: string) => void
  existingWhitelistAddresses: string[]
  onRemoveWhitelistAddress: (address: string) => void
  onCreateWhitelist: () => void
  onEditWhitelist: (whitelistId: string) => void
  onDeleteWhitelist: (whitelistId: string) => void
  onBack: () => void
  onContinue: () => void
  saving: boolean
}

export function WhitelistsStep({
  whitelists,
  showNewWhitelistForm,
  setShowNewWhitelistForm,
  editingWhitelistId,
  setEditingWhitelistId,
  newWhitelistName,
  setNewWhitelistName,
  newWhitelistDescription,
  setNewWhitelistDescription,
  newWhitelistAddresses,
  setNewWhitelistAddresses,
  existingWhitelistAddresses,
  onRemoveWhitelistAddress,
  onCreateWhitelist,
  onEditWhitelist,
  onDeleteWhitelist,
  onBack,
  onContinue,
  saving,
}: WhitelistsStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Step 3: Whitelists</h2>
      
      {!showNewWhitelistForm && (
        <button
          onClick={() => setShowNewWhitelistForm(true)}
          className="w-full py-3 border-2 border-dashed border-[#4561ad]/30 rounded-xl text-[#4561ad] hover:border-[#4561ad] hover:bg-[#4561ad]/5 transition-colors"
        >
          + Create Whitelist
        </button>
      )}

      {showNewWhitelistForm && (
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">{editingWhitelistId ? 'Edit Whitelist' : 'New Whitelist'}</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Whitelist Name *</label>
              <input
                type="text"
                value={newWhitelistName}
                onChange={(e) => setNewWhitelistName(e.target.value)}
                placeholder="e.g. OG Holders, Early Supporters"
                className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
              <textarea
                value={newWhitelistDescription}
                onChange={(e) => setNewWhitelistDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
              />
            </div>
            {editingWhitelistId && existingWhitelistAddresses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Existing Addresses ({existingWhitelistAddresses.length})
                </label>
                <div className="max-h-48 overflow-y-auto border border-[#00d4ff]/30 rounded-lg p-3 cosmic-card">
                  <div className="space-y-2">
                    {existingWhitelistAddresses.map((address, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded border border-[#00d4ff]/30">
                        <code className="text-xs font-mono text-white/70 flex-1 break-all">{address}</code>
                        <button
                          type="button"
                          onClick={() => onRemoveWhitelistAddress(address)}
                          className="ml-3 px-2 py-1 text-xs bg-[#ff6b35]/20 hover:bg-[#ff6b35]/30 text-[#ff6b35] rounded transition-colors border border-[#ff6b35]/30"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                {editingWhitelistId ? 'Add New Addresses (one per line)' : 'Addresses (one per line) *'}
              </label>
              <textarea
                value={newWhitelistAddresses}
                onChange={(e) => setNewWhitelistAddresses(e.target.value)}
                rows={6}
                placeholder={editingWhitelistId ? "Add new addresses (one per line)" : "bc1q...&#10;3..."}
                className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] font-mono text-sm text-white placeholder:text-white/50"
              />
            </div>
            <div className="flex gap-3 pt-4 border-t border-[#00d4ff]/30">
              <button
                onClick={onCreateWhitelist}
                disabled={saving}
                className="px-6 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? (editingWhitelistId ? 'Updating...' : 'Creating...') : (editingWhitelistId ? 'Update Whitelist' : 'Create Whitelist')}
              </button>
              <button
                onClick={() => {
                  setShowNewWhitelistForm(false)
                  setEditingWhitelistId(null)
                }}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#00d4ff]/30"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {whitelists.length > 0 && (
        <div className="space-y-4">
          {whitelists.map((whitelist) => (
            <div key={whitelist.id} className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-white">{whitelist.name}</h3>
                  {whitelist.description && (
                    <p className="text-sm text-white/70 mt-1">{whitelist.description}</p>
                  )}
                  <p className="text-sm text-white/70 mt-1">{whitelist.entries_count} addresses</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => onEditWhitelist(whitelist.id)}
                    className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteWhitelist(whitelist.id)}
                    className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-[#00d4ff]/30">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#00d4ff]/30"
        >
          ← Back
        </button>
        <button
          onClick={onContinue}
          className="px-6 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

