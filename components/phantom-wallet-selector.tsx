'use client'

import { useState } from 'react'

interface PhantomWalletSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelectSolana: () => void
}

export function PhantomWalletSelector({
  isOpen,
  onClose,
  onSelectSolana,
}: PhantomWalletSelectorProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] border border-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-3xl">👻</span>
            <span>Select Wallet Type</span>
          </h2>
          <button
            onClick={onClose}
            className="text-[#a8a8b8] hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-[#a8a8b8] mb-6">
          Connect your Phantom wallet to use Solana network.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => {
              onSelectSolana()
              onClose()
            }}
            className="w-full p-4 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-2 border-purple-500/50 hover:border-purple-500 rounded-lg transition-all hover:scale-[1.02] flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center group-hover:bg-purple-600/30 transition-colors">
              <span className="text-2xl">◎</span>
            </div>
            <div className="flex-1 text-left">
              <div className="text-white font-semibold text-lg">Solana</div>
              <div className="text-[#a8a8b8] text-sm">Connect with Solana network</div>
            </div>
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 px-4 py-2 text-[#a8a8b8] hover:text-white transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
