'use client'

interface OwnerMintInterfaceProps {
  collectionId: string
  totalSupply: number
  mintedCount: number
}

export default function OwnerMintInterface({ collectionId, totalSupply, mintedCount }: OwnerMintInterfaceProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Owner Mint</h3>
        <p className="text-white/70 mb-6">
          Mint NFTs from your collection to specific Solana wallet addresses. 
          Perfect for team allocation, giveaways, or pre-launch distribution.
        </p>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/20 rounded-lg p-4">
            <div className="text-[#a8a8b8]/80 text-sm">Total Supply</div>
            <div className="text-white text-2xl font-bold">{totalSupply}</div>
          </div>
          <div className="bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/20 rounded-lg p-4">
            <div className="text-[#a8a8b8]/80 text-sm">Minted</div>
            <div className="text-white text-2xl font-bold">{mintedCount}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Recipient Wallet Address (Solana)
            </label>
            <input
              type="text"
              placeholder="Enter Solana wallet address..."
              className="w-full px-4 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg text-white placeholder:text-white/50 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Number of NFTs to Mint
            </label>
            <input
              type="number"
              min="1"
              max={totalSupply - mintedCount}
              defaultValue="1"
              className="w-full px-4 py-3 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#00d4ff]/30 rounded-lg text-white"
            />
            <p className="text-xs text-white/50 mt-1">
              Available to mint: {totalSupply - mintedCount}
            </p>
          </div>

          <button
            className="w-full px-6 py-3 bg-[#00d4ff] hover:bg-[#14F195] text-white font-semibold rounded-lg transition-colors"
            disabled
          >
            Mint to Wallet (Coming Soon)
          </button>

          <p className="text-xs text-white/50 text-center">
            Owner minting functionality will be available in a future update
          </p>
        </div>
      </div>
    </div>
  )
}
