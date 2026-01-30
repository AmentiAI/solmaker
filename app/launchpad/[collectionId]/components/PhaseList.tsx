'use client'

import { Phase, Collection, WhitelistStatus } from './types'

interface PhaseListProps {
  collection: Collection
  activePhase: Phase | null
  isConnected: boolean
  currentAddress?: string
  whitelistStatuses: Record<string, WhitelistStatus>
  checkingWhitelistPhaseId: string | null
  countdown: { [key: string]: string }
  onCheckWhitelist: (phaseId: string) => void
  getPhaseStatus: (phase: Phase) => { status: string; label: string; color: string }
  formatSats: (sats: number) => string
  formatTimeUntil: (date: string) => string
  formatDateTime: (date: string) => string
}

export function PhaseList({
  collection,
  activePhase,
  isConnected,
  currentAddress,
  whitelistStatuses,
  checkingWhitelistPhaseId,
  countdown,
  onCheckWhitelist,
  getPhaseStatus,
  formatSats,
  formatTimeUntil,
  formatDateTime,
}: PhaseListProps) {
  if (!collection?.phases || collection.phases.length === 0) {
    return (
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-xl p-6 mt-6">
        <p className="bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent font-semibold">No mint phases configured</p>
        <p className="text-[#a8a8b8] text-sm mt-2">The collection owner needs to set up mint phases</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <details className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 rounded-2xl overflow-hidden" open>
        <summary className="cursor-pointer select-none px-6 py-4 flex items-center justify-between hover:bg-[#9945FF]/5 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-xl">📅</span>
            <span className="text-lg font-bold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">
              {activePhase ? 'All Mint Phases' : 'Mint Phases'} ({collection.phases.length})
            </span>
          </div>
          <span className="text-sm text-[#a8a8b8]">Expand/Collapse</span>
        </summary>
        <div className="px-6 pb-6">
          <div className="space-y-4">
            {[...collection.phases].sort((a, b) => 
              new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
            ).map((phase) => {
              const phaseStatus = getPhaseStatus(phase)
              const isActive = phase.is_active
              const isEnded = phaseStatus.status === 'completed' || phaseStatus.status === 'ended'
              
              if (isEnded) {
                return (
                  <div
                    key={phase.id}
                    className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/20 rounded-xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-[#a8a8b8]">{phase.phase_name}</h3>
                      {phase.whitelist_only && (
                        <span className="px-2 py-0.5 bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-xs font-medium rounded-full border border-[#9945FF]/30">
                          WL
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-1 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-[#a8a8b8] text-xs font-medium rounded border border-[#9945FF]/20">
                      Ended
                    </span>
                  </div>
                )
              }

              return (
                <div
                  key={phase.id}
                  className={`bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border-2 rounded-xl p-5 transition-all ${
                    isActive
                      ? 'border-[#14F195] shadow-lg shadow-[#14F195]/20'
                      : phaseStatus.status === 'upcoming'
                      ? 'border-[#9945FF]/50'
                      : 'border-[#9945FF]/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">{phase.phase_name}</h3>
                      {phase.whitelist_only && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-gradient-to-r from-[#9945FF] to-[#7C3AED] text-white text-xs font-bold rounded-full border border-[#9945FF]/30">
                          Whitelist Only
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        phaseStatus.color === 'green'
                          ? 'bg-gradient-to-r from-[#14F195] to-[#19FB9B] text-[#0a0a0f] animate-pulse border border-[#14F195]/30'
                          : phaseStatus.color === 'blue'
                          ? 'bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] text-white border border-[#9945FF]/30'
                          : phaseStatus.color === 'yellow'
                          ? 'bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] text-white border border-[#DC1FFF]/30'
                          : 'bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-[#a8a8b8] border border-[#9945FF]/20'
                      }`}
                    >
                      {phaseStatus.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-[#a8a8b8]">Price:</span>
                      <span className="ml-2 font-semibold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">
                        {phase.mint_price_sats === 0 ? 'Free' : formatSats(phase.mint_price_sats)}
                      </span>
                    </div>
                    {phase.max_per_wallet && (
                      <div>
                        <span className="text-[#a8a8b8]">Max/Wallet:</span>
                        <span className="ml-2 font-semibold text-white">{phase.max_per_wallet}</span>
                      </div>
                    )}
                    {phase.phase_allocation && (
                      <div>
                        <span className="text-[#a8a8b8]">Allocation:</span>
                        <span className="ml-2 font-semibold text-white">
                          {phase.phase_minted} / {phase.phase_allocation}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#9945FF]/20">
                    {phaseStatus.status === 'upcoming' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#a8a8b8] text-sm">Starts in:</span>
                        <span className="font-bold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent text-lg tabular-nums">
                          {countdown[phase.id] || formatTimeUntil(phase.start_time)}
                        </span>
                      </div>
                    )}
                    {phaseStatus.status === 'active' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#14F195] font-semibold text-sm">
                          🔴 Active Now
                        </span>
                        {phase.end_time && (
                          <div className="flex items-center gap-2">
                            <span className="text-[#a8a8b8] text-sm">Ends in:</span>
                            <span className="font-bold bg-gradient-to-r from-[#DC1FFF] to-[#9945FF] bg-clip-text text-transparent text-lg tabular-nums">
                              {countdown[phase.id] || formatTimeUntil(phase.end_time)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {phaseStatus.status === 'pending' && (
                      <div className="text-[#a8a8b8] text-sm">
                        Started {formatDateTime(phase.start_time)}
                        {phase.end_time && ` · Ends ${formatDateTime(phase.end_time)}`}
                      </div>
                    )}
                    <div className="text-[#a8a8b8] text-xs mt-1">
                      Start: {formatDateTime(phase.start_time)}
                      {phase.end_time && ` · End: ${formatDateTime(phase.end_time)}`}
                    </div>
                  </div>

                  {phaseStatus.status === 'upcoming' && phase.whitelist_only && isConnected && (
                    <div className="mt-4 pt-4 border-t border-[#9945FF]/20">
                      {(() => {
                        const phaseWhitelistStatus = whitelistStatuses[phase.id]
                        const isChecking = checkingWhitelistPhaseId === phase.id
                        
                        if (!phaseWhitelistStatus && !isChecking) {
                          return (
                            <button
                              onClick={() => onCheckWhitelist(phase.id)}
                              className="w-full px-4 py-2 bg-gradient-to-r from-[#9945FF]/20 to-[#7C3AED]/20 hover:from-[#9945FF]/30 hover:to-[#7C3AED]/30 text-white border border-[#9945FF]/30 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 hover:border-[#9945FF]/50"
                            >
                              <span>🔍</span>
                              <span>Check Whitelist Status</span>
                            </button>
                          )
                        }
                        
                        if (isChecking) {
                          return (
                            <div className="w-full px-4 py-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 text-[#a8a8b8] border border-[#9945FF]/30 rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-[#9945FF] border-t-transparent rounded-full animate-spin" />
                              <span>Checking...</span>
                            </div>
                          )
                        }
                        
                        if (phaseWhitelistStatus) {
                          return (
                            <div className="space-y-2">
                              {phaseWhitelistStatus.is_whitelisted ? (
                                <div className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                                  <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                                    <span>✅</span>
                                    <span>You are whitelisted!</span>
                                  </div>
                                  {phaseWhitelistStatus.allocation !== undefined && (
                                    <div className="mt-1 text-xs text-green-300">
                                      Allocation: {phaseWhitelistStatus.minted_count || 0} / {phaseWhitelistStatus.allocation} minted
                                      {phaseWhitelistStatus.remaining_allocation !== undefined && phaseWhitelistStatus.remaining_allocation > 0 && (
                                        <span className="ml-2">({phaseWhitelistStatus.remaining_allocation} remaining)</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                                  <div className="flex items-center gap-2 text-[#EF4444] font-semibold text-sm">
                                    <span>❌</span>
                                    <span>Not on whitelist</span>
                                  </div>
                                  <div className="mt-1 text-xs text-red-300">
                                    Your wallet ({currentAddress?.slice(0, 8)}...{currentAddress?.slice(-6)}) is not whitelisted for this phase
                                  </div>
                                </div>
                              )}
                              <button
                                onClick={() => onCheckWhitelist(phase.id)}
                                className="w-full px-3 py-1.5 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 hover:from-[#1a1a24] hover:to-[#202030] text-[#a8a8b8] border border-[#9945FF]/30 rounded text-xs font-medium transition-all hover:border-[#9945FF]/50"
                              >
                                Refresh Status
                              </button>
                            </div>
                          )
                        }
                        
                        return null
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </details>
    </div>
  )
}

