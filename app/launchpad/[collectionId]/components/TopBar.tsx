'use client'

import Link from 'next/link'
import { AudioControls } from './AudioControls'

interface TopBarProps {
  isConnected: boolean
  onShowHistory: () => void
  audioUrl?: string
  audioRef: React.RefObject<HTMLAudioElement>
  audioEnabled: boolean
  audioError: string | null
  audioVolume: number
  showVolumeControls: boolean
  onToggleAudio: () => Promise<void>
  onToggleVolumeControls: () => void
  onVolumeUp: () => void
  onVolumeDown: () => void
}

export function TopBar({
  isConnected,
  onShowHistory,
  audioUrl,
  audioRef,
  audioEnabled,
  audioError,
  audioVolume,
  showVolumeControls,
  onToggleAudio,
  onToggleVolumeControls,
  onVolumeUp,
  onVolumeDown,
}: TopBarProps) {
  return (
    <div className="sticky top-0 z-50 -mx-6 px-6 py-4 bg-[#0a0e27]/90 backdrop-blur border-b border-[#00d4ff]/30 mb-6" style={{ pointerEvents: 'auto', isolation: 'isolate' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="inline-flex items-center text-gray-300 hover:text-cosmic-blue transition-colors font-semibold"
            style={{ pointerEvents: 'auto', position: 'relative', zIndex: 100 }}
          >
            ← Back
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isConnected && (
            <button
              type="button"
              onClick={onShowHistory}
              className="px-4 py-2 rounded-lg cosmic-card border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 hover:shadow-sm transition-all flex items-center gap-2"
            >
              <span className="text-lg">📜</span>
              <span className="text-sm font-semibold text-white">History</span>
            </button>
          )}
          {audioUrl && (
            <AudioControls
              audioRef={audioRef}
              audioEnabled={audioEnabled}
              audioError={audioError}
              audioVolume={audioVolume}
              showVolumeControls={showVolumeControls}
              onToggleAudio={onToggleAudio}
              onToggleVolumeControls={onToggleVolumeControls}
              onVolumeUp={onVolumeUp}
              onVolumeDown={onVolumeDown}
            />
          )}
        </div>
      </div>
    </div>
  )
}

