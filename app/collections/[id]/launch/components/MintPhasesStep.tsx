'use client'

import React from 'react'
import { Phase } from '../types'

// Helper function to convert UTC datetime string to local datetime-local format
function utcToLocalDatetime(utcString: string): string {
  if (!utcString) return ''
  const date = new Date(utcString)
  // Get local time components
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Helper function to convert local datetime-local format to UTC ISO string
function localToUtcIso(localDatetime: string): string {
  if (!localDatetime) return ''
  // Create a date object from the local datetime string
  // This will be interpreted as local time
  const localDate = new Date(localDatetime)
  // Return as ISO string (UTC)
  return localDate.toISOString()
}

interface MintPhasesStepProps {
  phases: Phase[]
  whitelists: Array<{ id: string; name: string; entries_count: number }>
  showNewPhaseForm: boolean
  setShowNewPhaseForm: (show: boolean) => void
  editingPhaseId: string | null
  setEditingPhaseId: (id: string | null) => void
  newPhaseName: string
  setNewPhaseName: (value: string) => void
  newPhasePrice: number
  setNewPhasePrice: (value: number) => void
  newPhaseStartTime: string
  setNewPhaseStartTime: (value: string) => void
  newPhaseEndTime: string
  setNewPhaseEndTime: (value: string) => void
  newPhaseWhitelistOnly: boolean
  setNewPhaseWhitelistOnly: (value: boolean) => void
  newPhaseWhitelistId: string | null
  setNewPhaseWhitelistId: (value: string | null) => void
  newPhaseMaxPerWallet: number | null
  setNewPhaseMaxPerWallet: (value: number | null) => void
  newPhaseAllocation: number | null
  setNewPhaseAllocation: (value: number | null) => void
  onCreatePhase: () => void
  onEditPhase: (phaseId: string) => void
  onDeletePhase: (phaseId: string) => void
  onBack: () => void
  onContinue: () => void
  saving: boolean
}

export function MintPhasesStep({
  phases,
  whitelists,
  showNewPhaseForm,
  setShowNewPhaseForm,
  editingPhaseId,
  setEditingPhaseId,
  newPhaseName,
  setNewPhaseName,
  newPhasePrice,
  setNewPhasePrice,
  newPhaseStartTime,
  setNewPhaseStartTime,
  newPhaseEndTime,
  setNewPhaseEndTime,
  newPhaseWhitelistOnly,
  setNewPhaseWhitelistOnly,
  newPhaseWhitelistId,
  setNewPhaseWhitelistId,
  newPhaseMaxPerWallet,
  setNewPhaseMaxPerWallet,
  newPhaseAllocation,
  setNewPhaseAllocation,
  onCreatePhase,
  onEditPhase,
  onDeletePhase,
  onBack,
  onContinue,
  saving,
}: MintPhasesStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Step 2: Mint Phases</h2>
      
      {!showNewPhaseForm && (
        <button
          onClick={() => {
            setNewPhaseMaxPerWallet(1) // Reset to default value of 1
            setShowNewPhaseForm(true)
          }}
          className="w-full py-3 border-2 border-dashed border-[#4561ad]/30 rounded-xl text-[#4561ad] hover:border-[#4561ad] hover:bg-[#4561ad]/5 transition-colors"
        >
          + Add Mint Phase
        </button>
      )}

      {showNewPhaseForm && (
        <div className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">{editingPhaseId ? 'Edit Mint Phase' : 'New Mint Phase'}</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Phase Name *</label>
              <input
                type="text"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                placeholder="e.g. OG Mint, Whitelist, Public Sale"
                className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Phase Start Time *</label>
                <input
                  type="datetime-local"
                  value={newPhaseStartTime}
                  onChange={(e) => setNewPhaseStartTime(e.target.value)}
                  className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white"
                />
                <p className="text-xs text-white/60 mt-1">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Phase End Time</label>
                <input
                  type="datetime-local"
                  value={newPhaseEndTime}
                  onChange={(e) => setNewPhaseEndTime(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] ${
                    newPhaseEndTime && newPhaseStartTime && 
                    (new Date(newPhaseEndTime).getTime() - new Date(newPhaseStartTime).getTime()) / (1000 * 60 * 60 * 24) > 10
                      ? 'border-[#ff6b35] bg-[#ff6b35]/20 cosmic-card' 
                      : 'border-[#00d4ff]/30 cosmic-card'
                  } text-white`}
                />
                <p className="text-xs text-white/60 mt-1">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</p>
                {newPhaseEndTime && newPhaseStartTime && (() => {
                  const daysDifference = (new Date(newPhaseEndTime).getTime() - new Date(newPhaseStartTime).getTime()) / (1000 * 60 * 60 * 24)
                  if (daysDifference > 10) {
                    return (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        ⚠️ End date cannot be more than 10 days from start date. Please fix the end date.
                      </p>
                    )
                  }
                  return null
                })()}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Mint Price (sats)</label>
                <input
                  type="number"
                  value={newPhasePrice}
                  onChange={(e) => setNewPhasePrice(Math.floor(Number(e.target.value)))}
                  min={0}
                  step={1}
                  placeholder="0"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] ${
                    newPhasePrice > 0 && newPhasePrice <= 545
                      ? 'border-[#ff6b35] bg-[#ff6b35]/20 cosmic-card' 
                      : 'border-[#00d4ff]/30 cosmic-card'
                  } text-white placeholder:text-white/50`}
                />
                {newPhasePrice > 0 && newPhasePrice <= 545 && (
                  <p className="text-xs text-[#ff6b35] mt-1 font-medium">
                    ⚠️ Price must be 0 (free) or at least 546 sats. Please fix the price.
                  </p>
                )}
                {newPhasePrice === 0 && (
                  <p className="text-xs text-white/60 mt-1">Free mint</p>
                )}
                {newPhasePrice >= 546 && (
                  <p className="text-xs text-white/60 mt-1">Paid mint</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Max Per Wallet</label>
                <input
                  type="number"
                  value={newPhaseMaxPerWallet || ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      setNewPhaseMaxPerWallet(null)
                    } else {
                      const numValue = Number(value)
                      // Cap at 10 maximum
                      const cappedValue = Math.min(Math.max(1, numValue), 10)
                      setNewPhaseMaxPerWallet(cappedValue)
                    }
                  }}
                  min={1}
                  max={10}
                  placeholder="Unlimited"
                  className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
                />
                <p className="text-xs text-white/60 mt-1">Maximum: 10 per wallet</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Phase Allocation</label>
                <input
                  type="number"
                  value={newPhaseAllocation || ''}
                  onChange={(e) => setNewPhaseAllocation(e.target.value ? Number(e.target.value) : null)}
                  min={1}
                  placeholder="All remaining"
                  className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white placeholder:text-white/50"
                />
                <p className="text-xs text-white/60 mt-1">Max total mints during phase (blank for all)</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="whitelistOnly"
                  checked={newPhaseWhitelistOnly}
                  onChange={(e) => {
                    setNewPhaseWhitelistOnly(e.target.checked)
                    if (!e.target.checked) {
                      setNewPhaseWhitelistId(null)
                    }
                  }}
                  className="w-4 h-4 text-[#4561ad] rounded"
                />
                <label htmlFor="whitelistOnly" className="text-sm font-medium text-white/70">
                  Whitelist Only
                </label>
              </div>
              
              {newPhaseWhitelistOnly && whitelists.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Assign Whitelist
                  </label>
                  <select
                    value={newPhaseWhitelistId || ''}
                    onChange={(e) => setNewPhaseWhitelistId(e.target.value || null)}
                    className="w-full px-4 py-2 cosmic-card border border-[#00d4ff]/30 rounded-lg focus:ring-2 focus:ring-[#00d4ff] focus:border-[#00d4ff] text-white"
                  >
                    <option value="" className="bg-[#0f172a]">-- No Whitelist Selected --</option>
                    {whitelists.map((wl) => (
                      <option key={wl.id} value={wl.id} className="bg-[#0f172a]">
                        {wl.name} ({wl.entries_count} addresses)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-white/60 mt-1">
                    Select a whitelist to restrict this phase to specific addresses
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#00d4ff]/30">
              <button
                onClick={onCreatePhase}
                disabled={
                  saving || 
                  (newPhaseEndTime && newPhaseStartTime && (new Date(newPhaseEndTime).getTime() - new Date(newPhaseStartTime).getTime()) / (1000 * 60 * 60 * 24) > 10) ||
                  (newPhasePrice > 0 && newPhasePrice <= 545)
                }
                className="px-6 py-2 bg-[#00d4ff] hover:bg-[#00b8e6] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (editingPhaseId ? 'Updating...' : 'Creating...') : (editingPhaseId ? 'Update Phase' : 'Create Phase')}
              </button>
              <button
                onClick={() => {
                  setNewPhaseMaxPerWallet(1) // Reset to default value of 1
                  setShowNewPhaseForm(false)
                  setEditingPhaseId(null)
                }}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold transition-colors border border-[#00d4ff]/30"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {phases.length > 0 && (
        <div className="space-y-4">
          {phases.map((phase) => (
            <div key={phase.id} className="cosmic-card border border-[#00d4ff]/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-white">{phase.phase_name}</h3>
                  <p className="text-sm text-white/70">
                    {new Date(phase.start_time).toLocaleString(undefined, { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric', 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true,
                      timeZoneName: 'short'
                    })} - {phase.end_time ? new Date(phase.end_time).toLocaleString(undefined, { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric', 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true,
                      timeZoneName: 'short'
                    }) : 'No end'}
                  </p>
                  <p className="text-sm text-white/70">{phase.mint_price_sats} sats</p>
                  {phase.whitelist_only && (
                    <p className="text-xs text-[#00d4ff] mt-1">
                      Whitelist Only
                      {phase.whitelist_name && (
                        <span className="ml-2">• {phase.whitelist_name} ({phase.whitelist_entries || 0} addresses)</span>
                      )}
                    </p>
                  )}
                  {!phase.whitelist_only && phase.whitelist_id && (
                    <p className="text-xs text-white/60 mt-1">
                      Whitelist: {phase.whitelist_name || 'Unknown'} ({phase.whitelist_entries || 0} addresses)
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => onEditPhase(phase.id)}
                    className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeletePhase(phase.id)}
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

