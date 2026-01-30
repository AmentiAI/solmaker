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
    <div className="sticky top-0 z-50 -mx-6 px-6 py-4 bg-gradient-to-br from-[#0a0a0f] via-[#14141e] to-[#1a1a24] backdrop-blur border-b border-[#9945FF]/30 mb-6" style={{ pointerEvents: 'auto', isolation: 'isolate' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="inline-flex items-center text-[#a8a8b8] hover:text-[#9945FF] transition-colors font-semibold"
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
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-[#14141e]/90 to-[#1a1a24]/90 rounded-2xl border border-[#9945FF]/20 backdrop-blur-md border border-[#9945FF]/30 hover:border-[#9945FF]/50 hover:shadow-lg hover:shadow-[#9945FF]/20 transition-all flex items-center gap-2"
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

