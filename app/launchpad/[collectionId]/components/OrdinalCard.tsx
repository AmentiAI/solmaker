'use client'

import { memo } from 'react'

interface Nft {
  id: string
  ordinal_number: number | null
  image_url: string
  thumbnail_url: string | null
  compressed_size_kb: number | null
  is_minted: boolean
  is_locked: boolean
  locked_until: string | null
  locked_by: string | null
}

interface NftCardProps {
  nft: Nft
  isSelected: boolean
  isLockedByMe: boolean
  isLockedByOther: boolean
  canClick: boolean
  lockExpirySeconds: number | null
  isLocking: boolean
  onClick: (nft: Nft) => void | Promise<void>
  currentAddress?: string
}

export const NftCard = memo(function NftCard({
  nft,
  isSelected,
  isLockedByMe,
  isLockedByOther,
  canClick,
  lockExpirySeconds,
  isLocking,
  onClick,
}: NftCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (canClick && !isLocking) {
      onClick(nft)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`
        relative aspect-square rounded-lg overflow-hidden border-2 transition-all
        ${canClick ? 'cursor-pointer' : 'cursor-not-allowed'}
        ${isSelected || isLockedByMe
          ? 'border-[#9945FF] ring-2 ring-[#9945FF]/50'
          : canClick
          ? 'border-[#9945FF]/30 hover:border-[#9945FF]/50 hover:ring-1 hover:ring-[#9945FF]/30'
          : 'border-[#9945FF]/20 opacity-50'
        }
        ${nft.is_minted || isLockedByOther ? 'opacity-60' : ''}
        ${isLocking ? 'pointer-events-none opacity-70' : ''}
      `}
    >
      <img
        src={nft.thumbnail_url || nft.image_url}
        alt={`NFT #${nft.ordinal_number || 'N/A'}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      
      {/* Overlay status - only show if minted or locked */}
      {(nft.is_minted || isLockedByOther || isLockedByMe || isSelected) && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          {nft.is_minted ? (
            <div className="text-center">
              <div className="text-2xl mb-1">✓</div>
              <div className="text-sm font-semibold text-white">Minted</div>
            </div>
          ) : isLockedByOther ? (
            <div className="text-center">
              <div className="text-2xl mb-1">🔒</div>
              <div className="text-sm font-semibold text-white">Locked</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-2xl mb-1">🔒</div>
              <div className="text-sm font-semibold bg-gradient-to-r from-[#9945FF] to-[#DC1FFF] bg-clip-text text-transparent">Locked</div>
              {lockExpirySeconds !== null && lockExpirySeconds > 0 ? (
                <div className="text-xs text-[#a8a8b8] mt-1">
                  {lockExpirySeconds}s
                </div>
              ) : lockExpirySeconds === null ? (
                <div className="text-xs text-[#a8a8b8] mt-1">Loading...</div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* NFT number badge */}
      {nft.ordinal_number && (
        <div className="absolute top-2 left-2 bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 border border-[#9945FF]/30 text-white text-xs px-2 py-1 rounded">
          #{nft.ordinal_number}
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.nft.id === nextProps.nft.id &&
    prevProps.nft.is_minted === nextProps.nft.is_minted &&
    prevProps.nft.is_locked === nextProps.nft.is_locked &&
    prevProps.nft.locked_by === nextProps.nft.locked_by &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLockedByMe === nextProps.isLockedByMe &&
    prevProps.isLockedByOther === nextProps.isLockedByOther &&
    prevProps.canClick === nextProps.canClick &&
    prevProps.lockExpirySeconds === nextProps.lockExpirySeconds &&
    prevProps.isLocking === nextProps.isLocking
  )
})

/** @deprecated Use NftCard instead */
export const OrdinalCard = NftCard

