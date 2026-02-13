'use client'

interface LaunchpadTickerProps {
  activeCollectionsCount: number
  totalMintsCount: number
  completedCollectionsCount: number
  isConnected: boolean
  onLaunchClick: () => void
}

export function LaunchpadTicker({
  activeCollectionsCount,
  totalMintsCount,
  completedCollectionsCount,
  isConnected,
  onLaunchClick,
}: LaunchpadTickerProps) {
  return (
    <div className="bg-[#1a1a1a] border-b border-[#D4AF37]/40 py-3 overflow-hidden">
      <div className="flex items-center gap-8 animate-scroll whitespace-nowrap">
        {/* Repeat content for seamless loop */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 bg-[#D4AF37]"></span>
              <span className="text-xs text-[#808080] uppercase tracking-wider">
                {activeCollectionsCount} Live Mints
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 bg-[#D4AF37]"></span>
              <span className="text-xs text-[#808080] uppercase tracking-wider">
                {totalMintsCount} Total Mints
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 bg-[#D4AF37]"></span>
              <span className="text-xs text-[#808080] uppercase tracking-wider">
                {completedCollectionsCount} Completed Collections
              </span>
            </div>
            {isConnected && (
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 bg-[#D4AF37]"></span>
                <button
                  onClick={onLaunchClick}
                  className="text-xs text-[#D4AF37] hover:text-white uppercase tracking-wider transition-colors"
                >
                  Launch Your Collection →
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
