'use client'

import React from 'react'
import { Phase, Whitelist } from '../types'

interface ReviewStepProps {
  collectionDescription: string
  bannerUrl: string
  creatorRoyaltyWallet: string
  twitterUrl: string
  discordUrl: string
  telegramUrl: string
  websiteUrl: string
  phases: Phase[]
  whitelists: Whitelist[]
  onBack: () => void
  onContinue: () => void
}

export function ReviewStep({
  collectionDescription,
  bannerUrl,
  creatorRoyaltyWallet,
  twitterUrl,
  discordUrl,
  telegramUrl,
  websiteUrl,
  phases,
  whitelists,
  onBack,
  onContinue,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Step 4: Review</h2>
      
      <div className="space-y-6">
        <div>
          <h3 className="font-bold text-white mb-2">Collection Settings</h3>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4 space-y-2 text-sm">
            <p><strong>Description:</strong> {collectionDescription || 'None'}</p>
            <p><strong>Banner:</strong> {bannerUrl ? '✓ Uploaded' : '✗ Missing'}</p>
            <p><strong>Payment Wallet:</strong> {creatorRoyaltyWallet || 'Not set'}</p>
            {twitterUrl && <p><strong>Twitter:</strong> {twitterUrl}</p>}
            {discordUrl && <p><strong>Discord:</strong> {discordUrl}</p>}
            {telegramUrl && <p><strong>Telegram:</strong> {telegramUrl}</p>}
            {websiteUrl && <p><strong>Website:</strong> {websiteUrl}</p>}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-white mb-2">Mint Phases ({phases.length})</h3>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4 space-y-2 text-sm">
            {phases.length === 0 ? (
              <p className="text-white/60">No phases configured</p>
            ) : (
              phases.map((phase) => (
                <p key={phase.id}>
                  <strong>{phase.phase_name}:</strong> {phase.mint_price_sats ? `${(phase.mint_price_sats / 1000000000).toFixed(4)} SOL` : 'Free'}, starts {new Date(phase.start_time).toLocaleString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short'
                  })}
                  {phase.end_time && `, ends ${new Date(phase.end_time).toLocaleString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short'
                  })}`}
                </p>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-white mb-2">Whitelists ({whitelists.length})</h3>
          <div className="cosmic-card border border-[#00d4ff]/30 rounded-lg p-4 space-y-2 text-sm">
            {whitelists.length === 0 ? (
              <p className="text-white/60">No whitelists configured</p>
            ) : (
              whitelists.map((wl) => (
                <p key={wl.id}>
                  <strong>{wl.name}:</strong> {wl.entries_count} addresses
                </p>
              ))
            )}
          </div>
        </div>
      </div>

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

