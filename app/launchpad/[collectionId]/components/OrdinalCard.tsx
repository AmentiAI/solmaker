'use client'

import { memo } from 'react'

interface Ordinal {
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

interface OrdinalCardProps {
  ordinal: Ordinal
  isSelected: boolean
  isLockedByMe: boolean
  isLockedByOther: boolean
  canClick: boolean
  lockExpirySeconds: number | null
  isLocking: boolean
  onClick: (ordinal: Ordinal) => void | Promise<void>
  currentAddress?: string
}

export const OrdinalCard = memo(function OrdinalCard({
  ordinal,
  isSelected,
  isLockedByMe,
  isLockedByOther,
  canClick,
  lockExpirySeconds,
  isLocking,
  onClick,
}: OrdinalCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (canClick && !isLocking) {
      onClick(ordinal)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`
        relative aspect-square rounded-lg overflow-hidden border-2 transition-all
        ${canClick ? 'cursor-pointer' : 'cursor-not-allowed'}
        ${isSelected || isLockedByMe
          ? 'border-[#00d4ff] ring-2 ring-[#00d4ff]/50'
          : canClick
          ? 'border-[#00d4ff]/30 hover:border-[#00d4ff]/50 hover:ring-1 hover:ring-[#00d4ff]/30'
          : 'border-gray-600 opacity-50'
        }
        ${ordinal.is_minted || isLockedByOther ? 'opacity-60' : ''}
        ${isLocking ? 'pointer-events-none opacity-70' : ''}
      `}
    >
      <img
        src={ordinal.thumbnail_url || ordinal.image_url}
        alt={`Ordinal #${ordinal.ordinal_number || 'N/A'}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      
      {/* Overlay status - only show if minted or locked */}
      {(ordinal.is_minted || isLockedByOther || isLockedByMe || isSelected) && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          {ordinal.is_minted ? (
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
              <div className="text-sm font-semibold text-[#00d4ff]">Locked</div>
              {lockExpirySeconds !== null && lockExpirySeconds > 0 ? (
                <div className="text-xs text-white/70 mt-1">
                  {lockExpirySeconds}s
                </div>
              ) : lockExpirySeconds === null ? (
                <div className="text-xs text-white/50 mt-1">Loading...</div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Ordinal number badge */}
      {ordinal.ordinal_number && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          #{ordinal.ordinal_number}
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.ordinal.id === nextProps.ordinal.id &&
    prevProps.ordinal.is_minted === nextProps.ordinal.is_minted &&
    prevProps.ordinal.is_locked === nextProps.ordinal.is_locked &&
    prevProps.ordinal.locked_by === nextProps.ordinal.locked_by &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLockedByMe === nextProps.isLockedByMe &&
    prevProps.isLockedByOther === nextProps.isLockedByOther &&
    prevProps.canClick === nextProps.canClick &&
    prevProps.lockExpirySeconds === nextProps.lockExpirySeconds &&
    prevProps.isLocking === nextProps.isLocking
  )
})

