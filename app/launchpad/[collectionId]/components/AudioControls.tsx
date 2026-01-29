'use client'

interface AudioControlsProps {
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

export function AudioControls({
  audioRef,
  audioEnabled,
  audioError,
  audioVolume,
  showVolumeControls,
  onToggleAudio,
  onToggleVolumeControls,
  onVolumeUp,
  onVolumeDown,
}: AudioControlsProps) {
  return (
    <div className="relative">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={onToggleAudio}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
          aria-label={audioEnabled ? 'Pause audio' : 'Play audio'}
        >
          <span className="text-lg">{audioEnabled ? '⏸️' : '▶️'}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={onToggleVolumeControls}
            onBlur={() => setTimeout(() => onToggleVolumeControls(), 200)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Volume control"
          >
            <span className="text-base">{audioVolume === 0 ? '🔇' : audioVolume < 0.5 ? '🔈' : '🔊'}</span>
            <span className="text-xs font-medium text-gray-700 min-w-[2.5rem]">
              {Math.round(audioVolume * 100)}%
            </span>
          </button>

          {showVolumeControls && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={onVolumeUp}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center justify-center gap-1"
                  aria-label="Volume up"
                >
                  <span>▲</span>
                  <span>Up</span>
                </button>
                <button
                  type="button"
                  onClick={onVolumeDown}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition-colors flex items-center justify-center gap-1"
                  aria-label="Volume down"
                >
                  <span>▼</span>
                  <span>Down</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {audioError && (
          <div className="text-xs text-red-600 px-2 whitespace-nowrap">
            {audioError}
          </div>
        )}
      </div>
    </div>
  )
}

